"""Application runtime settings and path helpers."""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
ROOT_ENV_FILE = ROOT_DIR / ".env"
DEFAULT_ROOT_ENV_FILE_CONTENT = """# Backend runtime configuration.
# This file is auto-created when missing. Edit it to override local backend settings.

KB_DATA_DIR=./data/kb
KB_DATABASE_NAME=kb.sqlite3
KB_VECTOR_INDEX_DIR_NAME=vector_index
KB_UPLOAD_DIR_NAME=uploads
KB_SECRET_DIR_NAME=secrets
MODEL_CONFIG_SECRET_NAME=model_config.key
KB_SCAN_ROOTS=["./data/kb/uploads"]

FRONTEND_DIST_DIR=./frontend/dist
SERVER_HOST=127.0.0.1
SERVER_PORT=8000
LOG_LEVEL=INFO
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]

EMBEDDING_BATCH_SIZE=32
CHUNK_SIZE_TOKENS=600
CHUNK_OVERLAP_TOKENS=120
QUERY_CONTEXT_CHUNKS=6
QUERY_RRF_K=60
QUERY_STRUCTURED_SHORT_CIRCUIT_HITS=3
QUERY_PPR_ENABLED=false
QUERY_PPR_MIN_HITS=5
QUERY_PPR_CANDIDATE_LIMIT=30
QUERY_HISTORY_TURNS=3
"""


class Settings(BaseSettings):
    """Application-level settings loaded from the root `.env` file."""

    app_name: str = "Knowledge Graph KB"
    kb_data_dir: str = Field(default="./data/kb", validation_alias=AliasChoices("KB_DATA_DIR"))
    kb_database_name: str = Field(default="kb.sqlite3", validation_alias=AliasChoices("KB_DATABASE_NAME"))
    kb_vector_index_dir_name: str = Field(
        default="vector_index",
        validation_alias=AliasChoices("KB_VECTOR_INDEX_DIR_NAME"),
    )
    kb_upload_dir_name: str = Field(default="uploads", validation_alias=AliasChoices("KB_UPLOAD_DIR_NAME"))
    kb_secret_dir_name: str = Field(default="secrets", validation_alias=AliasChoices("KB_SECRET_DIR_NAME"))
    model_config_secret_name: str = Field(
        default="model_config.key",
        validation_alias=AliasChoices("MODEL_CONFIG_SECRET_NAME"),
    )
    kb_scan_roots: list[str] = Field(
        default_factory=lambda: ["./data/kb/uploads"],
        validation_alias=AliasChoices("KB_SCAN_ROOTS"),
    )
    frontend_dist_dir: str = Field(default="./frontend/dist", validation_alias=AliasChoices("FRONTEND_DIST_DIR"))
    server_host: str = Field(default="127.0.0.1", validation_alias=AliasChoices("SERVER_HOST"))
    server_port: int = Field(default=8000, validation_alias=AliasChoices("SERVER_PORT"))
    log_level: str = Field(default="DEBUG", validation_alias=AliasChoices("LOG_LEVEL"))
    embedding_batch_size: int = Field(default=32, validation_alias=AliasChoices("EMBEDDING_BATCH_SIZE"))
    chunk_size_tokens: int = Field(default=600, validation_alias=AliasChoices("CHUNK_SIZE_TOKENS"))
    chunk_overlap_tokens: int = Field(default=120, validation_alias=AliasChoices("CHUNK_OVERLAP_TOKENS"))
    query_context_chunks: int = Field(default=6, validation_alias=AliasChoices("QUERY_CONTEXT_CHUNKS"))
    query_rrf_k: int = Field(default=60, validation_alias=AliasChoices("QUERY_RRF_K"))
    query_structured_short_circuit_hits: int = Field(
        default=3,
        validation_alias=AliasChoices("QUERY_STRUCTURED_SHORT_CIRCUIT_HITS"),
    )
    query_ppr_enabled: bool = Field(default=False, validation_alias=AliasChoices("QUERY_PPR_ENABLED"))
    query_ppr_min_hits: int = Field(default=5, validation_alias=AliasChoices("QUERY_PPR_MIN_HITS"))
    query_ppr_candidate_limit: int = Field(default=30, validation_alias=AliasChoices("QUERY_PPR_CANDIDATE_LIMIT"))
    query_history_turns: int = Field(default=3, validation_alias=AliasChoices("QUERY_HISTORY_TURNS"))
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"],
        validation_alias=AliasChoices("CORS_ORIGINS"),
    )

    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_FILE,
        env_prefix="",
        case_sensitive=False,
        populate_by_name=True,
    )

    @property
    def resolved_kb_data_dir(self) -> Path:
        return self._resolve_path(self.kb_data_dir)

    @property
    def resolved_kb_db_path(self) -> Path:
        return self.resolved_kb_data_dir / self.kb_database_name

    @property
    def resolved_kb_vector_dir(self) -> Path:
        return self.resolved_kb_data_dir / self.kb_vector_index_dir_name

    @property
    def resolved_kb_upload_dir(self) -> Path:
        return self.resolved_kb_data_dir / self.kb_upload_dir_name

    @property
    def resolved_model_config_secret_path(self) -> Path:
        return self.resolved_kb_data_dir / self.kb_secret_dir_name / self.model_config_secret_name

    @property
    def resolved_kb_scan_roots(self) -> list[Path]:
        return [self._resolve_path(path) for path in self.kb_scan_roots]

    @property
    def resolved_frontend_dist_dir(self) -> Path:
        return self._resolve_path(self.frontend_dist_dir)

    def _resolve_path(self, value: str) -> Path:
        path = Path(value)
        if path.is_absolute():
            return path
        return (ROOT_DIR / path).resolve()


@lru_cache
def get_settings() -> Settings:
    ensure_root_env_file()
    return Settings()


def ensure_root_env_file() -> Path:
    if ROOT_ENV_FILE.exists():
        if not ROOT_ENV_FILE.is_file():
            raise RuntimeError(f"Root env path is not a file: {ROOT_ENV_FILE}")
        return ROOT_ENV_FILE
    ROOT_ENV_FILE.write_text(DEFAULT_ROOT_ENV_FILE_CONTENT, encoding="utf-8")
    return ROOT_ENV_FILE


def ensure_app_dirs(settings: Settings | None = None) -> None:
    active_settings = settings or get_settings()
    active_settings.resolved_kb_data_dir.mkdir(parents=True, exist_ok=True)
    active_settings.resolved_kb_vector_dir.mkdir(parents=True, exist_ok=True)
    active_settings.resolved_kb_upload_dir.mkdir(parents=True, exist_ok=True)
    active_settings.resolved_model_config_secret_path.parent.mkdir(parents=True, exist_ok=True)
