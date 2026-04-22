"""Read-only repository for answer retrieval context."""

from ..database.sqlite import SQLiteGateway
from .common import placeholders


class AnswerReadStore:
    """Read-only paragraph, entity, and relation references for answer pipeline."""

    def __init__(self, gateway: SQLiteGateway) -> None:
        self.gateway = gateway

    def get_paragraphs_with_sources(self, paragraph_ids: list[str]) -> list[dict[str, object]]:
        if not paragraph_ids:
            return []
        return self.gateway.fetch_all(
            f"""
            SELECT
                paragraphs.*,
                sources.name AS source_name,
                sources.source_kind AS source_kind,
                sources.storage_path AS file_path
            FROM paragraphs
            JOIN sources ON sources.id = paragraphs.source_id
            WHERE paragraphs.id IN ({placeholders(paragraph_ids)})
            ORDER BY paragraphs.position ASC
            """,
            tuple(paragraph_ids),
        )

    def list_entity_links_for_paragraphs(self, paragraph_ids: list[str]) -> list[dict[str, object]]:
        if not paragraph_ids:
            return []
        return self.gateway.fetch_all(
            f"SELECT * FROM paragraph_entities WHERE paragraph_id IN ({placeholders(paragraph_ids)})",
            tuple(paragraph_ids),
        )

    def list_relation_links_for_paragraphs(self, paragraph_ids: list[str]) -> list[dict[str, object]]:
        if not paragraph_ids:
            return []
        return self.gateway.fetch_all(
            f"SELECT * FROM paragraph_relations WHERE paragraph_id IN ({placeholders(paragraph_ids)})",
            tuple(paragraph_ids),
        )
