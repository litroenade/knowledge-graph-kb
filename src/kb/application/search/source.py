"""Source search application service."""

from typing import Any

from src.kb.storage import SourceSearchStore, SourceStore
from src.utils.logger import get_logger

from ..retrieval.types import KBScope

logger = get_logger(__name__)


class SourceSearchService:
    """Prepare source search results for the frontend."""

    def __init__(self, *, source_search_store: SourceSearchStore, source_store: SourceStore) -> None:
        self.source_search_store = source_search_store
        self.source_store = source_store

    def search_sources(
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

        rows = self.source_search_store.search_sources(
            query=query,
            limit=limit,
            source_version_pairs=scope_pairs,
        )
        items = [
            {
                "id": str(row["id"]),
                "name": str(row["name"]),
                "source_kind": str(row["source_kind"]),
                "summary": str(row.get("summary") or "") or None,
                "metadata": row.get("metadata", {}),
                "paragraph_count": int(row.get("paragraph_count") or 0),
            }
            for row in rows
        ]
        logger.info("Source search completed: query_length=%s result_count=%s", len(str(query or "").strip()), len(items))
        return {"items": items}
