from pathlib import Path
import sqlite3
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from src.api.dependencies import get_model_config_service, get_openai_gateway
from src.api.errors import register_error_handlers
from src.api.routes.model_config import model_config_router
from src.api.schemas.model_config import ModelConfigTestRequest, ModelConfigUpdateRequest
from src.config import Settings
from src.kb.common import RuntimeModelConfiguration
from src.kb.infrastructure.database.sqlite import SQLiteGateway
from src.kb.infrastructure.providers.openai import OpenAiGateway
from src.kb.use_cases.services.model import ModelConfigService


class FakeModelConfigStore:
    def __init__(self) -> None:
        self.row: dict[str, Any] | None = None

    def get(self) -> dict[str, Any] | None:
        return self.row

    def upsert(self, **payload: Any) -> dict[str, Any]:
        self.row = {
            "id": "default",
            "provider": payload["llm_provider"],
            "base_url": payload["llm_base_url"],
            "api_key": payload["llm_api_key"],
            "created_at": "created",
            "updated_at": "updated",
            **payload,
        }
        return self.row


class FakeVectorIndex:
    def __init__(self) -> None:
        self.reset_count = 0

    def reset(self) -> None:
        self.reset_count += 1


def test_model_config_supports_separate_llm_and_embedding_endpoints(tmp_path: Path) -> None:
    store = FakeModelConfigStore()
    vector = FakeVectorIndex()
    service = ModelConfigService(
        settings=Settings(kb_data_dir=str(tmp_path / "kb")),
        store=store,  # type: ignore[arg-type]
        vector_index=vector,  # type: ignore[arg-type]
    )

    result = service.update_configuration(
        {
            "llm_provider": "deepseek",
            "llm_base_url": "",
            "llm_model": "deepseek-chat",
            "llm_api_key": "deepseek-key",
            "clear_llm_api_key": False,
            "embedding_provider": "siliconflow",
            "embedding_base_url": "",
            "embedding_model": "BAAI/bge-m3",
            "embedding_api_key": "siliconflow-key",
            "clear_embedding_api_key": False,
        },
    )
    runtime = service.resolve_runtime_configuration()

    assert result["llm_provider"] == "deepseek"
    assert result["llm_base_url"] == "https://api.deepseek.com"
    assert result["embedding_provider"] == "siliconflow"
    assert result["embedding_base_url"] == "https://api.siliconflow.cn/v1"
    assert runtime.llm_provider == "deepseek"
    assert runtime.llm_base_url == "https://api.deepseek.com"
    assert runtime.llm_model == "deepseek-chat"
    assert runtime.llm_api_key == "deepseek-key"
    assert runtime.embedding_provider == "siliconflow"
    assert runtime.embedding_base_url == "https://api.siliconflow.cn/v1"
    assert runtime.embedding_model == "BAAI/bge-m3"
    assert runtime.embedding_api_key == "siliconflow-key"
    assert vector.reset_count == 1


def test_cleared_embedding_key_does_not_fall_back_to_legacy_llm_key(tmp_path: Path) -> None:
    store = FakeModelConfigStore()
    vector = FakeVectorIndex()
    service = ModelConfigService(
        settings=Settings(kb_data_dir=str(tmp_path / "kb")),
        store=store,  # type: ignore[arg-type]
        vector_index=vector,  # type: ignore[arg-type]
    )
    service.update_configuration(
        {
            "llm_provider": "deepseek",
            "llm_base_url": "",
            "llm_model": "deepseek-chat",
            "llm_api_key": "deepseek-key",
            "embedding_provider": "siliconflow",
            "embedding_base_url": "",
            "embedding_model": "BAAI/bge-m3",
            "embedding_api_key": "siliconflow-key",
        },
    )

    service.update_configuration(
        {
            "llm_provider": "deepseek",
            "llm_base_url": "",
            "llm_model": "deepseek-chat",
            "embedding_provider": "siliconflow",
            "embedding_base_url": "",
            "embedding_model": "BAAI/bge-m3",
            "clear_embedding_api_key": True,
        },
    )
    runtime = service.resolve_runtime_configuration()

    assert runtime.llm_api_key == "deepseek-key"
    assert runtime.embedding_api_key == ""
    assert runtime.embedding_api_key_source == "none"


def test_invalid_saved_embedding_key_does_not_inherit_llm_key(tmp_path: Path) -> None:
    store = FakeModelConfigStore()
    vector = FakeVectorIndex()
    service = ModelConfigService(
        settings=Settings(kb_data_dir=str(tmp_path / "kb")),
        store=store,  # type: ignore[arg-type]
        vector_index=vector,  # type: ignore[arg-type]
    )
    store.row = {
        "id": "default",
        "provider": "openai",
        "base_url": "https://api.openai.com/v1",
        "api_key": service.secret_cipher.encrypt("llm-key"),
        "llm_provider": "openai",
        "llm_base_url": "https://api.openai.com/v1",
        "llm_model": "gpt-test",
        "llm_api_key": service.secret_cipher.encrypt("llm-key"),
        "embedding_provider": "openai",
        "embedding_base_url": "https://api.openai.com/v1",
        "embedding_model": "embed-test",
        "embedding_api_key": "broken-key",
        "created_at": "created",
        "updated_at": "updated",
    }

    runtime = service.resolve_runtime_configuration()
    public_config = service.get_public_configuration()

    assert runtime.llm_api_key == "llm-key"
    assert runtime.embedding_api_key == ""
    assert runtime.embedding_api_key_source == "invalid"
    assert public_config["embedding_api_key_source"] == "invalid"


def test_reindex_only_follows_embedding_endpoint_signature(tmp_path: Path) -> None:
    store = FakeModelConfigStore()
    vector = FakeVectorIndex()
    service = ModelConfigService(
        settings=Settings(kb_data_dir=str(tmp_path / "kb")),
        store=store,  # type: ignore[arg-type]
        vector_index=vector,  # type: ignore[arg-type]
    )

    first_result = service.update_configuration(
        {
            "llm_provider": "deepseek",
            "llm_base_url": "",
            "llm_model": "deepseek-chat",
            "llm_api_key": "deepseek-key",
            "embedding_provider": "siliconflow",
            "embedding_base_url": "",
            "embedding_model": "BAAI/bge-m3",
            "embedding_api_key": "siliconflow-key",
        },
    )
    llm_only_result = service.update_configuration(
        {
            "llm_provider": "openrouter",
            "llm_base_url": "",
            "llm_model": "openrouter-chat",
            "llm_api_key": "openrouter-key",
            "embedding_provider": "siliconflow",
            "embedding_base_url": "",
            "embedding_model": "BAAI/bge-m3",
            "embedding_api_key": "siliconflow-key",
        },
    )
    embedding_key_only_result = service.update_configuration(
        {
            "llm_provider": "openrouter",
            "llm_base_url": "",
            "llm_model": "openrouter-chat",
            "llm_api_key": "openrouter-key",
            "embedding_provider": "siliconflow",
            "embedding_base_url": "",
            "embedding_model": "BAAI/bge-m3",
            "embedding_api_key": "siliconflow-key-rotated",
        },
    )
    embedding_endpoint_result = service.update_configuration(
        {
            "llm_provider": "openrouter",
            "llm_base_url": "",
            "llm_model": "openrouter-chat",
            "llm_api_key": "openrouter-key",
            "embedding_provider": "openai",
            "embedding_base_url": "",
            "embedding_model": "text-embedding-3-large",
            "embedding_api_key": "openai-embedding-key",
        },
    )

    assert first_result["reindex_required"] is True
    assert llm_only_result["reindex_required"] is False
    assert embedding_key_only_result["reindex_required"] is False
    assert embedding_endpoint_result["reindex_required"] is True
    assert vector.reset_count == 2


def test_legacy_http_model_config_payload_is_expanded_to_split_fields() -> None:
    update_payload = ModelConfigUpdateRequest(
        provider="openai",
        base_url="https://example.test/v1",
        llm_model="gpt-test",
        embedding_model="embed-test",
        api_key="legacy-key",
        clear_api_key=False,
    ).model_dump()
    test_payload = ModelConfigTestRequest(
        provider="openai",
        base_url="https://example.test/v1",
        llm_model="gpt-test",
        embedding_model="embed-test",
        api_key="legacy-key",
        use_saved_api_key=True,
    ).model_dump()

    assert update_payload["llm_provider"] == "openai"
    assert update_payload["embedding_provider"] == "openai"
    assert update_payload["llm_base_url"] == "https://example.test/v1"
    assert update_payload["embedding_base_url"] == "https://example.test/v1"
    assert update_payload["llm_api_key"] == "legacy-key"
    assert update_payload["embedding_api_key"] == "legacy-key"
    assert update_payload["clear_llm_api_key"] is False
    assert update_payload["clear_embedding_api_key"] is False
    assert test_payload["use_saved_llm_api_key"] is True
    assert test_payload["use_saved_embedding_api_key"] is True


def test_model_config_routes_accept_legacy_payloads(tmp_path: Path) -> None:
    store = FakeModelConfigStore()
    vector = FakeVectorIndex()
    service = ModelConfigService(
        settings=Settings(kb_data_dir=str(tmp_path / "kb")),
        store=store,  # type: ignore[arg-type]
        vector_index=vector,  # type: ignore[arg-type]
    )
    captured_runtime: dict[str, RuntimeModelConfiguration] = {}

    class FakeOpenAiGateway:
        def test_connection(self, runtime_config: RuntimeModelConfiguration) -> tuple[bool, bool]:
            captured_runtime["value"] = runtime_config
            return True, True

    app = FastAPI()
    register_error_handlers(app)
    app.include_router(model_config_router)
    app.dependency_overrides[get_model_config_service] = lambda: service
    app.dependency_overrides[get_openai_gateway] = lambda: FakeOpenAiGateway()
    client = TestClient(app)

    update_response = client.put(
        "/api/kb/config/model",
        json={
            "provider": "openai",
            "base_url": "https://legacy-route.test/v1",
            "llm_model": "gpt-legacy",
            "embedding_model": "embed-legacy",
            "api_key": "legacy-route-key",
        },
    )
    test_response = client.post(
        "/api/kb/config/model/test",
        json={
            "provider": "openai",
            "base_url": "https://legacy-route.test/v1",
            "llm_model": "gpt-legacy",
            "embedding_model": "embed-legacy",
            "use_saved_api_key": True,
        },
    )

    assert update_response.status_code == 200
    assert update_response.json()["llm_base_url"] == "https://legacy-route.test/v1"
    assert update_response.json()["embedding_base_url"] == "https://legacy-route.test/v1"
    assert test_response.status_code == 200
    assert test_response.json()["llm_ok"] is True
    assert test_response.json()["embedding_ok"] is True
    assert captured_runtime["value"].llm_api_key == "legacy-route-key"
    assert captured_runtime["value"].embedding_api_key == "legacy-route-key"


def test_sqlite_v4_migrates_legacy_model_config_columns(tmp_path: Path) -> None:
    db_path = tmp_path / "kb.sqlite3"
    with sqlite3.connect(db_path) as connection:
        connection.executescript(
            """
            CREATE TABLE app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT INTO app_meta (key, value) VALUES ('schema_version', '3');
            CREATE TABLE model_config (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                base_url TEXT NOT NULL,
                llm_model TEXT NOT NULL,
                embedding_model TEXT NOT NULL,
                api_key TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT INTO model_config (
                id, provider, base_url, llm_model, embedding_model, api_key, created_at, updated_at
            )
            VALUES (
                'default', 'openai', 'https://legacy.test/v1', 'gpt-legacy', 'embed-legacy',
                'legacy-key', 'created', 'updated'
            );
            """
        )

    gateway = SQLiteGateway(db_path)
    gateway.initialize()
    row = gateway.fetch_one("SELECT * FROM model_config WHERE id = ?", ("default",))

    assert gateway.get_schema_version() == 4
    assert row is not None
    assert row["llm_provider"] == "openai"
    assert row["llm_base_url"] == "https://legacy.test/v1"
    assert row["llm_api_key"] == "legacy-key"
    assert row["embedding_provider"] == "openai"
    assert row["embedding_base_url"] == "https://legacy.test/v1"
    assert row["embedding_api_key"] == "legacy-key"


def test_gateway_routes_chat_and_embedding_to_separate_endpoints(tmp_path: Path, monkeypatch: Any) -> None:
    runtime_config = RuntimeModelConfiguration(
        llm_provider="deepseek",
        llm_base_url="https://api.deepseek.com",
        llm_api_key="deepseek-key",
        llm_model="deepseek-chat",
        llm_api_key_source="request",
        embedding_provider="siliconflow",
        embedding_base_url="https://api.siliconflow.cn/v1",
        embedding_api_key="siliconflow-key",
        embedding_model="BAAI/bge-m3",
        embedding_api_key_source="request",
    )
    gateway = OpenAiGateway(
        settings=Settings(kb_data_dir=str(tmp_path / "kb")),
        runtime_config_provider=lambda: runtime_config,
    )
    client_requests: list[dict[str, str]] = []

    class FakeEmbeddings:
        def create(self, *, model: str, input: list[str]) -> Any:
            return SimpleNamespace(data=[SimpleNamespace(embedding=[1.0, 2.0]) for _ in input])

    class FakeChatCompletions:
        def create(self, **_: Any) -> Any:
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="ok"))])

    fake_client = SimpleNamespace(
        embeddings=FakeEmbeddings(),
        chat=SimpleNamespace(completions=FakeChatCompletions()),
    )

    def fake_client_for(**kwargs: str) -> Any:
        client_requests.append(kwargs)
        return fake_client

    monkeypatch.setattr(gateway, "_client_for", fake_client_for)

    assert gateway.generate_embeddings(["hello"]) == [[1.0, 2.0]]
    assert gateway.generate_answer("问题", [{"document_name": "doc", "excerpt": "context"}]) == "ok"

    assert client_requests[0] == {
        "provider": "siliconflow",
        "base_url": "https://api.siliconflow.cn/v1",
        "api_key": "siliconflow-key",
        "api_key_source": "request",
        "purpose": "Embedding",
    }
    assert client_requests[1] == {
        "provider": "deepseek",
        "base_url": "https://api.deepseek.com",
        "api_key": "deepseek-key",
        "api_key_source": "request",
        "purpose": "LLM",
        "cache": True,
    }


def test_gateway_test_connection_uses_separate_endpoint_clients(tmp_path: Path, monkeypatch: Any) -> None:
    runtime_config = RuntimeModelConfiguration(
        llm_provider="deepseek",
        llm_base_url="https://api.deepseek.com",
        llm_api_key="deepseek-key",
        llm_model="deepseek-chat",
        llm_api_key_source="request",
        embedding_provider="siliconflow",
        embedding_base_url="https://api.siliconflow.cn/v1",
        embedding_api_key="siliconflow-key",
        embedding_model="BAAI/bge-m3",
        embedding_api_key_source="request",
    )
    gateway = OpenAiGateway(
        settings=Settings(kb_data_dir=str(tmp_path / "kb")),
        runtime_config_provider=lambda: runtime_config,
    )
    client_requests: list[dict[str, str]] = []

    class FakeEmbeddings:
        def create(self, *, model: str, input: list[str]) -> Any:
            return SimpleNamespace(data=[SimpleNamespace(embedding=[1.0]) for _ in input])

    class FakeChatCompletions:
        def create(self, **_: Any) -> Any:
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="ok"))])

    fake_client = SimpleNamespace(
        embeddings=FakeEmbeddings(),
        chat=SimpleNamespace(completions=FakeChatCompletions()),
    )

    def fake_client_for(**kwargs: str) -> Any:
        client_requests.append(kwargs)
        return fake_client

    monkeypatch.setattr(gateway, "_client_for", fake_client_for)

    assert gateway.test_connection(runtime_config) == (True, True)
    assert client_requests == [
        {
            "provider": "siliconflow",
            "base_url": "https://api.siliconflow.cn/v1",
            "api_key": "siliconflow-key",
            "api_key_source": "request",
            "purpose": "Embedding",
            "cache": False,
        },
        {
            "provider": "deepseek",
            "base_url": "https://api.deepseek.com",
            "api_key": "deepseek-key",
            "api_key_source": "request",
            "purpose": "LLM",
            "cache": False,
        },
    ]


def test_chat_configuration_error_is_not_translated_to_request_error(tmp_path: Path) -> None:
    runtime_config = RuntimeModelConfiguration(
        llm_provider="deepseek",
        llm_base_url="https://api.deepseek.com",
        llm_api_key="",
        llm_model="deepseek-chat",
        llm_api_key_source="none",
        embedding_provider="siliconflow",
        embedding_base_url="https://api.siliconflow.cn/v1",
        embedding_api_key="siliconflow-key",
        embedding_model="BAAI/bge-m3",
        embedding_api_key_source="request",
    )
    gateway = OpenAiGateway(
        settings=Settings(kb_data_dir=str(tmp_path / "kb")),
        runtime_config_provider=lambda: runtime_config,
    )

    with pytest.raises(Exception) as exc_info:
        gateway.generate_answer("question", [{"document_name": "doc", "excerpt": "context"}])

    assert exc_info.value.__class__.__name__ == "OpenAiConfigurationError"
