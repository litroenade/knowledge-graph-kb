"""Answer service."""

from time import perf_counter
from typing import Any

from src.config import Settings
from src.kb.common import (
    build_contains_edge_id,
    build_mention_edge_id,
    build_paragraph_node_id,
    build_relation_edge_id,
    build_source_node_id,
)
from src.kb.ingestion.evidence import (
    RENDER_KIND_ROW_RECORD,
    RENDER_KIND_SHEET_SUMMARY,
    RENDER_KIND_TEXT,
    RENDER_KIND_WORKSHEET_PREVIEW,
    build_paragraph_render_payload,
)
from src.kb.ingestion.excel import normalize_sheet_name
from src.kb.infrastructure.providers import OpenAiGateway
from src.kb.infrastructure.storage import AnswerReadStore, RecordStore, SourceStore, StaleVectorIndexError
from src.utils.logger import get_logger

from ..retrieval.hybrid import HybridAnswerRetriever
from ..retrieval.types import (
    KBScope,
    ParagraphHit,
    RetrievalLaneTrace,
    RetrievalRequest,
    RetrievalTrace,
    ScopedSourceVersion,
)

EMPTY_QUERY_MESSAGE = "Please enter a question before asking the knowledge base."
NO_HIT_MESSAGE = "No matching evidence was found in the selected scope."
EMPTY_SCOPE_MESSAGE = "No readable sources were found in the selected scope."
STALE_INDEX_MESSAGE = "The vector index does not match the active embedding model. Re-import and try again."
logger = get_logger(__name__)


class AnswerService:
    """Coordinate scoped retrieval, evidence shaping, and answer generation."""

    def __init__(
        self,
        *,
        settings: Settings,
        source_store: SourceStore,
        answer_read_store: AnswerReadStore,
        record_store: RecordStore,
        hybrid_answer_retriever: HybridAnswerRetriever,
        openai_gateway: OpenAiGateway,
    ) -> None:
        self.settings = settings
        self.source_store = source_store
        self.answer_read_store = answer_read_store
        self.record_store = record_store
        self.hybrid_answer_retriever = hybrid_answer_retriever
        self.gateway = openai_gateway

    def answer(
        self,
        *,
        query: str,
        scope: dict[str, Any],
        worksheet_names: list[str] | None = None,
        top_k: int = 6,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        normalized_query = str(query or "").strip()
        if not normalized_query:
            return self._empty_response(
                EMPTY_QUERY_MESSAGE,
                scope=KBScope(mode="all").to_dict(),
                status="empty_query",
                execution_message="The question was empty, so retrieval was skipped.",
            )

        normalized_scope = KBScope.from_payload(scope)
        scope_pairs = self.source_store.resolve_scope_pairs(normalized_scope)
        if not scope_pairs:
            return self._empty_response(
                EMPTY_SCOPE_MESSAGE,
                scope=normalized_scope.to_dict(),
                status="empty_scope",
                execution_message="The selected scope did not resolve to any active source snapshots.",
            )

        request = RetrievalRequest(
            query=normalized_query,
            scope=normalized_scope,
            scope_pairs=[],
            worksheet_names=list(worksheet_names or []),
            top_k=max(1, min(top_k, self.settings.query_context_chunks)),
        )
        request.scope_pairs = [
            ScopedSourceVersion(
                source_id=str(pair["source_id"]),
                version_id=str(pair["version_id"]),
                source_name=str(pair.get("source_name") or "") or None,
                file_path=str(pair.get("file_path") or "") or None,
            )
            for pair in scope_pairs
        ]
        try:
            retrieval_result = self.hybrid_answer_retriever.retrieve(request)
        except StaleVectorIndexError:
            return self._empty_response(
                STALE_INDEX_MESSAGE,
                scope=normalized_scope.to_dict(),
                status="stale_index",
                retrieval_mode="vector",
                execution_message="The vector index is stale, so answer generation was skipped.",
                retrieval_trace=self._empty_trace().to_dict(),
            )

        if not retrieval_result.hits:
            return self._empty_response(
                NO_HIT_MESSAGE,
                scope=normalized_scope.to_dict(),
                retrieval_mode=retrieval_result.retrieval_mode,
                execution_message="No usable evidence was found, so answer generation was skipped.",
                retrieval_trace=retrieval_result.trace.to_dict(),
            )

        return self._build_answer_response(
            query=normalized_query,
            scope=normalized_scope,
            hits=retrieval_result.hits,
            retrieval_mode=retrieval_result.retrieval_mode,
            retrieval_trace=retrieval_result.trace,
            conversation_history=conversation_history,
            extra_highlighted_node_ids=retrieval_result.highlighted_node_ids,
            extra_highlighted_edge_ids=retrieval_result.highlighted_edge_ids,
        )

    def hydrate_citations(self, citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not citations:
            return []
        paragraph_ids = [
            str(item.get("paragraph_id") or "").strip()
            for item in citations
            if str(item.get("paragraph_id") or "").strip()
        ]
        if not paragraph_ids:
            return [self._with_render_defaults(dict(item)) for item in citations]

        paragraphs = self.answer_read_store.get_paragraphs_with_sources(paragraph_ids)
        paragraph_by_id = {str(row["id"]): row for row in paragraphs}
        entity_links = self.answer_read_store.list_entity_links_for_paragraphs(paragraph_ids)
        entity_links_by_paragraph: dict[str, list[dict[str, Any]]] = {}
        for link in entity_links:
            entity_links_by_paragraph.setdefault(str(link["paragraph_id"]), []).append(link)
        record_rows_by_paragraph, worksheet_rows_by_ref = self._load_render_context(paragraph_ids)

        hydrated: list[dict[str, Any]] = []
        for item in citations:
            citation = dict(item)
            paragraph_id = str(citation.get("paragraph_id") or "").strip()
            paragraph = paragraph_by_id.get(paragraph_id)
            if paragraph is None:
                hydrated.append(self._with_render_defaults(citation))
                continue
            record_row = record_rows_by_paragraph.get(paragraph_id)
            worksheet_rows = self._worksheet_rows_for_record(record_row, worksheet_rows_by_ref)
            snippet = str(citation.get("snippet") or paragraph.get("content") or "")[:420]
            anchor_node_ids = self._normalize_anchor_node_ids(
                citation.get("anchor_node_ids"),
                fallback=self._citation_anchor_node_ids(entity_links_by_paragraph.get(paragraph_id, [])),
            )
            preferred_anchor_node_id = self._preferred_anchor_node_id(
                citation.get("preferred_anchor_node_id"),
                anchor_node_ids=anchor_node_ids,
            )
            render_payload = build_paragraph_render_payload(
                paragraph=paragraph,
                worksheet_rows=worksheet_rows,
                highlighted_columns=list(
                    dict(citation.get("render_metadata") or {}).get("highlighted_columns") or []
                ),
            )
            hydrated.append(
                {
                    **citation,
                    "source_id": str(paragraph.get("source_id") or citation.get("source_id") or ""),
                    "version_id": str(paragraph.get("version_id") or citation.get("version_id") or ""),
                    "source_name": str(paragraph.get("source_name") or citation.get("source_name") or ""),
                    "source_kind": str(
                        paragraph.get("source_kind") or citation.get("source_kind") or ""
                    )
                    or None,
                    "file_path": str(paragraph.get("file_path") or citation.get("file_path") or "") or None,
                    "worksheet_name": self._worksheet_name_from_payload(paragraph, render_payload, citation),
                    "worksheet_key": self._worksheet_key_from_payload(paragraph, record_row, citation),
                    "row_index": self._row_index_from_payload(paragraph, record_row, citation),
                    "anchor_row_index": self._row_index_from_payload(paragraph, record_row, citation),
                    "page_number": self._optional_int(
                        dict(paragraph.get("metadata") or {}).get("page_number")
                        or dict(render_payload.get("render_metadata") or {}).get("page_number")
                        or citation.get("page_number")
                    ),
                    "paragraph_position": self._optional_int(
                        paragraph.get("position") or citation.get("paragraph_position")
                    ),
                    "winning_lane": str(citation.get("winning_lane") or "").strip() or None,
                    "anchor_node_ids": anchor_node_ids,
                    "preferred_anchor_node_id": preferred_anchor_node_id,
                    "matched_fields": self._normalize_string_list(
                        citation.get("matched_fields")
                        or dict(render_payload.get("render_metadata") or {}).get("highlighted_columns")
                    ),
                    "snippet": snippet,
                    "excerpt": snippet,
                    **render_payload,
                }
            )
        return hydrated

    def _build_answer_response(
        self,
        *,
        query: str,
        scope: KBScope,
        hits: list[ParagraphHit],
        retrieval_mode: str,
        retrieval_trace: RetrievalTrace,
        conversation_history: list[dict[str, str]] | None,
        extra_highlighted_node_ids: list[str],
        extra_highlighted_edge_ids: list[str],
    ) -> dict[str, Any]:
        paragraph_ids = [hit.paragraph_id for hit in hits]
        paragraphs = self.answer_read_store.get_paragraphs_with_sources(paragraph_ids)
        paragraph_by_id = {str(row["id"]): row for row in paragraphs}
        entity_links = self.answer_read_store.list_entity_links_for_paragraphs(paragraph_ids)
        relation_links = self.answer_read_store.list_relation_links_for_paragraphs(paragraph_ids)
        entity_links_by_paragraph: dict[str, list[dict[str, Any]]] = {}
        relation_links_by_paragraph: dict[str, list[dict[str, Any]]] = {}
        for link in entity_links:
            entity_links_by_paragraph.setdefault(str(link["paragraph_id"]), []).append(link)
        for link in relation_links:
            relation_links_by_paragraph.setdefault(str(link["paragraph_id"]), []).append(link)

        record_rows_by_paragraph, worksheet_rows_by_ref = self._load_render_context(paragraph_ids)
        citations: list[dict[str, Any]] = []
        context_blocks: list[dict[str, str]] = []
        highlighted_node_ids: list[str] = list(extra_highlighted_node_ids)
        highlighted_edge_ids: list[str] = list(extra_highlighted_edge_ids)

        for hit in hits:
            paragraph = paragraph_by_id.get(hit.paragraph_id)
            if paragraph is None:
                continue
            source_id = str(paragraph["source_id"])
            version_id = str(paragraph.get("version_id") or hit.version_id)
            source_name = str(paragraph["source_name"])
            snippet = str(paragraph["content"])[:420]
            record_row = record_rows_by_paragraph.get(hit.paragraph_id)
            worksheet_rows = self._worksheet_rows_for_record(record_row, worksheet_rows_by_ref)
            matched_columns = [
                str(value)
                for value in list(hit.metadata.get("matched_cells") or [])
                if str(value).strip()
            ]
            anchor_node_ids = self._citation_anchor_node_ids(entity_links_by_paragraph.get(hit.paragraph_id, []))
            render_payload = build_paragraph_render_payload(
                paragraph=paragraph,
                worksheet_rows=worksheet_rows,
                highlighted_columns=matched_columns,
            )
            citations.append(
                {
                    "paragraph_id": hit.paragraph_id,
                    "chunk_id": hit.chunk_id or hit.paragraph_id,
                    "source_id": source_id,
                    "version_id": version_id,
                    "source_name": source_name,
                    "file_path": str(paragraph.get("file_path") or hit.file_path or "") or None,
                    "excerpt": snippet,
                    "snippet": snippet,
                    "score": float(hit.score),
                    "match_reason": self._citation_match_reason(retriever=hit.retriever, match_type=hit.match_type),
                    "matched_fields": self._normalize_string_list(matched_columns),
                    "source_kind": str(paragraph.get("source_kind") or "").strip() or None,
                    "worksheet_name": self._worksheet_name_from_payload(paragraph, render_payload),
                    "worksheet_key": self._worksheet_key_from_payload(paragraph, record_row),
                    "row_index": self._row_index_from_payload(paragraph, record_row),
                    "anchor_row_index": self._row_index_from_payload(paragraph, record_row),
                    "page_number": self._optional_int(
                        dict(paragraph.get("metadata") or {}).get("page_number")
                        or dict(render_payload.get("render_metadata") or {}).get("page_number")
                    ),
                    "paragraph_position": self._optional_int(paragraph.get("position")),
                    "winning_lane": str(hit.retriever or "").strip() or None,
                    "anchor_node_ids": anchor_node_ids,
                    "preferred_anchor_node_id": self._preferred_anchor_node_id(None, anchor_node_ids=anchor_node_ids),
                    "start_offset": hit.start_offset,
                    "end_offset": hit.end_offset,
                    **render_payload,
                }
            )
            context_blocks.append({"document_name": source_name, "excerpt": snippet})
            highlighted_node_ids.extend([build_source_node_id(source_id), build_paragraph_node_id(hit.paragraph_id)])
            highlighted_edge_ids.append(build_contains_edge_id(source_id, hit.paragraph_id))

            for link in entity_links_by_paragraph.get(hit.paragraph_id, []):
                entity_id = str(link["entity_id"])
                highlighted_node_ids.append(f"entity:{entity_id}")
                highlighted_edge_ids.append(build_mention_edge_id(hit.paragraph_id, entity_id))

            for link in relation_links_by_paragraph.get(hit.paragraph_id, []):
                highlighted_edge_ids.append(build_relation_edge_id(str(link["relation_id"])))

        if not citations:
            return self._empty_response(
                NO_HIT_MESSAGE,
                scope=scope.to_dict(),
                retrieval_mode=retrieval_mode,
                execution_message="No usable evidence was found, so answer generation was skipped.",
                retrieval_trace=retrieval_trace.to_dict(),
            )

        llm_start = perf_counter()
        answer_text = self.gateway.generate_answer(
            query,
            context_blocks,
            conversation_turns=conversation_history or None,
        )
        llm_ms = round((perf_counter() - llm_start) * 1000.0, 2)
        sources = self._build_source_summary(citations)
        return {
            "answer": answer_text,
            "citations": citations,
            "sources": sources,
            "scope": scope.to_dict(),
            "highlighted_node_ids": self._deduplicate(highlighted_node_ids),
            "highlighted_edge_ids": self._deduplicate(highlighted_edge_ids),
            "execution": self._build_execution(
                status="answered",
                retrieval_mode=retrieval_mode,
                model_invoked=True,
                matched_paragraph_count=len(citations),
                message=f"The system answered from {len(citations)} evidence chunks.",
            ),
            "retrieval_trace": {
                **retrieval_trace.to_dict(),
                "generation_ms": llm_ms,
                "scope": scope.to_dict(),
            },
        }

    def _build_source_summary(self, citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        aggregated: dict[tuple[str, str], dict[str, Any]] = {}
        for citation in citations:
            key = (str(citation.get("source_id") or ""), str(citation.get("version_id") or ""))
            entry = aggregated.setdefault(
                key,
                {
                    "source_id": key[0],
                    "version_id": key[1],
                    "source_name": str(citation.get("source_name") or ""),
                    "file_path": str(citation.get("file_path") or "") or None,
                    "citation_count": 0,
                    "snippet": str(citation.get("snippet") or ""),
                },
            )
            entry["citation_count"] = int(entry["citation_count"]) + 1
        return list(aggregated.values())

    def _load_render_context(
        self,
        paragraph_ids: list[str],
    ) -> tuple[dict[str, dict[str, Any]], dict[tuple[str, str, str, int], list[dict[str, Any]]]]:
        record_rows_by_paragraph = self.record_store.list_rows_by_paragraph_ids(paragraph_ids)
        row_windows = [
            (
                str(row.get("source_id") or ""),
                str(row.get("version_id") or ""),
                str(row.get("worksheet_key") or row.get("worksheet_name") or ""),
                int(row.get("row_index") or 0),
            )
            for row in record_rows_by_paragraph.values()
            if str(row.get("source_id") or "").strip()
            and str(row.get("worksheet_key") or row.get("worksheet_name") or "").strip()
            and int(row.get("row_index") or 0) > 0
        ]
        worksheet_rows_by_ref = self.record_store.list_rows_in_windows(row_windows, radius=1)
        return record_rows_by_paragraph, worksheet_rows_by_ref

    def _worksheet_rows_for_record(
        self,
        record_row: dict[str, Any] | None,
        worksheet_rows_by_ref: dict[tuple[str, str, str, int], list[dict[str, Any]]],
    ) -> list[dict[str, Any]]:
        if record_row is None:
            return []
        ref = (
            str(record_row.get("source_id") or ""),
            str(record_row.get("version_id") or ""),
            str(record_row.get("worksheet_key") or record_row.get("worksheet_name") or ""),
            int(record_row.get("row_index") or 0),
        )
        return list(worksheet_rows_by_ref.get(ref, []))

    def _with_render_defaults(self, citation: dict[str, Any]) -> dict[str, Any]:
        render_kind = str(citation.get("render_kind") or RENDER_KIND_TEXT)
        if render_kind not in {
            RENDER_KIND_TEXT,
            RENDER_KIND_ROW_RECORD,
            RENDER_KIND_SHEET_SUMMARY,
            RENDER_KIND_WORKSHEET_PREVIEW,
        }:
            render_kind = RENDER_KIND_TEXT
        return {
            **citation,
            "match_reason": str(citation.get("match_reason") or "").strip() or None,
            "matched_fields": self._normalize_string_list(citation.get("matched_fields")),
            "source_kind": str(citation.get("source_kind") or "").strip() or None,
            "file_path": str(citation.get("file_path") or "").strip() or None,
            "worksheet_name": str(citation.get("worksheet_name") or "").strip() or None,
            "worksheet_key": str(citation.get("worksheet_key") or "").strip() or None,
            "row_index": self._optional_int(citation.get("row_index")),
            "anchor_row_index": self._optional_int(citation.get("anchor_row_index") or citation.get("row_index")),
            "page_number": self._optional_int(citation.get("page_number")),
            "paragraph_position": self._optional_int(citation.get("paragraph_position")),
            "winning_lane": str(citation.get("winning_lane") or "").strip() or None,
            "anchor_node_ids": self._normalize_anchor_node_ids(citation.get("anchor_node_ids")),
            "preferred_anchor_node_id": self._preferred_anchor_node_id(
                citation.get("preferred_anchor_node_id"),
                anchor_node_ids=self._normalize_anchor_node_ids(citation.get("anchor_node_ids")),
            ),
            "render_kind": render_kind,
            "rendered_html": citation.get("rendered_html"),
            "render_metadata": dict(citation.get("render_metadata") or {}),
            "snippet": str(citation.get("snippet") or citation.get("excerpt") or ""),
        }

    def _citation_anchor_node_ids(self, entity_links: list[dict[str, Any]]) -> list[str]:
        anchors: list[str] = []
        seen: set[str] = set()
        for link in entity_links:
            entity_id = str(link.get("entity_id") or "").strip()
            if not entity_id:
                continue
            node_id = f"entity:{entity_id}"
            if node_id in seen:
                continue
            seen.add(node_id)
            anchors.append(node_id)
        return anchors

    def _normalize_anchor_node_ids(self, value: Any, *, fallback: list[str] | None = None) -> list[str]:
        anchors = [
            node_id
            for node_id in (str(item).strip() for item in list(value or []))
            if node_id.startswith("entity:")
        ]
        if anchors:
            return self._deduplicate(anchors)
        return list(fallback or [])

    def _preferred_anchor_node_id(self, value: Any, *, anchor_node_ids: list[str]) -> str | None:
        preferred = str(value or "").strip()
        if preferred:
            return preferred
        if len(anchor_node_ids) == 1:
            return anchor_node_ids[0]
        return None

    def _normalize_string_list(self, value: Any) -> list[str]:
        return [text for text in (str(item).strip() for item in list(value or [])) if text]

    def _optional_int(self, value: Any) -> int | None:
        if value is None or value == "":
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _worksheet_name_from_payload(
        self,
        paragraph: dict[str, Any],
        render_payload: dict[str, Any],
        citation: dict[str, Any] | None = None,
    ) -> str | None:
        metadata = dict(paragraph.get("metadata") or {})
        render_metadata = dict(render_payload.get("render_metadata") or {})
        fallback = dict(citation or {})
        worksheet_name = (
            str(render_metadata.get("worksheet_name") or "").strip()
            or str(metadata.get("worksheet_name") or "").strip()
            or str(fallback.get("worksheet_name") or "").strip()
        )
        return worksheet_name or None

    def _worksheet_key_from_payload(
        self,
        paragraph: dict[str, Any],
        record_row: dict[str, Any] | None,
        citation: dict[str, Any] | None = None,
    ) -> str | None:
        metadata = dict(paragraph.get("metadata") or {})
        fallback = dict(citation or {})
        worksheet_key = (
            str(record_row.get("worksheet_key") or "").strip()
            if record_row is not None
            else ""
        )
        if worksheet_key:
            return worksheet_key
        normalized_key = normalize_sheet_name(
            str(metadata.get("worksheet_key") or metadata.get("worksheet_name") or fallback.get("worksheet_key") or fallback.get("worksheet_name") or "")
        )
        return normalized_key or None

    def _row_index_from_payload(
        self,
        paragraph: dict[str, Any],
        record_row: dict[str, Any] | None,
        citation: dict[str, Any] | None = None,
    ) -> int | None:
        metadata = dict(paragraph.get("metadata") or {})
        fallback = dict(citation or {})
        return self._optional_int(
            (
                record_row.get("row_index")
                if record_row is not None
                else None
            )
            or metadata.get("row_index")
            or fallback.get("anchor_row_index")
            or fallback.get("row_index")
        )

    def _citation_match_reason(self, *, retriever: str, match_type: str) -> str:
        match_type_map = {
            "record_key_exact": "Exact record key match",
            "cell_exact": "Exact cell match",
            "cell_partial": "Partial cell match",
            "token_overlap": "Structured token overlap",
            "semantic": "Semantic vector match",
        }
        if match_type in match_type_map:
            return match_type_map[match_type]
        return {
            "structured": "Structured retrieval match",
            "vector": "Vector retrieval match",
            "hybrid": "Hybrid fusion match",
            "ppr": "Graph rerank enrichment",
        }.get(retriever, "Retrieval match")

    def _build_execution(
        self,
        *,
        status: str,
        retrieval_mode: str,
        model_invoked: bool,
        matched_paragraph_count: int,
        message: str,
    ) -> dict[str, Any]:
        return {
            "status": status,
            "retrieval_mode": retrieval_mode,
            "model_invoked": model_invoked,
            "matched_paragraph_count": matched_paragraph_count,
            "message": message,
        }

    def _empty_response(
        self,
        message: str,
        *,
        scope: dict[str, Any],
        status: str = "no_hit",
        retrieval_mode: str = "none",
        execution_message: str | None = None,
        retrieval_trace: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "answer": message,
            "citations": [],
            "sources": [],
            "scope": scope,
            "highlighted_node_ids": [],
            "highlighted_edge_ids": [],
            "execution": self._build_execution(
                status=status,
                retrieval_mode=retrieval_mode,
                model_invoked=False,
                matched_paragraph_count=0,
                message=execution_message or message,
            ),
            "retrieval_trace": retrieval_trace or self._empty_trace().to_dict(),
        }

    def _empty_trace(self) -> RetrievalTrace:
        lane = RetrievalLaneTrace(
            executed=False,
            skipped_reason="not_executed",
            hit_count=0,
            latency_ms=0.0,
            top_paragraph_ids=[],
        )
        return RetrievalTrace(structured=lane, vector=lane, fusion=lane, ppr=lane, total_ms=0.0)

    def _deduplicate(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            result.append(value)
        return result

