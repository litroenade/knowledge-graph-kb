"""Source browsing and rendering service."""

from collections import defaultdict
from math import ceil
from typing import Any

from src.kb.ingestion.evidence import (
    build_paragraph_render_payload,
    build_worksheet_preview_payload,
)
from src.kb.use_cases.retrieval.types import KBScope
from src.kb.ingestion.excel import normalize_column_name, normalize_sheet_name
from src.kb.infrastructure.storage import RecordStore, SourceStore
from src.utils.logger import get_logger

logger = get_logger(__name__)

WORKSHEET_PREVIEW_PAGE_SIZE_MAX = 200


class SourceService:
    """Provide source list, detail, worksheet preview, and paragraph rendering helpers."""

    def __init__(self, *, source_store: SourceStore, record_store: RecordStore) -> None:
        self.source_store = source_store
        self.record_store = record_store

    def list_sources(
        self,
        *,
        keyword: str | None = None,
        limit: int = 100,
        scope: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        normalized_scope = KBScope.from_payload(scope) if scope is not None else None
        if normalized_scope is None or (
            normalized_scope.mode == "all"
            and normalized_scope.version_mode == "latest"
            and not normalized_scope.excluded_source_ids
        ):
            rows = self.source_store.list_sources(limit=limit, keyword=keyword)
            return [self._serialize_source(row) for row in rows]

        rows = self.source_store.list_sources(limit=None, keyword=keyword)
        visible_source_ids = {
            str(item["source_id"])
            for item in self.source_store.resolve_scope_pairs(normalized_scope)
        }
        filtered_rows = [row for row in rows if str(row["id"]) in visible_source_ids]
        rows = filtered_rows[:limit]
        return [self._serialize_source(row) for row in rows]

    def update_source(
        self,
        source_id: str,
        *,
        name: str | None = None,
        summary: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        source = self.source_store.get_source(source_id)
        if source is None:
            return None

        next_name = None if name is None else str(name).strip()
        if next_name is not None and not next_name:
            raise ValueError("Source name cannot be empty.")

        merged_metadata = (
            source.get("metadata", {})
            if metadata is None
            else {**dict(source.get("metadata", {})), **metadata}
        )
        updated = self.source_store.update_source(
            source_id,
            name=next_name,
            summary=summary,
            metadata=merged_metadata,
        )
        if updated is None:
            return None
        detail = self.get_source_detail(source_id)
        return detail["source"] if detail is not None else updated

    def get_source_detail(self, source_id: str, version_id: str | None = None) -> dict[str, Any] | None:
        detail = self.source_store.get_source_detail(source_id, version_id=version_id)
        if detail is None:
            return None
        source = detail["source"]
        versions = [self._serialize_source_version(version) for version in detail.get("versions", [])]
        selected_version = detail.get("selected_version")
        return {
            "source": self._serialize_source(source, versions=versions),
            "paragraph_count": int(detail.get("paragraph_count") or 0),
            "entity_count": int(detail.get("entity_count") or 0),
            "relation_count": int(detail.get("relation_count") or 0),
            "selected_version": self._serialize_source_version(selected_version) if selected_version else None,
            "versions": versions,
        }

    def list_source_paragraphs(self, source_id: str, version_id: str | None = None) -> list[dict[str, Any]] | None:
        source, selected_version = self._resolve_source_context(source_id, version_id=version_id)
        if source is None:
            logger.debug("Unable to load source paragraphs because the source does not exist. source_id=%s", source_id)
            return None
        if version_id and selected_version is None:
            logger.debug(
                "Unable to load source paragraphs because the version does not exist. source_id=%s version_id=%s",
                source_id,
                version_id,
            )
            return None
        resolved_version_id = str(selected_version["id"]) if selected_version is not None else None
        paragraphs = self.source_store.list_source_paragraphs(source_id, version_id=resolved_version_id)
        worksheet_rows_by_ref = self._collect_source_row_context(paragraphs)
        logger.debug(
            "Loaded source paragraph render context. source_id=%s paragraph_count=%s worksheet_context_count=%s",
            source_id,
            len(paragraphs),
            len(worksheet_rows_by_ref),
        )

        enriched: list[dict[str, Any]] = []
        for paragraph in paragraphs:
            metadata = dict(paragraph.get("metadata") or {})
            worksheet_key = normalize_sheet_name(str(metadata.get("worksheet_key") or metadata.get("worksheet_name") or ""))
            worksheet_rows = self._window_rows_for_paragraph(
                rows=worksheet_rows_by_ref.get(
                    (str(paragraph["source_id"]), str(paragraph.get("version_id") or ""), worksheet_key),
                    [],
                ),
                row_index=int(metadata.get("row_index") or 0),
            )
            render_payload = build_paragraph_render_payload(
                paragraph=paragraph,
                worksheet_rows=worksheet_rows,
            )
            enriched.append({**paragraph, **render_payload})
        logger.debug(
            "Finished rendering source paragraphs. source_id=%s paragraph_count=%s render_kinds=%s",
            source_id,
            len(enriched),
            [str(paragraph.get("render_kind") or "") for paragraph in enriched[:12]],
        )
        return enriched

    def list_source_worksheets(self, source_id: str, version_id: str | None = None) -> list[dict[str, Any]] | None:
        source, selected_version = self._resolve_source_context(source_id, version_id=version_id)
        if source is None:
            return None
        if version_id and selected_version is None:
            return None
        if selected_version is None:
            return []
        paragraphs = self.source_store.list_source_paragraphs(source_id, version_id=str(selected_version["id"]))
        return self._build_worksheet_catalog(paragraphs)

    def get_source_worksheet_preview(
        self,
        source_id: str,
        worksheet_key: str,
        *,
        version_id: str | None = None,
        page: int = 1,
        page_size: int = 50,
        anchor_row_index: int | None = None,
        highlighted_columns: list[str] | None = None,
    ) -> dict[str, Any]:
        source, selected_version = self._resolve_source_context(source_id, version_id=version_id)
        if source is None:
            raise KeyError("source_not_found")
        if version_id and selected_version is None:
            raise KeyError("source_version_not_found")
        if selected_version is None:
            raise KeyError("source_version_not_found")

        normalized_worksheet_key = normalize_sheet_name(worksheet_key)
        if not normalized_worksheet_key:
            raise ValueError("Worksheet key cannot be empty.")

        paragraphs = self.source_store.list_source_paragraphs(source_id, version_id=str(selected_version["id"]))
        worksheet_catalog = {
            str(item["worksheet_key"]): item
            for item in self._build_worksheet_catalog(paragraphs)
        }
        worksheet_item = worksheet_catalog.get(normalized_worksheet_key)
        if worksheet_item is None:
            raise KeyError("worksheet_not_found")

        normalized_page_size = max(1, min(int(page_size or 1), WORKSHEET_PREVIEW_PAGE_SIZE_MAX))
        requested_page = max(1, int(page or 1))
        normalized_anchor_row_index = self._optional_positive_int(anchor_row_index)
        normalized_highlighted_columns = [
            normalize_column_name(str(value))
            for value in list(highlighted_columns or [])
            if normalize_column_name(str(value))
        ]

        record_summary = self.record_store.get_worksheet_summary(
            source_id=source_id,
            version_id=str(selected_version["id"]),
            worksheet_key=normalized_worksheet_key,
        )
        total_rows = int(record_summary.get("total_rows") or 0) if record_summary else 0
        effective_headers = list(record_summary.get("headers") or []) if record_summary else []
        effective_column_keys = list(record_summary.get("column_keys") or []) if record_summary else []
        if not effective_headers:
            effective_headers = list(worksheet_item.get("headers") or [])
        if not effective_column_keys:
            effective_column_keys = list(worksheet_item.get("column_keys") or [])
        page_count = max(1, ceil(total_rows / normalized_page_size)) if total_rows > 0 else 1
        resolved_page = requested_page
        fallback_reason: str | None = None

        if normalized_anchor_row_index and total_rows > 0:
            row_count_before_anchor = self.record_store.count_rows_before(
                source_id=source_id,
                version_id=str(selected_version["id"]),
                worksheet_key=normalized_worksheet_key,
                row_index=normalized_anchor_row_index,
            )
            resolved_page = max(1, min(page_count, row_count_before_anchor // normalized_page_size + 1))
        elif requested_page > page_count:
            resolved_page = page_count
            fallback_reason = "page_out_of_range_clamped"

        preview_rows = self.record_store.list_rows_for_worksheet_page(
            source_id=source_id,
            version_id=str(selected_version["id"]),
            worksheet_key=normalized_worksheet_key,
            offset=(resolved_page - 1) * normalized_page_size,
            limit=normalized_page_size,
        )
        if total_rows <= 0:
            fallback_reason = fallback_reason or "no_row_records"

        row_range_start = int(preview_rows[0].get("row_index") or 0) if preview_rows else 0
        row_range_end = int(preview_rows[-1].get("row_index") or 0) if preview_rows else 0
        preview_items = [
            {
                "paragraph_id": str(row.get("paragraph_id") or "") or None,
                "row_index": int(row.get("row_index") or 0),
                "record_key": str(row.get("record_key") or "") or None,
                "cells": {
                    column_key: str(dict(row.get("cells") or {}).get(column_key) or "")
                    for column_key in effective_column_keys
                },
            }
            for row in preview_rows
        ]
        render_payload = build_worksheet_preview_payload(
            worksheet_name=str(worksheet_item.get("worksheet_name") or ""),
            worksheet_key=normalized_worksheet_key,
            headers=effective_headers,
            column_keys=effective_column_keys,
            preview_rows=preview_rows,
            page=resolved_page,
            page_size=normalized_page_size,
            total_rows=total_rows,
            anchor_row_index=normalized_anchor_row_index,
            highlighted_row_indexes=[normalized_anchor_row_index] if normalized_anchor_row_index else [],
            highlighted_columns=normalized_highlighted_columns,
            fallback_reason=fallback_reason,
        )
        return {
            "source_id": source_id,
            "version_id": str(selected_version["id"]),
            "worksheet_key": normalized_worksheet_key,
            "worksheet_name": str(worksheet_item.get("worksheet_name") or ""),
            "headers": effective_headers,
            "column_keys": effective_column_keys,
            "items": preview_items,
            "page": resolved_page,
            "page_size": normalized_page_size,
            "total_rows": total_rows,
            "has_prev": resolved_page > 1,
            "has_next": resolved_page * normalized_page_size < total_rows,
            "row_range_start": row_range_start,
            "row_range_end": row_range_end,
            "anchor_row_index": normalized_anchor_row_index,
            "highlighted_row_indexes": [normalized_anchor_row_index] if normalized_anchor_row_index else [],
            "highlighted_columns": normalized_highlighted_columns,
            **render_payload,
        }

    def _window_rows_for_paragraph(
        self,
        *,
        rows: list[dict[str, Any]],
        row_index: int,
    ) -> list[dict[str, Any]]:
        if row_index <= 0:
            return list(rows)
        return [row for row in rows if abs(int(row.get("row_index") or 0) - row_index) <= 1]

    def _collect_source_row_context(
        self,
        paragraphs: list[dict[str, Any]],
    ) -> dict[tuple[str, str, str], list[dict[str, Any]]]:
        grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
        for paragraph in paragraphs:
            metadata = dict(paragraph.get("metadata") or {})
            if str(metadata.get("paragraph_kind") or "") != "row_record":
                continue
            worksheet_key = normalize_sheet_name(str(metadata.get("worksheet_key") or metadata.get("worksheet_name") or ""))
            if not worksheet_key:
                continue
            grouped[
                (
                    str(paragraph["source_id"]),
                    str(paragraph.get("version_id") or ""),
                    worksheet_key,
                )
            ].append(
                {
                    "paragraph_id": str(paragraph["id"]),
                    "row_index": int(metadata.get("row_index") or 0),
                    "record_key": str(metadata.get("record_key") or ""),
                    "cells": dict(metadata.get("cells") or {}),
                    "metadata": metadata,
                }
            )
        return grouped

    def _build_worksheet_catalog(self, paragraphs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        catalog: dict[str, dict[str, Any]] = {}
        for paragraph in paragraphs:
            metadata = dict(paragraph.get("metadata") or {})
            paragraph_kind = str(metadata.get("paragraph_kind") or "")
            if paragraph_kind not in {"row_record", "sheet_summary"}:
                continue
            worksheet_name = str(metadata.get("worksheet_name") or "").strip()
            worksheet_key = normalize_sheet_name(str(metadata.get("worksheet_key") or worksheet_name))
            if not worksheet_key:
                continue
            entry = catalog.setdefault(
                worksheet_key,
                {
                    "worksheet_key": worksheet_key,
                    "worksheet_name": worksheet_name or worksheet_key,
                    "worksheet_index": self._optional_positive_int(metadata.get("worksheet_index")),
                    "declared_row_count": 0,
                    "record_row_count": 0,
                    "headers": [],
                    "column_keys": [],
                },
            )
            if worksheet_name and not entry["worksheet_name"]:
                entry["worksheet_name"] = worksheet_name
            worksheet_index = self._optional_positive_int(metadata.get("worksheet_index"))
            if entry["worksheet_index"] is None and worksheet_index is not None:
                entry["worksheet_index"] = worksheet_index
            headers = [
                str(value)
                for value in list(metadata.get("headers") or [])
                if str(value).strip()
            ]
            column_keys = [
                normalize_column_name(str(value))
                for value in list(metadata.get("header_keys") or [])
                if normalize_column_name(str(value))
            ]
            if headers and not entry["headers"]:
                entry["headers"] = headers
            if column_keys and not entry["column_keys"]:
                entry["column_keys"] = column_keys
            if paragraph_kind == "sheet_summary":
                entry["declared_row_count"] = max(
                    int(entry["declared_row_count"] or 0),
                    int(metadata.get("row_count") or 0),
                )
            if paragraph_kind == "row_record":
                entry["record_row_count"] = int(entry["record_row_count"] or 0) + 1

        items = []
        for entry in catalog.values():
            items.append(
                {
                    "worksheet_key": str(entry["worksheet_key"]),
                    "worksheet_name": str(entry["worksheet_name"]),
                    "row_count": int(entry["record_row_count"] or 0)
                    or int(entry["declared_row_count"] or 0),
                    "headers": list(entry["headers"] or []),
                    "column_keys": list(entry["column_keys"] or []),
                    "worksheet_index": entry["worksheet_index"],
                }
            )
        items.sort(
            key=lambda item: (
                int(item.get("worksheet_index") or 10**9),
                str(item.get("worksheet_name") or ""),
                str(item.get("worksheet_key") or ""),
            )
        )
        return items

    def _resolve_source_context(
        self,
        source_id: str,
        *,
        version_id: str | None = None,
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        source = self.source_store.get_source(source_id)
        if source is None:
            return None, None
        selected_version = self.source_store.resolve_source_version(source_id, version_id=version_id)
        return source, selected_version

    def _optional_positive_int(self, value: Any) -> int | None:
        if value in {None, ""}:
            return None
        try:
            normalized_value = int(value)
        except (TypeError, ValueError):
            return None
        return normalized_value if normalized_value > 0 else None

    def _serialize_source(
        self,
        source: dict[str, Any],
        *,
        versions: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        serialized_versions = versions if versions is not None else [
            self._serialize_source_version(version)
            for version in self.source_store.list_source_versions(str(source["id"]))
        ]
        active_version = next(
            (version for version in serialized_versions if str(version.get("status") or "").lower() == "active"),
            None,
        )
        return {
            "id": str(source["id"]),
            "name": str(source["name"]),
            "source_kind": str(source["source_kind"]),
            "input_mode": str(source["input_mode"]),
            "file_type": source.get("file_type"),
            "storage_path": source.get("storage_path"),
            "strategy": str(source["strategy"]),
            "status": str(source["status"]),
            "summary": str(source.get("summary") or "") or None,
            "metadata": source.get("metadata", {}),
            "created_at": str(source["created_at"]),
            "updated_at": str(source["updated_at"]),
            "active_version_id": str(active_version["id"]) if active_version else None,
            "active_version_number": int(active_version["version_number"]) if active_version else None,
            "version_count": len(serialized_versions),
        }

    def _serialize_source_version(self, version: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(version["id"]),
            "source_id": str(version["source_id"]),
            "version_number": int(version["version_number"]),
            "status": str(version["status"]),
            "metadata": dict(version.get("metadata") or {}),
            "created_at": str(version["created_at"]),
            "activated_at": str(version.get("activated_at") or "") or None,
            "updated_at": str(version["updated_at"]),
        }

