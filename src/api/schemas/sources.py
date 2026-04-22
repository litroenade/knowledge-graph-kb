"""Source browsing API schemas."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class ParagraphItem(BaseModel):
    id: str
    source_id: str
    version_id: str
    position: int
    content: str
    knowledge_type: str
    token_count: int
    vector_state: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    render_kind: Literal["text", "row_record", "sheet_summary", "worksheet_preview"] = "text"
    rendered_html: str | None = None
    render_metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str


class SourceItem(BaseModel):
    id: str
    name: str
    source_kind: str
    input_mode: str
    file_type: str | None = None
    storage_path: str | None = None
    strategy: str
    status: str
    summary: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str
    active_version_id: str | None = None
    active_version_number: int | None = None
    version_count: int = 0


class SourceVersionItem(BaseModel):
    id: str
    source_id: str
    version_number: int
    status: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    activated_at: str | None = None
    updated_at: str


class SourceDetailResponse(BaseModel):
    source: SourceItem
    paragraph_count: int
    entity_count: int
    relation_count: int
    selected_version: SourceVersionItem | None = None
    versions: list[SourceVersionItem] = Field(default_factory=list)


class SourceParagraphsResponse(BaseModel):
    items: list[ParagraphItem] = Field(default_factory=list)


class WorksheetItem(BaseModel):
    worksheet_key: str
    worksheet_name: str
    row_count: int
    headers: list[str] = Field(default_factory=list)
    column_keys: list[str] = Field(default_factory=list)


class WorksheetListResponse(BaseModel):
    items: list[WorksheetItem] = Field(default_factory=list)


class WorksheetPreviewPageItem(BaseModel):
    paragraph_id: str | None = None
    row_index: int
    record_key: str | None = None
    cells: dict[str, str] = Field(default_factory=dict)


class WorksheetPreviewResponse(BaseModel):
    source_id: str
    version_id: str | None = None
    worksheet_key: str
    worksheet_name: str
    headers: list[str] = Field(default_factory=list)
    column_keys: list[str] = Field(default_factory=list)
    items: list[WorksheetPreviewPageItem] = Field(default_factory=list)
    render_kind: Literal["worksheet_preview"] = "worksheet_preview"
    rendered_html: str | None = None
    render_metadata: dict[str, Any] = Field(default_factory=dict)
    page: int = 1
    page_size: int = 50
    total_rows: int = 0
    has_prev: bool = False
    has_next: bool = False
    row_range_start: int = 0
    row_range_end: int = 0
    anchor_row_index: int | None = None
    highlighted_row_indexes: list[int] = Field(default_factory=list)
    highlighted_columns: list[str] = Field(default_factory=list)


class SourceUpdateRequest(BaseModel):
    name: str | None = None
    summary: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
