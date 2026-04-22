"""Vector-backed paragraph retriever."""

from time import perf_counter

from src.kb.infrastructure.providers import OpenAiGateway
from src.kb.infrastructure.storage import StaleVectorIndexError, VectorIndex
from src.utils.logger import get_logger

from ..services.model import ModelConfigService
from .types import ParagraphHit, RetrievalLaneTrace, RetrievalRequest

logger = get_logger(__name__)


class VectorParagraphRetriever:
    """Return paragraph hits from the vector index."""

    def __init__(
        self,
        *,
        model_config_service: ModelConfigService,
        vector_index: VectorIndex,
        openai_gateway: OpenAiGateway,
    ) -> None:
        self.model_config_service = model_config_service
        self.vector = vector_index
        self.gateway = openai_gateway

    def retrieve(
        self,
        request: RetrievalRequest,
        *,
        paragraph_ids: list[str] | None = None,
    ) -> tuple[list[ParagraphHit], RetrievalLaneTrace]:
        start_time = perf_counter()
        normalized_query = str(request.query or "").strip()
        if not normalized_query:
            return [], self._trace(executed=False, skipped_reason="empty_query", start_time=start_time, hits=[])

        logger.debug(
            "Vector retrieval started: query_length=%s top_k=%s scoped_pair_count=%s paragraph_scope_count=%s",
            len(normalized_query),
            request.top_k,
            len(request.scope_pairs or []),
            len(paragraph_ids or []),
        )
        query_embedding = self.gateway.generate_embeddings([normalized_query])[0]
        results = self.vector.search(
            model_signature=self.model_config_service.embedding_model_signature(),
            query_embedding=query_embedding,
            limit=max(1, request.top_k),
            scope_pairs=[pair.key() for pair in request.scope_pairs] or None,
            paragraph_ids=paragraph_ids,
        )

        hits = [
            ParagraphHit(
                paragraph_id=result.paragraph_id,
                source_id=result.source_id,
                version_id=result.version_id,
                score=float(result.similarity),
                rank=index,
                retriever="vector",
                match_type="semantic",
                file_path=result.file_path,
                metadata={
                    "node_id": result.node_id,
                    "knowledge_type": result.knowledge_type,
                    "text": result.text,
                    "distance": float(result.distance),
                },
            )
            for index, result in enumerate(results, start=1)
        ]
        return hits, self._trace(executed=True, skipped_reason=None, start_time=start_time, hits=hits)

    def _trace(
        self,
        *,
        executed: bool,
        skipped_reason: str | None,
        start_time: float,
        hits: list[ParagraphHit],
    ) -> RetrievalLaneTrace:
        return RetrievalLaneTrace(
            executed=executed,
            skipped_reason=skipped_reason,
            hit_count=len(hits),
            latency_ms=round((perf_counter() - start_time) * 1000.0, 2),
            top_paragraph_ids=[hit.paragraph_id for hit in hits[:6]],
        )


__all__ = ["StaleVectorIndexError", "VectorParagraphRetriever"]

