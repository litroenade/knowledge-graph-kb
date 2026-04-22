"""来源检索存储。"""

from typing import Any

from ..database.sqlite import SQLiteGateway


class SourceSearchStore:
    """提供来源搜索模式所需的来源列表与检索查询。"""

    def __init__(self, gateway: SQLiteGateway) -> None:
        self.gateway = gateway

    def search_sources(
        self,
        *,
        query: str,
        limit: int,
        source_version_pairs: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        like_query = f"%{query.strip()}%"
        if source_version_pairs:
            source_ids = list(
                dict.fromkeys(
                    str(pair["source_id"])
                    for pair in source_version_pairs
                    if str(pair.get("source_id") or "").strip()
                )
            )
            if not source_ids:
                return []
            paragraph_clauses: list[str] = []
            params: list[Any] = []
            for pair in source_version_pairs:
                paragraph_clauses.append("(paragraphs.source_id = ? AND paragraphs.version_id = ?)")
                params.extend([str(pair["source_id"]), str(pair["version_id"])])
            source_placeholders = ",".join("?" for _ in source_ids)
            params.extend(source_ids)
            params.extend([like_query, like_query, limit])
            return self.gateway.fetch_all(
                f"""
                SELECT
                    sources.*,
                    COUNT(DISTINCT paragraphs.id) AS paragraph_count
                FROM sources
                LEFT JOIN paragraphs ON paragraphs.source_id = sources.id AND ({' OR '.join(paragraph_clauses)})
                WHERE sources.id IN ({source_placeholders})
                  AND (sources.name LIKE ? OR sources.summary LIKE ?)
                GROUP BY sources.id
                ORDER BY sources.created_at DESC
                LIMIT ?
                """,
                tuple(params),
            )
        return self.gateway.fetch_all(
            """
            SELECT
                sources.*,
                COUNT(paragraphs.id) AS paragraph_count
            FROM sources
            LEFT JOIN paragraphs ON paragraphs.source_id = sources.id
            WHERE sources.name LIKE ? OR sources.summary LIKE ?
            GROUP BY sources.id
            ORDER BY sources.created_at DESC
            LIMIT ?
            """,
            (like_query, like_query, limit),
        )
