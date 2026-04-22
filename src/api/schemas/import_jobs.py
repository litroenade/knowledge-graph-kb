"""Import job API schemas."""

from typing import Any

from pydantic import BaseModel, Field


class PasteImportRequest(BaseModel):
    title: str
    content: str
    strategy: str = "auto"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ScanImportRequest(BaseModel):
    root_path: str
    glob_pattern: str = "**/*"
    strategy: str = "auto"


class StructuredImportRequest(BaseModel):
    title: str
    payload: dict[str, Any]
    strategy: str = "auto"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ImportJobChunkItem(BaseModel):
    id: str
    job_id: str
    file_id: str
    paragraph_id: str | None = None
    chunk_index: int
    chunk_type: str
    status: str
    step: str
    progress: float
    content_preview: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    created_at: str
    updated_at: str


class ImportJobFileItem(BaseModel):
    id: str
    job_id: str
    source_id: str | None = None
    name: str
    source_kind: str
    input_mode: str
    strategy: str
    status: str
    current_step: str
    progress: float
    total_chunks: int
    completed_chunks: int
    failed_chunks: int
    storage_path: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    failure_stage: str | None = None
    step_durations: dict[str, float] = Field(default_factory=dict)
    stats: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str
    chunks: list[ImportJobChunkItem] = Field(default_factory=list)


class ImportJobItem(BaseModel):
    id: str
    source: str
    input_mode: str
    strategy: str
    status: str
    current_step: str
    progress: float
    total_files: int
    completed_files: int
    failed_files: int
    total_chunks: int
    completed_chunks: int
    failed_chunks: int
    message: str | None = None
    error: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    failure_stage: str | None = None
    step_durations: dict[str, float] = Field(default_factory=dict)
    retry_of: str | None = None
    stats: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    updated_at: str
    files: list[ImportJobFileItem] = Field(default_factory=list)


class ImportJobResponse(BaseModel):
    job: ImportJobItem
