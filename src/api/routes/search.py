"""Knowledge-base search routes."""

from fastapi import APIRouter, Depends

from src.api.dependencies import (
    get_entity_search_service,
    get_record_search_service,
    get_relation_search_service,
    get_source_search_service,
)
from src.api.errors import api_error
from src.api.schemas.search import (
    EntitySearchRequest,
    EntitySearchResponse,
    RecordSearchRequest,
    RecordSearchResponse,
    RelationSearchRequest,
    RelationSearchResponse,
    SourceSearchRequest,
    SourceSearchResponse,
)
from src.kb.infrastructure.providers import OpenAiConfigurationError, OpenAiRequestError

search_router = APIRouter(prefix="/api/kb/search", tags=["kb-search"])


@search_router.post("/records", response_model=RecordSearchResponse)
def search_records(
    payload: RecordSearchRequest,
    record_search_service=Depends(get_record_search_service),
) -> RecordSearchResponse:
    try:
        result = record_search_service.search_records(
            query=payload.query,
            scope=payload.scope.model_dump(),
            worksheet_names=payload.worksheet_names,
            filters=payload.filters,
            limit=payload.limit,
        )
    except OpenAiConfigurationError as exc:
        raise api_error(status_code=503, code="model_config_error", message=str(exc)) from exc
    except OpenAiRequestError as exc:
        raise api_error(status_code=exc.status_code, code="model_request_error", message=str(exc)) from exc
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_record_search", message=str(exc)) from exc
    return RecordSearchResponse(**result)


@search_router.post("/entities", response_model=EntitySearchResponse)
def search_entities(payload: EntitySearchRequest, entity_search_service=Depends(get_entity_search_service)) -> EntitySearchResponse:
    try:
        return EntitySearchResponse(
            **entity_search_service.search_entities(
                query=payload.query,
                scope=payload.scope.model_dump(),
                limit=payload.limit,
            )
        )
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_entity_search", message=str(exc)) from exc


@search_router.post("/relations", response_model=RelationSearchResponse)
def search_relations(
    payload: RelationSearchRequest,
    relation_search_service=Depends(get_relation_search_service),
) -> RelationSearchResponse:
    try:
        return RelationSearchResponse(
            **relation_search_service.search_relations(
                query=payload.query,
                scope=payload.scope.model_dump(),
                limit=payload.limit,
            )
        )
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_relation_search", message=str(exc)) from exc


@search_router.post("/sources", response_model=SourceSearchResponse)
def search_sources(payload: SourceSearchRequest, source_search_service=Depends(get_source_search_service)) -> SourceSearchResponse:
    try:
        return SourceSearchResponse(
            **source_search_service.search_sources(
                query=payload.query,
                scope=payload.scope.model_dump(),
                limit=payload.limit,
            )
        )
    except ValueError as exc:
        raise api_error(status_code=400, code="invalid_source_search", message=str(exc)) from exc
