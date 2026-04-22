"""Entity search application service."""

from typing import Any

from src.kb.infrastructure.storage import EntitySearchStore, SourceStore
from src.utils.logger import get_logger

from ..retrieval.types import KBScope

logger = get_logger(__name__)


class EntitySearchService:
    """Prepare entity search results for the frontend."""

    def __init__(self, *, entity_search_store: EntitySearchStore, source_store: SourceStore) -> None:
        self.entity_search_store = entity_search_store
        self.source_store = source_store

    def search_entities(
        self,
        *,
        query: str,
        scope: dict[str, Any],
        limit: int = 20,
    ) -> dict[str, list[dict[str, Any]]]:
        normalized_scope = KBScope.from_payload(scope)
        scope_pairs = self.source_store.resolve_scope_pairs(normalized_scope)
        if not scope_pairs:
            return {"items": []}

        rows = self.entity_search_store.search_entities(
            query=query,
            limit=limit,
            source_version_pairs=scope_pairs,
        )
        items: list[dict[str, Any]] = []
        for row in rows:
            paragraph_ids = [value for value in str(row.get("paragraph_ids") or "").split(",") if value]
            items.append(
                {
                    "id": str(row["id"]),
                    "display_name": str(row["display_name"]),
                    "description": str(row.get("description") or "") or None,
                    "appearance_count": int(row.get("appearance_count") or 0),
                    "metadata": row.get("metadata", {}),
                    "paragraph_ids": paragraph_ids,
                }
            )
        logger.info("Entity search completed: query_length=%s result_count=%s", len(str(query or "").strip()), len(items))
        return {"items": items}

