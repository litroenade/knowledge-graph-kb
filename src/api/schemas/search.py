"""Search API schemas."""

from typing import Annotated, Any

from pydantic import BaseModel, Field, StringConstraints

from src.api.schemas.common import KBScopeItem

SearchQuery = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class RecordSearchRequest(BaseModel):
    query: SearchQuery
    scope: KBScopeItem
    worksheet_names: list[str] = Field(default_factory=list)
    filters: dict[str, str] = Field(default_factory=dict)
    limit: int = Field(default=20, ge=1, le=100)


class RecordSearchItem(BaseModel):
    paragraph_id: str
    source_id: str
    source_name: str
    worksheet_name: str
    row_index: int
    content: str
    matched_cells: list[str] = Field(default_factory=list)
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class RecordSearchResponse(BaseModel):
    items: list[RecordSearchItem] = Field(default_factory=list)


class EntitySearchRequest(BaseModel):
    query: SearchQuery
    scope: KBScopeItem = Field(default_factory=lambda: KBScopeItem(mode="all"))
    limit: int = Field(default=20, ge=1, le=100)


class EntityItem(BaseModel):
    id: str
    display_name: str
    description: str | None = None
    appearance_count: int
    metadata: dict[str, Any] = Field(default_factory=dict)
    paragraph_ids: list[str] = Field(default_factory=list)


class EntitySearchResponse(BaseModel):
    items: list[EntityItem] = Field(default_factory=list)


class RelationSearchRequest(BaseModel):
    query: SearchQuery
    scope: KBScopeItem = Field(default_factory=lambda: KBScopeItem(mode="all"))
    limit: int = Field(default=20, ge=1, le=100)


class RelationItem(BaseModel):
    id: str
    subject_id: str
    subject_name: str
    predicate: str
    object_id: str
    object_name: str
    confidence: float
    source_paragraph_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RelationSearchResponse(BaseModel):
    items: list[RelationItem] = Field(default_factory=list)


class SourceSearchRequest(BaseModel):
    query: SearchQuery
    scope: KBScopeItem = Field(default_factory=lambda: KBScopeItem(mode="all"))
    limit: int = Field(default=20, ge=1, le=100)


class SourceSearchItem(BaseModel):
    id: str
    name: str
    source_kind: str
    summary: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    paragraph_count: int


class SourceSearchResponse(BaseModel):
    items: list[SourceSearchItem] = Field(default_factory=list)
