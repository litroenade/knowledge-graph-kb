"""实体检索存储。"""

from typing import Any

from ..database.sqlite import SQLiteGateway


class EntitySearchStore:
    """提供实体检索所需的查询能力。"""

    def __init__(self, gateway: SQLiteGateway) -> None:
        self.gateway = gateway

    def search_entities(
        self,
        *,
        query: str,
        limit: int,
        source_version_pairs: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        like_query = f"%{query.strip()}%"
        if source_version_pairs:
            clauses: list[str] = []
            params: list[Any] = [like_query, like_query]
            for pair in source_version_pairs:
                clauses.append("(paragraphs.source_id = ? AND paragraphs.version_id = ?)")
                params.extend([str(pair["source_id"]), str(pair["version_id"])])
            params.append(limit)
            return self.gateway.fetch_all(
                f"""
                SELECT
                    entities.id,
                    entities.display_name,
                    entities.description,
                    COALESCE(SUM(paragraph_entities.mention_count), 0) AS appearance_count,
                    entities.metadata,
                    GROUP_CONCAT(DISTINCT paragraph_entities.paragraph_id) AS paragraph_ids
                FROM entities
                JOIN paragraph_entities ON paragraph_entities.entity_id = entities.id
                JOIN paragraphs ON paragraphs.id = paragraph_entities.paragraph_id
                WHERE (entities.display_name LIKE ? OR entities.description LIKE ?)
                  AND ({' OR '.join(clauses)})
                GROUP BY entities.id
                ORDER BY appearance_count DESC, entities.display_name ASC
                LIMIT ?
                """,
                tuple(params),
            )
        return self.gateway.fetch_all(
            """
            SELECT
                entities.*,
                GROUP_CONCAT(paragraph_entities.paragraph_id) AS paragraph_ids
            FROM entities
            LEFT JOIN paragraph_entities ON paragraph_entities.entity_id = entities.id
            WHERE entities.display_name LIKE ? OR entities.description LIKE ?
            GROUP BY entities.id
            ORDER BY entities.appearance_count DESC, entities.display_name ASC
            LIMIT ?
            """,
            (like_query, like_query, limit),
        )
