"""Knowledge-graph routes."""

from fastapi import APIRouter, Depends, Query

from src.api.dependencies import get_graph_service
from src.api.errors import api_error
from src.api.schemas.common import StatusResponse
from src.api.schemas.graph import (
    GraphEdgeDetailResponse,
    GraphNodeCreateRequest,
    GraphNodeDetailResponse,
    GraphNodeItem,
    GraphNodeUpdateRequest,
    GraphQueryRequest,
    GraphResponse,
    ManualRelationItem,
    ManualRelationRequest,
)

graph_router = APIRouter(prefix="/api/kb/graph", tags=["kb-graph"])


@graph_router.post("", response_model=GraphResponse)
def get_graph(
    payload: GraphQueryRequest,
    graph_service=Depends(get_graph_service),
) -> GraphResponse:
    try:
        return GraphResponse(
            **graph_service.build_graph(
                scope=payload.scope.model_dump(),
                view=payload.view,
                density=payload.density,
                anchor_node_ids=payload.anchor_node_ids,
                anchor_edge_ids=payload.anchor_edge_ids,
            )
        )
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_graph_query", message=str(exc)) from exc


@graph_router.get("", response_model=GraphResponse, deprecated=True)
def get_graph_legacy(
    source_ids: list[str] = Query(default_factory=list),
    view: str = Query(default="semantic"),
    density: int = Query(default=100, ge=1, le=100),
    graph_service=Depends(get_graph_service),
) -> GraphResponse:
    scope = {
        "mode": "subset" if source_ids else "all",
        "source_ids": source_ids,
        "version_mode": "latest",
        "version_id": None,
        "excluded_source_ids": [],
    }
    try:
        return GraphResponse(
            **graph_service.build_graph(
                scope=scope,
                view=view,
                density=density,
                anchor_node_ids=[],
                anchor_edge_ids=[],
            )
        )
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_graph_query", message=str(exc)) from exc


@graph_router.post("/nodes", response_model=GraphNodeItem)
def create_graph_node(
    payload: GraphNodeCreateRequest,
    graph_service=Depends(get_graph_service),
) -> GraphNodeItem:
    try:
        node = graph_service.create_manual_entity(
            label=payload.label,
            description=payload.description,
            source_id=payload.source_id,
            version_id=payload.version_id,
            metadata=payload.metadata,
        )
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_graph_node", message=str(exc)) from exc
    return GraphNodeItem(**node)


@graph_router.get("/nodes/{node_id}", response_model=GraphNodeDetailResponse)
def get_graph_node_detail(
    node_id: str,
    version_id: str | None = Query(default=None),
    graph_service=Depends(get_graph_service),
) -> GraphNodeDetailResponse:
    try:
        return GraphNodeDetailResponse(**graph_service.get_node_detail(node_id, version_id=version_id))
    except KeyError as exc:
        raise api_error(status_code=404, code="graph_node_not_found", message="Graph node not found.") from exc


@graph_router.put("/nodes/{node_id}", response_model=StatusResponse)
def update_graph_node(
    node_id: str,
    payload: GraphNodeUpdateRequest,
    graph_service=Depends(get_graph_service),
) -> StatusResponse:
    try:
        graph_service.update_node_label(node_id, payload.label)
    except KeyError as exc:
        raise api_error(status_code=404, code="graph_node_not_found", message="Graph node not found.") from exc
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_graph_node", message=str(exc)) from exc
    return StatusResponse(status="updated")


@graph_router.delete("/nodes/{node_id}", response_model=StatusResponse)
def delete_graph_node(node_id: str, graph_service=Depends(get_graph_service)) -> StatusResponse:
    try:
        graph_service.delete_node(node_id)
    except KeyError as exc:
        raise api_error(status_code=404, code="graph_node_not_found", message="Graph node not found.") from exc
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_graph_node", message=str(exc)) from exc
    return StatusResponse(status="deleted")


@graph_router.get("/edges/{edge_id}", response_model=GraphEdgeDetailResponse)
def get_graph_edge_detail(edge_id: str, graph_service=Depends(get_graph_service)) -> GraphEdgeDetailResponse:
    try:
        return GraphEdgeDetailResponse(**graph_service.get_edge_detail(edge_id))
    except KeyError as exc:
        raise api_error(status_code=404, code="graph_edge_not_found", message="Graph edge not found.") from exc


@graph_router.delete("/edges/{edge_id}", response_model=StatusResponse)
def delete_graph_edge(edge_id: str, graph_service=Depends(get_graph_service)) -> StatusResponse:
    try:
        graph_service.delete_edge(edge_id)
    except KeyError as exc:
        raise api_error(status_code=404, code="graph_edge_not_found", message="Graph edge not found.") from exc
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_graph_edge", message=str(exc)) from exc
    return StatusResponse(status="deleted")


@graph_router.get("/manual-relations", response_model=list[ManualRelationItem])
def list_manual_relations(graph_service=Depends(get_graph_service)) -> list[ManualRelationItem]:
    return [ManualRelationItem(**item) for item in graph_service.list_manual_relations()]


@graph_router.post("/manual-relations", response_model=ManualRelationItem)
def create_manual_relation(
    payload: ManualRelationRequest,
    graph_service=Depends(get_graph_service),
) -> ManualRelationItem:
    try:
        relation = graph_service.create_manual_relation(
            subject_node_id=payload.subject_node_id,
            predicate=payload.predicate,
            object_node_id=payload.object_node_id,
            weight=payload.weight,
            metadata=payload.metadata,
        )
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_manual_relation", message=str(exc)) from exc
    return ManualRelationItem(**relation)


@graph_router.delete("/manual-relations/{relation_id}", response_model=StatusResponse)
def delete_manual_relation(relation_id: str, graph_service=Depends(get_graph_service)) -> StatusResponse:
    if not graph_service.delete_manual_relation(relation_id):
        raise api_error(status_code=404, code="manual_relation_not_found", message="Manual relation not found.")
    return StatusResponse(status="deleted")
