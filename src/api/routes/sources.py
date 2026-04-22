"""Source browsing routes."""

from fastapi import APIRouter, Depends, Query

from src.api.dependencies import get_graph_service, get_source_service
from src.api.errors import api_error
from src.api.schemas.common import StatusResponse
from src.api.schemas.sources import (
    SourceDetailResponse,
    SourceItem,
    SourceParagraphsResponse,
    SourceUpdateRequest,
    WorksheetListResponse,
    WorksheetPreviewResponse,
)

source_router = APIRouter(prefix="/api/kb/sources", tags=["kb-sources"])


@source_router.get("", response_model=list[SourceItem])
def list_sources(
    keyword: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    mode: str | None = Query(default=None),
    source_ids: list[str] = Query(default_factory=list),
    version_mode: str | None = Query(default=None),
    version_id: str | None = Query(default=None),
    excluded_source_ids: list[str] = Query(default_factory=list),
    source_service=Depends(get_source_service),
) -> list[SourceItem]:
    scope = None
    if mode is not None or source_ids or version_mode is not None or version_id is not None or excluded_source_ids:
        scope = {
            "mode": mode or ("subset" if source_ids else "all"),
            "source_ids": source_ids,
            "version_mode": version_mode or ("specific" if version_id else "latest"),
            "version_id": version_id,
            "excluded_source_ids": excluded_source_ids,
        }
    try:
        return [
            SourceItem(**item)
            for item in source_service.list_sources(
                keyword=keyword,
                limit=limit,
                scope=scope,
            )
        ]
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_source_scope", message=str(exc)) from exc


@source_router.get("/{source_id}", response_model=SourceDetailResponse)
def get_source_detail(
    source_id: str,
    version_id: str | None = Query(default=None),
    source_service=Depends(get_source_service),
) -> SourceDetailResponse:
    detail = source_service.get_source_detail(source_id, version_id=version_id)
    if detail is None:
        raise api_error(status_code=404, code="source_not_found", message="Source not found.")
    return SourceDetailResponse(**detail)


@source_router.put("/{source_id}", response_model=SourceItem)
def update_source(
    source_id: str,
    payload: SourceUpdateRequest,
    source_service=Depends(get_source_service),
) -> SourceItem:
    try:
        source = source_service.update_source(
            source_id,
            name=payload.name,
            summary=payload.summary,
            metadata=payload.metadata,
        )
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_source", message=str(exc)) from exc
    if source is None:
        raise api_error(status_code=404, code="source_not_found", message="Source not found.")
    return SourceItem(**source)


@source_router.delete("/{source_id}", response_model=StatusResponse)
def delete_source(source_id: str, graph_service=Depends(get_graph_service)) -> StatusResponse:
    try:
        graph_service.delete_source(source_id)
    except KeyError as exc:
        raise api_error(status_code=404, code="source_not_found", message="Source not found.") from exc
    return StatusResponse(status="deleted")


@source_router.get("/{source_id}/paragraphs", response_model=SourceParagraphsResponse)
def list_source_paragraphs(
    source_id: str,
    version_id: str | None = Query(default=None),
    source_service=Depends(get_source_service),
) -> SourceParagraphsResponse:
    paragraphs = source_service.list_source_paragraphs(source_id, version_id=version_id)
    if paragraphs is None:
        raise api_error(status_code=404, code="source_not_found", message="Source not found.")
    return SourceParagraphsResponse(items=paragraphs)


@source_router.get("/{source_id}/worksheets", response_model=WorksheetListResponse)
def list_source_worksheets(
    source_id: str,
    version_id: str | None = Query(default=None),
    source_service=Depends(get_source_service),
) -> WorksheetListResponse:
    worksheets = source_service.list_source_worksheets(source_id, version_id=version_id)
    if worksheets is None:
        raise api_error(status_code=404, code="source_not_found", message="Source or version not found.")
    return WorksheetListResponse(items=worksheets)


@source_router.get("/{source_id}/worksheets/{worksheet_key}/preview", response_model=WorksheetPreviewResponse)
def get_source_worksheet_preview(
    source_id: str,
    worksheet_key: str,
    version_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    anchor_row: int | None = Query(default=None, ge=1),
    highlighted_columns: list[str] = Query(default_factory=list),
    source_service=Depends(get_source_service),
) -> WorksheetPreviewResponse:
    try:
        preview = source_service.get_source_worksheet_preview(
            source_id,
            worksheet_key,
            version_id=version_id,
            page=page,
            page_size=page_size,
            anchor_row_index=anchor_row,
            highlighted_columns=highlighted_columns,
        )
    except KeyError as exc:
        error_key = str(exc.args[0] if exc.args else "")
        if error_key == "source_version_not_found":
            raise api_error(status_code=404, code="source_version_not_found", message="Source version not found.") from exc
        if error_key == "worksheet_not_found":
            raise api_error(status_code=404, code="worksheet_not_found", message="Worksheet not found.") from exc
        raise api_error(status_code=404, code="source_not_found", message="Source not found.") from exc
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_worksheet_preview", message=str(exc)) from exc
    return WorksheetPreviewResponse(**preview)
