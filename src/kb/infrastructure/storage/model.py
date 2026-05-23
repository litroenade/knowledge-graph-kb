"""模型配置存储。"""

from typing import Any

from ..database.sqlite import SQLiteGateway
from .common import DEFAULT_MODEL_CONFIG_ID, utc_now_iso


class ModelConfigStore:
    """负责持久化运行时模型配置。"""

    def __init__(self, gateway: SQLiteGateway) -> None:
        self.gateway = gateway

    def get(self) -> dict[str, Any] | None:
        """读取当前唯一一份模型配置。"""

        return self.gateway.fetch_one("SELECT * FROM model_config WHERE id = ?", (DEFAULT_MODEL_CONFIG_ID,))

    def upsert(
        self,
        *,
        llm_provider: str,
        llm_base_url: str,
        llm_model: str,
        llm_api_key: str | None,
        embedding_provider: str,
        embedding_base_url: str,
        embedding_model: str,
        embedding_api_key: str | None,
    ) -> dict[str, Any]:
        """写入或更新模型配置。"""

        existing = self.get()
        now = utc_now_iso()
        payload = {
            "id": DEFAULT_MODEL_CONFIG_ID,
            "provider": llm_provider,
            "base_url": llm_base_url,
            "api_key": llm_api_key,
            "llm_provider": llm_provider,
            "llm_base_url": llm_base_url,
            "llm_model": llm_model,
            "llm_api_key": llm_api_key,
            "embedding_provider": embedding_provider,
            "embedding_base_url": embedding_base_url,
            "embedding_model": embedding_model,
            "embedding_api_key": embedding_api_key,
            "created_at": existing["created_at"] if existing else now,
            "updated_at": now,
        }
        with self.gateway.transaction() as connection:
            connection.execute(
                """
                INSERT INTO model_config (
                    id, provider, base_url, llm_model, embedding_model, api_key,
                    llm_provider, llm_base_url, llm_api_key,
                    embedding_provider, embedding_base_url, embedding_api_key,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    provider = excluded.provider,
                    base_url = excluded.base_url,
                    llm_model = excluded.llm_model,
                    embedding_model = excluded.embedding_model,
                    api_key = excluded.api_key,
                    llm_provider = excluded.llm_provider,
                    llm_base_url = excluded.llm_base_url,
                    llm_api_key = excluded.llm_api_key,
                    embedding_provider = excluded.embedding_provider,
                    embedding_base_url = excluded.embedding_base_url,
                    embedding_api_key = excluded.embedding_api_key,
                    updated_at = excluded.updated_at
                """,
                (
                    payload["id"],
                    payload["provider"],
                    payload["base_url"],
                    payload["llm_model"],
                    payload["embedding_model"],
                    payload["api_key"],
                    payload["llm_provider"],
                    payload["llm_base_url"],
                    payload["llm_api_key"],
                    payload["embedding_provider"],
                    payload["embedding_base_url"],
                    payload["embedding_api_key"],
                    payload["created_at"],
                    payload["updated_at"],
                ),
            )
            connection.commit()
        return payload
