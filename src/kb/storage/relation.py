"""关系检索存储。"""

from typing import Any

from ..database.sqlite import SQLiteGateway


class RelationSearchStore:
    """提供关系搜索模式所需的关系列表查询。"""

    def __init__(self, gateway: SQLiteGateway) -> None:
        self.gateway = gateway

    def search_relations(
        self,
        *,
        query: str,
        limit: int,
        source_version_pairs: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        like_query = f"%{query.strip()}%"
        if source_version_pairs:
            relation_clauses: list[str] = []
            paragraph_clauses: list[str] = []
            link_clauses: list[str] = []
            params: list[Any] = [like_query, like_query, like_query]
            for pair in source_version_pairs:
                source_id = str(pair["source_id"])
                version_id = str(pair["version_id"])
                relation_clauses.append("(relations.source_id = ? AND relations.version_id = ?)")
                paragraph_clauses.append("(paragraphs.source_id = ? AND paragraphs.version_id = ?)")
                link_clauses.append("(paragraph_relations.source_id = ? AND paragraph_relations.version_id = ?)")
                params.extend([source_id, version_id])
                params.extend([source_id, version_id])
                params.extend([source_id, version_id])
            params.append(limit)
            return self.gateway.fetch_all(
                f"""
                SELECT DISTINCT
                    relations.*,
                    subject_entity.display_name AS subject_name,
                    object_entity.display_name AS object_name
                FROM relations
                JOIN entities AS subject_entity ON subject_entity.id = relations.subject_entity_id
                JOIN entities AS object_entity ON object_entity.id = relations.object_entity_id
                LEFT JOIN paragraphs ON paragraphs.id = relations.source_paragraph_id
                LEFT JOIN paragraph_relations ON paragraph_relations.relation_id = relations.id
                WHERE (
                    subject_entity.display_name LIKE ?
                    OR object_entity.display_name LIKE ?
                    OR relations.predicate LIKE ?
                )
                  AND (
                    ({' OR '.join(relation_clauses)})
                    OR ({' OR '.join(paragraph_clauses)})
                    OR ({' OR '.join(link_clauses)})
                  )
                ORDER BY relations.created_at DESC
                LIMIT ?
                """,
                tuple(params),
            )
        return self.gateway.fetch_all(
            """
            SELECT
                relations.*,
                subject_entity.display_name AS subject_name,
                object_entity.display_name AS object_name
            FROM relations
            JOIN entities AS subject_entity ON subject_entity.id = relations.subject_entity_id
            JOIN entities AS object_entity ON object_entity.id = relations.object_entity_id
            WHERE subject_entity.display_name LIKE ?
               OR object_entity.display_name LIKE ?
               OR relations.predicate LIKE ?
            ORDER BY relations.created_at DESC
            LIMIT ?
            """,
            (like_query, like_query, like_query, limit),
        )
