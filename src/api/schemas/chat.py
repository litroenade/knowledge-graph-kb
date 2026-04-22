"""Chat and answer API schemas."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from src.api.schemas.common import KBScopeItem


class AnswerSourceItem(BaseModel):
    source_id: str
    version_id: str
    source_name: str
    file_path: str | None = None
    citation_count: int
    snippet: str | None = None


class CitationItem(BaseModel):
    paragraph_id: str
    chunk_id: str | None = None
    source_id: str
    version_id: str | None = None
    source_name: str
    file_path: str | None = None
    excerpt: str
    snippet: str | None = None
    score: float
    match_reason: str | None = None
    matched_fields: list[str] = Field(default_factory=list)
    source_kind: str | None = None
    worksheet_name: str | None = None
    worksheet_key: str | None = None
    row_index: int | None = None
    anchor_row_index: int | None = None
    page_number: int | None = None
    paragraph_position: int | None = None
    winning_lane: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    anchor_node_ids: list[str] = Field(default_factory=list)
    preferred_anchor_node_id: str | None = None
    render_kind: Literal["text", "row_record", "sheet_summary", "worksheet_preview"] = "text"
    rendered_html: str | None = None
    render_metadata: dict[str, Any] = Field(default_factory=dict)


class AnswerExecutionItem(BaseModel):
    status: str
    retrieval_mode: str
    model_invoked: bool
    matched_paragraph_count: int
    message: str


class RetrievalTraceLaneItem(BaseModel):
    executed: bool
    skipped_reason: str | None = None
    hit_count: int
    latency_ms: float
    top_paragraph_ids: list[str] = Field(default_factory=list)


class RetrievalTraceItem(BaseModel):
    structured: RetrievalTraceLaneItem
    vector: RetrievalTraceLaneItem
    fusion: RetrievalTraceLaneItem
    ppr: RetrievalTraceLaneItem
    total_ms: float


class ChatSessionCreateRequest(BaseModel):
    title: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatMessageCreateRequest(BaseModel):
    content: str
    scope: KBScopeItem
    worksheet_names: list[str] | None = None
    top_k: int | None = None


class ChatSessionItem(BaseModel):
    id: str
    title: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str
    last_message_at: str | None = None


class ChatMessageItem(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    turn_index: int
    citations: list[CitationItem] = Field(default_factory=list)
    scope: KBScopeItem | None = None
    sources: list[AnswerSourceItem] = Field(default_factory=list)
    execution: AnswerExecutionItem | None = None
    retrieval_trace: RetrievalTraceItem | None = None
    highlighted_node_ids: list[str] = Field(default_factory=list)
    highlighted_edge_ids: list[str] = Field(default_factory=list)
    error: str | None = None
    created_at: str
    updated_at: str


class ChatSessionDetailResponse(BaseModel):
    session: ChatSessionItem
    messages: list[ChatMessageItem] = Field(default_factory=list)
