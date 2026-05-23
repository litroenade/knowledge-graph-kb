"""Model configuration API schemas."""

from typing import Any

from pydantic import BaseModel, model_validator


def _expand_legacy_model_config_payload(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    payload = dict(data)
    if "provider" in payload:
        payload.setdefault("llm_provider", payload["provider"])
        payload.setdefault("embedding_provider", payload["provider"])
    if "base_url" in payload:
        payload.setdefault("llm_base_url", payload["base_url"])
        payload.setdefault("embedding_base_url", payload["base_url"])
    if "api_key" in payload:
        payload.setdefault("llm_api_key", payload["api_key"])
        payload.setdefault("embedding_api_key", payload["api_key"])
    if "clear_api_key" in payload:
        payload.setdefault("clear_llm_api_key", payload["clear_api_key"])
        payload.setdefault("clear_embedding_api_key", payload["clear_api_key"])
    if "use_saved_api_key" in payload:
        payload.setdefault("use_saved_llm_api_key", payload["use_saved_api_key"])
        payload.setdefault("use_saved_embedding_api_key", payload["use_saved_api_key"])
    return payload


class ModelConfigResponse(BaseModel):
    llm_provider: str
    llm_base_url: str
    llm_model: str
    llm_has_api_key: bool
    llm_api_key_preview: str | None = None
    llm_api_key_source: str
    embedding_provider: str
    embedding_base_url: str
    embedding_model: str
    embedding_has_api_key: bool
    embedding_api_key_preview: str | None = None
    embedding_api_key_source: str
    reindex_required: bool = False
    notice: str | None = None


class ModelConfigUpdateRequest(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def expand_legacy_payload(cls, data: Any) -> Any:
        return _expand_legacy_model_config_payload(data)

    llm_provider: str
    llm_base_url: str = ""
    llm_model: str
    llm_api_key: str | None = None
    clear_llm_api_key: bool = False
    embedding_provider: str
    embedding_base_url: str = ""
    embedding_model: str
    embedding_api_key: str | None = None
    clear_embedding_api_key: bool = False


class ModelConfigTestRequest(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def expand_legacy_payload(cls, data: Any) -> Any:
        return _expand_legacy_model_config_payload(data)

    llm_provider: str
    llm_base_url: str = ""
    llm_model: str
    llm_api_key: str | None = None
    use_saved_llm_api_key: bool = False
    embedding_provider: str
    embedding_base_url: str = ""
    embedding_model: str
    embedding_api_key: str | None = None
    use_saved_embedding_api_key: bool = False


class ModelConfigTestResponse(BaseModel):
    llm_provider: str
    llm_base_url: str
    llm_model: str
    embedding_provider: str
    embedding_base_url: str
    embedding_model: str
    llm_ok: bool
    embedding_ok: bool
    message: str
