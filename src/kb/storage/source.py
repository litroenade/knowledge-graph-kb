"""Source and paragraph storage."""

from typing import Any
from uuid import uuid4

from src.utils.logger import get_logger

from ..database.sqlite import SQLiteGateway
from .common import utc_now_iso

logger = get_logger(__name__)


class SourceStore:
    """Persist and read sources, versions, and paragraphs."""

    def __init__(self, gateway: SQLiteGateway) -> None:
        self.gateway = gateway

    def create_source(
        self,
        *,
        name: str,
        source_kind: str,
        input_mode: str,
        file_type: str | None,
        storage_path: str | None,
        strategy: str,
        status: str,
        summary: str | None,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        source_id = str(uuid4())
        now = utc_now_iso()
        payload = {
            "id": source_id,
            "name": name,
            "source_kind": source_kind,
            "input_mode": input_mode,
            "file_type": file_type,
            "storage_path": storage_path,
            "strategy": strategy,
            "status": status,
            "summary": summary,
            "metadata": metadata,
            "created_at": now,
            "updated_at": now,
        }
        with self.gateway.transaction() as connection:
            connection.execute(
                """
                INSERT INTO sources (
                    id, name, source_kind, input_mode, file_type, storage_path, strategy,
                    status, summary, metadata, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["name"],
                    payload["source_kind"],
                    payload["input_mode"],
                    payload["file_type"],
                    payload["storage_path"],
                    payload["strategy"],
                    payload["status"],
                    payload["summary"],
                    self.gateway.dump_json(payload["metadata"]),
                    payload["created_at"],
                    payload["updated_at"],
                ),
            )
        return payload

    def find_existing_source(
        self,
        *,
        name: str,
        source_kind: str,
        input_mode: str,
        storage_path: str | None,
    ) -> dict[str, Any] | None:
        normalized_storage_path = str(storage_path or "").strip()
        if normalized_storage_path:
            return self.gateway.fetch_one(
                """
                SELECT *
                FROM sources
                WHERE storage_path = ?
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (normalized_storage_path,),
            )
        return self.gateway.fetch_one(
            """
            SELECT *
            FROM sources
            WHERE name = ? AND source_kind = ? AND input_mode = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (name, source_kind, input_mode),
        )

    def update_source(
        self,
        source_id: str,
        *,
        name: str | None = None,
        source_kind: str | None = None,
        input_mode: str | None = None,
        file_type: str | None = None,
        storage_path: str | None = None,
        strategy: str | None = None,
        status: str | None = None,
        summary: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        row = self.get_source(source_id)
        if row is None:
            return None
        payload = {
            "name": row["name"] if name is None else name,
            "source_kind": row["source_kind"] if source_kind is None else source_kind,
            "input_mode": row["input_mode"] if input_mode is None else input_mode,
            "file_type": row["file_type"] if file_type is None else file_type,
            "storage_path": row["storage_path"] if storage_path is None else storage_path,
            "strategy": row["strategy"] if strategy is None else strategy,
            "status": row["status"] if status is None else status,
            "summary": row["summary"] if summary is None else summary,
            "metadata": row["metadata"] if metadata is None else metadata,
            "updated_at": utc_now_iso(),
        }
        with self.gateway.transaction() as connection:
            connection.execute(
                """
                UPDATE sources
                SET name = ?, source_kind = ?, input_mode = ?, file_type = ?, storage_path = ?,
                    strategy = ?, status = ?, summary = ?, metadata = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    payload["name"],
                    payload["source_kind"],
                    payload["input_mode"],
                    payload["file_type"],
                    payload["storage_path"],
                    payload["strategy"],
                    payload["status"],
                    payload["summary"],
                    self.gateway.dump_json(payload["metadata"]),
                    payload["updated_at"],
                    source_id,
                ),
            )
        return self.get_source(source_id)

    def get_source(self, source_id: str) -> dict[str, Any] | None:
        return self.gateway.fetch_one("SELECT * FROM sources WHERE id = ?", (source_id,))

    def list_sources(self, limit: int | None = 100, keyword: str | None = None) -> list[dict[str, Any]]:
        normalized_keyword = (keyword or "").strip()
        if normalized_keyword:
            like_pattern = f"%{normalized_keyword}%"
            sql = """
                SELECT *
                FROM sources
                WHERE name LIKE ? OR summary LIKE ?
                ORDER BY updated_at DESC
            """
            params: tuple[Any, ...]
            if limit is None:
                params = (like_pattern, like_pattern)
            else:
                sql += "\n                LIMIT ?"
                params = (like_pattern, like_pattern, limit)
            return self.gateway.fetch_all(sql, params)

        if limit is None:
            return self.gateway.fetch_all("SELECT * FROM sources ORDER BY updated_at DESC")
        return self.gateway.fetch_all("SELECT * FROM sources ORDER BY updated_at DESC LIMIT ?", (limit,))

    def create_source_version(
        self,
        *,
        source_id: str,
        status: str = "processing",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = utc_now_iso()
        source_version_id = str(uuid4())
        with self.gateway.transaction() as connection:
            version_row = connection.execute(
                "SELECT COALESCE(MAX(version_number), 0) AS max_version_number FROM source_versions WHERE source_id = ?",
                (source_id,),
            ).fetchone()
            next_version_number = int(version_row["max_version_number"] or 0) + 1 if version_row else 1
            payload = {
                "id": source_version_id,
                "source_id": source_id,
                "version_number": next_version_number,
                "status": status,
                "metadata": dict(metadata or {}),
                "created_at": now,
                "activated_at": None,
                "updated_at": now,
            }
            connection.execute(
                """
                INSERT INTO source_versions (
                    id, source_id, version_number, status, metadata, created_at, activated_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["source_id"],
                    payload["version_number"],
                    payload["status"],
                    self.gateway.dump_json(payload["metadata"]),
                    payload["created_at"],
                    payload["activated_at"],
                    payload["updated_at"],
                ),
            )
        return payload

    def get_source_version(self, source_id: str, version_id: str) -> dict[str, Any] | None:
        return self.gateway.fetch_one(
            """
            SELECT *
            FROM source_versions
            WHERE source_id = ? AND id = ?
            """,
            (source_id, version_id),
        )

    def list_source_versions(self, source_id: str) -> list[dict[str, Any]]:
        return self.gateway.fetch_all(
            """
            SELECT *
            FROM source_versions
            WHERE source_id = ?
            ORDER BY version_number DESC, updated_at DESC
            """,
            (source_id,),
        )

    def resolve_source_version(
        self,
        source_id: str,
        *,
        version_id: str | None = None,
    ) -> dict[str, Any] | None:
        normalized_version_id = str(version_id or "").strip()
        if normalized_version_id:
            return self.get_source_version(source_id, normalized_version_id)
        latest_active_version_id = self.resolve_latest_active_version_id(source_id)
        if latest_active_version_id is None:
            return None
        return self.get_source_version(source_id, latest_active_version_id)

    def resolve_latest_active_version_id(self, source_id: str) -> str | None:
        row = self.gateway.fetch_one(
            """
            SELECT id
            FROM source_versions
            WHERE source_id = ? AND status = 'active'
            ORDER BY version_number DESC, updated_at DESC
            LIMIT 1
            """,
            (source_id,),
        )
        return str(row["id"]) if row is not None else None

    def get_latest_processing_version(self, source_id: str) -> dict[str, Any] | None:
        return self.gateway.fetch_one(
            """
            SELECT *
            FROM source_versions
            WHERE source_id = ? AND status = 'processing'
            ORDER BY version_number DESC, updated_at DESC
            LIMIT 1
            """,
            (source_id,),
        )

    def activate_source_version(self, *, source_id: str, version_id: str) -> dict[str, Any] | None:
        now = utc_now_iso()
        with self.gateway.transaction() as connection:
            connection.execute(
                """
                UPDATE source_versions
                SET status = CASE WHEN id = ? THEN 'active' ELSE 'archived' END,
                    activated_at = CASE WHEN id = ? THEN ? ELSE activated_at END,
                    updated_at = ?
                WHERE source_id = ?
                """,
                (version_id, version_id, now, now, source_id),
            )
        return self.get_source_version(source_id, version_id)

    def fail_source_version(
        self,
        *,
        source_id: str,
        version_id: str,
        error: str | None = None,
    ) -> dict[str, Any] | None:
        existing = self.get_source_version(source_id, version_id)
        if existing is None:
            return None
        metadata = {
            **dict(existing.get("metadata", {})),
            **({"error": error} if error else {}),
        }
        with self.gateway.transaction() as connection:
            connection.execute(
                """
                UPDATE source_versions
                SET status = 'failed', metadata = ?, updated_at = ?
                WHERE source_id = ? AND id = ?
                """,
                (self.gateway.dump_json(metadata), utc_now_iso(), source_id, version_id),
            )
        return self.get_source_version(source_id, version_id)

    def resolve_scope_pairs(self, scope: Any) -> list[dict[str, Any]]:
        mode = str(getattr(scope, "mode", "") or "").strip()
        requested_source_ids = [
            str(source_id).strip()
            for source_id in list(getattr(scope, "source_ids", []) or [])
            if str(source_id).strip()
        ]
        excluded_source_ids = {
            str(source_id).strip()
            for source_id in list(getattr(scope, "excluded_source_ids", []) or [])
            if str(source_id).strip()
        }
        version_mode = str(getattr(scope, "version_mode", "latest") or "latest").strip()
        version_id = str(getattr(scope, "version_id", "") or "").strip() or None

        if mode == "all":
            requested_source_ids = [str(row["id"]) for row in self.list_sources(limit=None)]
        source_ids = [source_id for source_id in requested_source_ids if source_id not in excluded_source_ids]
        if not source_ids:
            return []

        if version_mode == "specific" and version_id:
            placeholders = ",".join("?" for _ in source_ids)
            return self.gateway.fetch_all(
                f"""
                SELECT source_versions.source_id, source_versions.id AS version_id,
                       sources.name AS source_name, sources.storage_path AS file_path
                FROM source_versions
                JOIN sources ON sources.id = source_versions.source_id
                WHERE source_versions.id = ?
                  AND source_versions.source_id IN ({placeholders})
                ORDER BY sources.updated_at DESC
                """,
                tuple([version_id, *source_ids]),
            )

        placeholders = ",".join("?" for _ in source_ids)
        rows = self.gateway.fetch_all(
            f"""
            SELECT source_versions.source_id, source_versions.id AS version_id,
                   source_versions.version_number, sources.name AS source_name,
                   sources.storage_path AS file_path
            FROM source_versions
            JOIN sources ON sources.id = source_versions.source_id
            WHERE source_versions.status = 'active'
              AND source_versions.source_id IN ({placeholders})
            ORDER BY source_versions.source_id ASC, source_versions.version_number DESC
            """,
            tuple(source_ids),
        )
        latest_by_source: dict[str, dict[str, Any]] = {}
        for row in rows:
            latest_by_source.setdefault(str(row["source_id"]), row)
        return list(latest_by_source.values())

    def add_paragraphs(self, *, source_id: str, version_id: str, paragraphs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        now = utc_now_iso()
        rows: list[dict[str, Any]] = []
        normalized_paragraphs = self._normalize_paragraph_positions(paragraphs)
        raw_positions = [paragraph.get("position") for paragraph in paragraphs[:20]]
        normalized_positions = [paragraph.get("position") for paragraph in normalized_paragraphs[:20]]
        logger.debug(
            "Starting paragraph write: source_id=%s version_id=%s paragraph_count=%s raw_positions=%s normalized_positions=%s",
            source_id,
            version_id,
            len(paragraphs),
            raw_positions,
            normalized_positions,
        )
        try:
            with self.gateway.transaction() as connection:
                for paragraph in normalized_paragraphs:
                    paragraph_id = str(uuid4())
                    row = {
                        "id": paragraph_id,
                        "source_id": source_id,
                        "version_id": version_id,
                        "position": int(paragraph["position"]),
                        "content": str(paragraph["content"]),
                        "knowledge_type": str(paragraph.get("knowledge_type") or "mixed"),
                        "token_count": int(paragraph.get("token_count") or 0),
                        "vector_state": str(paragraph.get("vector_state") or "pending"),
                        "metadata": dict(paragraph.get("metadata", {})),
                        "created_at": now,
                        "updated_at": now,
                    }
                    connection.execute(
                        """
                        INSERT INTO paragraphs (
                            id, source_id, version_id, position, content, knowledge_type, token_count,
                            vector_state, metadata, created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            row["id"],
                            row["source_id"],
                            row["version_id"],
                            row["position"],
                            row["content"],
                            row["knowledge_type"],
                            row["token_count"],
                            row["vector_state"],
                            self.gateway.dump_json(row["metadata"]),
                            row["created_at"],
                            row["updated_at"],
                        ),
                    )
                    rows.append(row)
        except Exception:
            logger.exception(
                "Paragraph write failed: source_id=%s version_id=%s paragraph_count=%s raw_positions=%s normalized_positions=%s",
                source_id,
                version_id,
                len(paragraphs),
                raw_positions,
                normalized_positions,
            )
            raise
        return rows

    def _normalize_paragraph_positions(self, paragraphs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        ranked_rows: list[tuple[int, int, dict[str, Any]]] = []
        for index, paragraph in enumerate(paragraphs):
            explicit_position = paragraph.get("position")
            sort_position = index if explicit_position is None else int(explicit_position)
            ranked_rows.append((sort_position, index, dict(paragraph)))
        ranked_rows.sort(key=lambda item: (item[0], item[1]))
        return [
            {
                **paragraph,
                "position": position,
            }
            for position, (_, _, paragraph) in enumerate(ranked_rows, start=1)
        ]

    def update_paragraph(
        self,
        paragraph_id: str,
        *,
        vector_state: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        row = self.get_paragraph(paragraph_id)
        if row is None:
            return None
        payload = {
            "vector_state": row["vector_state"] if vector_state is None else vector_state,
            "metadata": row["metadata"] if metadata is None else metadata,
            "updated_at": utc_now_iso(),
        }
        with self.gateway.transaction() as connection:
            connection.execute(
                """
                UPDATE paragraphs
                SET vector_state = ?, metadata = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    payload["vector_state"],
                    self.gateway.dump_json(payload["metadata"]),
                    payload["updated_at"],
                    paragraph_id,
                ),
            )
        return self.get_paragraph(paragraph_id)

    def get_paragraph(self, paragraph_id: str) -> dict[str, Any] | None:
        return self.gateway.fetch_one("SELECT * FROM paragraphs WHERE id = ?", (paragraph_id,))

    def delete_paragraph(self, paragraph_id: str) -> bool:
        with self.gateway.transaction() as connection:
            cursor = connection.execute("DELETE FROM paragraphs WHERE id = ?", (paragraph_id,))
        return cursor.rowcount > 0

    def delete_source(self, source_id: str) -> bool:
        with self.gateway.transaction() as connection:
            cursor = connection.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        return cursor.rowcount > 0

    def list_paragraphs_for_source(
        self,
        source_id: str,
        version_id: str | None = None,
    ) -> list[dict[str, Any]]:
        resolved_version = self.resolve_source_version(source_id, version_id=version_id)
        if resolved_version is None:
            return []
        return self.gateway.fetch_all(
            "SELECT * FROM paragraphs WHERE source_id = ? AND version_id = ? ORDER BY position ASC",
            (source_id, str(resolved_version["id"])),
        )

    def list_source_paragraphs(
        self,
        source_id: str,
        version_id: str | None = None,
    ) -> list[dict[str, Any]]:
        return self.list_paragraphs_for_source(source_id, version_id=version_id)

    def list_all_paragraphs(self) -> list[dict[str, Any]]:
        return self.gateway.fetch_all("SELECT * FROM paragraphs ORDER BY source_id, version_id, position")

    def get_source_detail(self, source_id: str, version_id: str | None = None) -> dict[str, Any] | None:
        source = self.get_source(source_id)
        if source is None:
            return None
        versions = self.list_source_versions(source_id)
        selected_version = self.resolve_source_version(source_id, version_id=version_id)
        if version_id and selected_version is None:
            return None
        resolved_version_id = str(selected_version["id"]) if selected_version is not None else ""
        paragraph_count_row = self.gateway.fetch_one(
            """
            SELECT COUNT(*) AS paragraph_count
            FROM paragraphs
            WHERE source_id = ? AND version_id = ?
            """,
            (source_id, resolved_version_id),
        )
        entity_count_row = self.gateway.fetch_one(
            """
            SELECT COUNT(DISTINCT paragraph_entities.entity_id) AS entity_count
            FROM paragraph_entities
            JOIN paragraphs ON paragraphs.id = paragraph_entities.paragraph_id
            WHERE paragraphs.source_id = ? AND paragraphs.version_id = ?
            """,
            (source_id, resolved_version_id),
        )
        relation_count_row = self.gateway.fetch_one(
            """
            SELECT COUNT(DISTINCT paragraph_relations.relation_id) AS relation_count
            FROM paragraph_relations
            JOIN paragraphs ON paragraphs.id = paragraph_relations.paragraph_id
            WHERE paragraphs.source_id = ? AND paragraphs.version_id = ?
            """,
            (source_id, resolved_version_id),
        )
        return {
            "source": source,
            "selected_version": selected_version,
            "versions": versions,
            "paragraph_count": int(paragraph_count_row.get("paragraph_count") or 0) if paragraph_count_row else 0,
            "entity_count": int(entity_count_row.get("entity_count") or 0) if entity_count_row else 0,
            "relation_count": int(relation_count_row.get("relation_count") or 0) if relation_count_row else 0,
        }
