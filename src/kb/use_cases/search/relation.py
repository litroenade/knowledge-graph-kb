"""Relation search application service."""

from typing import Any

from src.kb.infrastructure.storage import RelationSearchStore, SourceStore
from src.utils.logger import get_logger

from ..retrieval.types import KBScope

logger = get_logger(__name__)


class RelationSearchService:
    """Prepare relation search results for the frontend."""

    def __init__(self, *, relation_search_store: RelationSearchStore, source_store: SourceStore) -> None:
        self.relation_search_store = relation_search_store
        self.source_store = source_store

    def search_relations(
        self,
        *,
        query: str,
        scope: dict[str, Any],
        limit: int = 20,
    ) -> dict[str, list[dict[str, object]]]:
        normalized_scope = KBScope.from_payload(scope)
        scope_pairs = self.source_store.resolve_scope_pairs(normalized_scope)
        if not scope_pairs:
            return {"items": []}

        rows = self.relation_search_store.search_relations(
            query=query,
            limit=limit,
            source_version_pairs=scope_pairs,
        )
        items = [
            {
                "id": str(row["id"]),
                "subject_id": str(row["subject_entity_id"]),
                "subject_name": str(row["subject_name"]),
                "predicate": str(row["predicate"]),
                "object_id": str(row["object_entity_id"]),
                "object_name": str(row["object_name"]),
                "confidence": float(row.get("confidence") or 0.0),
                "source_paragraph_id": str(row.get("source_paragraph_id") or "") or None,
                "metadata": row.get("metadata", {}),
            }
            for row in rows
        ]
        logger.info("Relation search completed: query_length=%s result_count=%s", len(str(query or "").strip()), len(items))
        return {"items": items}

