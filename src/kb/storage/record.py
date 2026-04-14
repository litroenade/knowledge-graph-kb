"""Structured record row storage."""

from collections import defaultdict
from typing import Any
from uuid import uuid4

from src.kb.importing.excel import normalize_column_name, normalize_sheet_name

from ..database.sqlite import SQLiteGateway
from .common import placeholders, utc_now_iso


class RecordStore:
    """Persist and read spreadsheet-like row records."""

    def __init__(self, gateway: SQLiteGateway) -> None:
        self.gateway = gateway

    def sync_rows_for_paragraphs(self, paragraphs: list[dict[str, Any]]) -> None:
        now = utc_now_iso()
        with self.gateway.transaction() as connection:
            for paragraph in paragraphs:
                metadata = dict(paragraph.get("metadata", {}))
                if str(metadata.get("paragraph_kind") or "") != "row_record":
                    continue
                worksheet_name = str(metadata.get("worksheet_name") or "")
                payload = {
                    "id": str(uuid4()),
                    "paragraph_id": str(paragraph["id"]),
                    "source_id": str(paragraph["source_id"]),
                    "version_id": str(paragraph.get("version_id") or ""),
                    "worksheet_name": worksheet_name,
                    "worksheet_key": normalize_sheet_name(worksheet_name),
                    "row_index": int(metadata.get("row_index") or 0),
                    "record_key": str(metadata.get("record_key") or ""),
                    "entity_name": str(metadata.get("record_entity") or ""),
                    "content": str(paragraph["content"]),
                    "metadata": {
                        "primary_key": metadata.get("primary_key"),
                        "headers": metadata.get("headers", []),
                        "header_keys": metadata.get("header_keys", []),
                        "indexed_columns": metadata.get("indexed_columns", []),
                    },
                    "created_at": now,
                    "updated_at": now,
                }
                connection.execute(
                    """
                    INSERT INTO record_rows (
                        id, paragraph_id, source_id, version_id, worksheet_name, worksheet_key, row_index,
                        record_key, entity_name, content, metadata, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(paragraph_id) DO UPDATE SET
                        source_id = excluded.source_id,
                        version_id = excluded.version_id,
                        worksheet_name = excluded.worksheet_name,
                        worksheet_key = excluded.worksheet_key,
                        row_index = excluded.row_index,
                        record_key = excluded.record_key,
                        entity_name = excluded.entity_name,
                        content = excluded.content,
                        metadata = excluded.metadata,
                        updated_at = excluded.updated_at
                    """,
                    (
                        payload["id"],
                        payload["paragraph_id"],
                        payload["source_id"],
                        payload["version_id"],
                        payload["worksheet_name"],
                        payload["worksheet_key"],
                        payload["row_index"],
                        payload["record_key"],
                        payload["entity_name"],
                        payload["content"],
                        self.gateway.dump_json(payload["metadata"]),
                        payload["created_at"],
                        payload["updated_at"],
                    ),
                )
                persisted = connection.execute(
                    "SELECT id FROM record_rows WHERE paragraph_id = ?",
                    (payload["paragraph_id"],),
                ).fetchone()
                record_row_id = str(persisted["id"])
                connection.execute("DELETE FROM record_cells WHERE record_row_id = ?", (record_row_id,))
                indexed_columns = {
                    normalize_column_name(str(value))
                    for value in list(metadata.get("indexed_columns") or [])
                    if normalize_column_name(str(value))
                }
                display_cells = dict(metadata.get("cells") or {})
                normalized_cells = dict(metadata.get("normalized_cells") or {})
                for display_name, cell_value in display_cells.items():
                    column_key = normalize_column_name(display_name)
                    normalized_value = normalize_column_name(str(normalized_cells.get(column_key) or cell_value))
                    if not column_key or not normalized_value:
                        continue
                    connection.execute(
                        """
                        INSERT INTO record_cells (
                            id, record_row_id, column_name, normalized_column_name, cell_value,
                            normalized_value, is_indexed, created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(uuid4()),
                            record_row_id,
                            str(display_name),
                            column_key,
                            str(cell_value),
                            normalized_value,
                            1 if column_key in indexed_columns else 0,
                            now,
                            now,
                        ),
                    )

    def list_candidate_rows(
        self,
        *,
        source_version_pairs: list[dict[str, Any]] | None = None,
        worksheet_names: list[str] | None = None,
        filters: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        clauses = ["1 = 1"]
        params: list[Any] = []
        if source_version_pairs:
            pair_clauses = []
            for pair in source_version_pairs:
                pair_clauses.append("(record_rows.source_id = ? AND record_rows.version_id = ?)")
                params.extend([str(pair["source_id"]), str(pair["version_id"])])
            clauses.append(f"({' OR '.join(pair_clauses)})")
        normalized_sheet_names = [
            normalize_sheet_name(name)
            for name in (worksheet_names or [])
            if normalize_sheet_name(str(name))
        ]
        if normalized_sheet_names:
            clauses.append(f"record_rows.worksheet_key IN ({placeholders(normalized_sheet_names)})")
            params.extend(normalized_sheet_names)
        normalized_filters = {
            normalize_column_name(key): normalize_column_name(value)
            for key, value in dict(filters or {}).items()
            if normalize_column_name(key) and normalize_column_name(value)
        }
        if normalized_filters:
            filter_clauses: list[str] = []
            filter_params: list[Any] = []
            for column_name, normalized_value in normalized_filters.items():
                filter_clauses.append("(normalized_column_name = ? AND normalized_value = ?)")
                filter_params.extend([column_name, normalized_value])
            clauses.append(
                f"""
                record_rows.id IN (
                    SELECT record_row_id
                    FROM record_cells
                    WHERE {" OR ".join(filter_clauses)}
                    GROUP BY record_row_id
                    HAVING COUNT(DISTINCT normalized_column_name) >= {len(normalized_filters)}
                )
                """
            )
            params.extend(filter_params)
        return self.gateway.fetch_all(
            f"""
            SELECT record_rows.*, sources.name AS source_name, sources.storage_path AS file_path
            FROM record_rows
            JOIN sources ON sources.id = record_rows.source_id
            WHERE {' AND '.join(clauses)}
            ORDER BY record_rows.worksheet_name ASC, record_rows.row_index ASC
            """,
            tuple(params),
        )

    def list_cells(self, record_row_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        if not record_row_ids:
            return {}
        rows = self.gateway.fetch_all(
            f"""
            SELECT *
            FROM record_cells
            WHERE record_row_id IN ({placeholders(record_row_ids)})
            ORDER BY column_name ASC
            """,
            tuple(record_row_ids),
        )
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            grouped[str(row["record_row_id"])].append(row)
        return grouped

    def list_rows_by_paragraph_ids(self, paragraph_ids: list[str]) -> dict[str, dict[str, Any]]:
        if not paragraph_ids:
            return {}
        rows = self.gateway.fetch_all(
            f"""
            SELECT record_rows.*, sources.name AS source_name, sources.storage_path AS file_path
            FROM record_rows
            JOIN sources ON sources.id = record_rows.source_id
            WHERE record_rows.paragraph_id IN ({placeholders(paragraph_ids)})
            """,
            tuple(paragraph_ids),
        )
        return {str(row["paragraph_id"]): row for row in rows}

    def get_worksheet_summary(
        self,
        *,
        source_id: str,
        version_id: str,
        worksheet_key: str,
    ) -> dict[str, Any] | None:
        normalized_worksheet_key = normalize_sheet_name(worksheet_key)
        if not source_id or not version_id or not normalized_worksheet_key:
            return None
        summary_row = self.gateway.fetch_one(
            """
            SELECT
                MAX(worksheet_name) AS worksheet_name,
                COUNT(*) AS total_rows,
                MIN(row_index) AS min_row_index,
                MAX(row_index) AS max_row_index
            FROM record_rows
            WHERE source_id = ? AND version_id = ? AND worksheet_key = ?
            """,
            (source_id, version_id, normalized_worksheet_key),
        )
        if summary_row is None or int(summary_row.get("total_rows") or 0) <= 0:
            return None
        first_row = self.gateway.fetch_one(
            """
            SELECT *
            FROM record_rows
            WHERE source_id = ? AND version_id = ? AND worksheet_key = ?
            ORDER BY row_index ASC
            LIMIT 1
            """,
            (source_id, version_id, normalized_worksheet_key),
        )
        metadata = dict(first_row.get("metadata") or {}) if first_row else {}
        return {
            "worksheet_name": str(summary_row.get("worksheet_name") or ""),
            "worksheet_key": normalized_worksheet_key,
            "total_rows": int(summary_row.get("total_rows") or 0),
            "min_row_index": int(summary_row.get("min_row_index") or 0),
            "max_row_index": int(summary_row.get("max_row_index") or 0),
            "headers": [
                str(value)
                for value in list(metadata.get("headers") or [])
                if str(value).strip()
            ],
            "column_keys": [
                normalize_column_name(str(value))
                for value in list(metadata.get("header_keys") or [])
                if normalize_column_name(str(value))
            ],
        }

    def count_rows_before(
        self,
        *,
        source_id: str,
        version_id: str,
        worksheet_key: str,
        row_index: int,
    ) -> int:
        normalized_worksheet_key = normalize_sheet_name(worksheet_key)
        normalized_row_index = int(row_index or 0)
        if not source_id or not version_id or not normalized_worksheet_key or normalized_row_index <= 0:
            return 0
        row = self.gateway.fetch_one(
            """
            SELECT COUNT(*) AS row_count
            FROM record_rows
            WHERE source_id = ? AND version_id = ? AND worksheet_key = ? AND row_index < ?
            """,
            (source_id, version_id, normalized_worksheet_key, normalized_row_index),
        )
        return int(row.get("row_count") or 0) if row else 0

    def list_rows_for_worksheet_page(
        self,
        *,
        source_id: str,
        version_id: str,
        worksheet_key: str,
        offset: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        normalized_worksheet_key = normalize_sheet_name(worksheet_key)
        normalized_offset = max(0, int(offset or 0))
        normalized_limit = max(1, int(limit or 1))
        if not source_id or not version_id or not normalized_worksheet_key:
            return []
        rows = self.gateway.fetch_all(
            """
            SELECT *
            FROM record_rows
            WHERE source_id = ? AND version_id = ? AND worksheet_key = ?
            ORDER BY row_index ASC
            LIMIT ? OFFSET ?
            """,
            (source_id, version_id, normalized_worksheet_key, normalized_limit, normalized_offset),
        )
        cell_map = self.list_cells([str(row["id"]) for row in rows])
        return [
            {
                **row,
                "display_cells": {
                    str(cell["column_name"]): str(cell["cell_value"])
                    for cell in cell_map.get(str(row["id"]), [])
                },
                "cells": {
                    str(cell["normalized_column_name"]): str(cell["cell_value"])
                    for cell in cell_map.get(str(row["id"]), [])
                },
            }
            for row in rows
        ]

    def list_rows_in_windows(
        self,
        windows: list[tuple[Any, ...]],
        *,
        radius: int = 1,
    ) -> dict[tuple[str, str, str, int], list[dict[str, Any]]]:
        grouped_windows: dict[tuple[str, str, str], set[int]] = defaultdict(set)
        for window in windows:
            if len(window) == 4:
                source_id, version_id, worksheet_name, row_index = window
            else:
                source_id, worksheet_name, row_index = window
                version_id = ""
            normalized_source_id = str(source_id or "").strip()
            normalized_version_id = str(version_id or "").strip()
            worksheet_key = normalize_sheet_name(worksheet_name)
            normalized_row_index = int(row_index or 0)
            if not normalized_source_id or not worksheet_key or normalized_row_index <= 0:
                continue
            grouped_windows[(normalized_source_id, normalized_version_id, worksheet_key)].add(normalized_row_index)
        if not grouped_windows:
            return {}

        result: dict[tuple[str, str, str, int], list[dict[str, Any]]] = {}
        normalized_radius = max(0, int(radius))
        for (source_id, version_id, worksheet_key), row_indexes in grouped_windows.items():
            min_row = max(0, min(row_indexes) - normalized_radius)
            max_row = max(row_indexes) + normalized_radius
            if version_id:
                rows = self.gateway.fetch_all(
                    """
                    SELECT record_rows.*
                    FROM record_rows
                    WHERE record_rows.source_id = ?
                      AND record_rows.version_id = ?
                      AND record_rows.worksheet_key = ?
                      AND record_rows.row_index BETWEEN ? AND ?
                    ORDER BY record_rows.row_index ASC
                    """,
                    (source_id, version_id, worksheet_key, min_row, max_row),
                )
            else:
                rows = self.gateway.fetch_all(
                    """
                    SELECT record_rows.*
                    FROM record_rows
                    WHERE record_rows.source_id = ?
                      AND record_rows.worksheet_key = ?
                      AND record_rows.row_index BETWEEN ? AND ?
                    ORDER BY record_rows.row_index ASC
                    """,
                    (source_id, worksheet_key, min_row, max_row),
                )
            cell_map = self.list_cells([str(row["id"]) for row in rows])
            hydrated_rows = [
                {
                    **row,
                    "cells": {
                        str(cell["column_name"]): str(cell["cell_value"])
                        for cell in cell_map.get(str(row["id"]), [])
                    },
                }
                for row in rows
            ]
            for target_row_index in row_indexes:
                result[(source_id, version_id, worksheet_key, target_row_index)] = [
                    row
                    for row in hydrated_rows
                    if abs(int(row.get("row_index") or 0) - target_row_index) <= normalized_radius
                ]
        return result
