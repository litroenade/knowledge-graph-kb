"""Model configuration API schemas."""

from pydantic import BaseModel


class ModelConfigResponse(BaseModel):
    provider: str
    base_url: str
    llm_model: str
    embedding_model: str
    has_api_key: bool
    api_key_preview: str | None = None
    api_key_source: str
    reindex_required: bool = False
    notice: str | None = None


class ModelConfigUpdateRequest(BaseModel):
    provider: str
    base_url: str = ""
    llm_model: str
    embedding_model: str
    api_key: str | None = None
    clear_api_key: bool = False


class ModelConfigTestRequest(BaseModel):
    provider: str
    base_url: str = ""
    llm_model: str
    embedding_model: str
    api_key: str | None = None
    use_saved_api_key: bool = False


class ModelConfigTestResponse(BaseModel):
    provider: str
    base_url: str
    llm_model: str
    embedding_model: str
    llm_ok: bool
    embedding_ok: bool
    message: str
