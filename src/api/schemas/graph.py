"""Knowledge graph API schemas."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from src.api.schemas.common import KBScopeItem


class GraphNodeItem(BaseModel):
    id: str
    type: str
    label: str
    size: float
    score: float | None = None
    display_label: str | None = None
    kind_label: str | None = None
    source_name: str | None = None
    evidence_count: int | None = None
    family: Literal["semantic", "structure", "evidence"] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphEdgeItem(BaseModel):
    id: str
    source: str
    target: str
    type: str
    label: str
    weight: float
    display_label: str | None = None
    relation_kind_label: str | None = None
    source_name: str | None = None
    evidence_paragraph_id: str | None = None
    is_structural: bool | None = None
    family: Literal["semantic", "structure", "evidence"] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphResponse(BaseModel):
    view: Literal["semantic", "structure", "evidence"] = "semantic"
    nodes: list[GraphNodeItem] = Field(default_factory=list)
    edges: list[GraphEdgeItem] = Field(default_factory=list)


class GraphNodeDetailResponse(BaseModel):
    node: GraphNodeItem
    source: dict[str, Any] | None = None
    paragraphs: list[dict[str, Any]] = Field(default_factory=list)
    relations: list[dict[str, Any]] = Field(default_factory=list)


class GraphEdgeDetailResponse(BaseModel):
    edge: GraphEdgeItem
    source: dict[str, Any] | None = None
    paragraph: dict[str, Any] | None = None


class GraphNodeUpdateRequest(BaseModel):
    label: str


class GraphNodeCreateRequest(BaseModel):
    label: str
    description: str = ""
    source_id: str | None = None
    version_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphQueryRequest(BaseModel):
    scope: KBScopeItem
    view: Literal["semantic", "structure", "evidence"] = "semantic"
    density: int = 100
    anchor_node_ids: list[str] = Field(default_factory=list)
    anchor_edge_ids: list[str] = Field(default_factory=list)


class ManualRelationRequest(BaseModel):
    subject_node_id: str
    predicate: str
    object_node_id: str
    weight: float = 1.0
    metadata: dict[str, Any] = Field(default_factory=dict)


class ManualRelationItem(BaseModel):
    id: str
    subject_node_id: str
    predicate: str
    object_node_id: str
    weight: float
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str
