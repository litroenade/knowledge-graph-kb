"""Chat session routes."""

from fastapi import APIRouter, Depends, Query

from src.api.dependencies import get_conversation_service
from src.api.errors import api_error
from src.api.schemas.chat import (
    ChatMessageCreateRequest,
    ChatMessageItem,
    ChatSessionCreateRequest,
    ChatSessionDetailResponse,
    ChatSessionItem,
)
from src.kb.infrastructure.providers import OpenAiConfigurationError, OpenAiRequestError

chat_router = APIRouter(prefix="/api/kb/chat", tags=["kb-chat"])


@chat_router.get("/sessions", response_model=list[ChatSessionItem])
def list_chat_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    conversation_service=Depends(get_conversation_service),
) -> list[ChatSessionItem]:
    return [ChatSessionItem(**session) for session in conversation_service.list_sessions(limit=limit)]


@chat_router.post("/sessions", response_model=ChatSessionItem)
def create_chat_session(
    payload: ChatSessionCreateRequest,
    conversation_service=Depends(get_conversation_service),
) -> ChatSessionItem:
    return ChatSessionItem(**conversation_service.create_session(title=payload.title, metadata=payload.metadata))


@chat_router.get("/sessions/{session_id}", response_model=ChatSessionDetailResponse)
def get_chat_session(session_id: str, conversation_service=Depends(get_conversation_service)) -> ChatSessionDetailResponse:
    session = conversation_service.get_session(session_id)
    if session is None:
        raise api_error(
            status_code=404,
            code="chat_session_not_found",
            message="\u672a\u627e\u5230\u95ee\u7b54\u4f1a\u8bdd\u3002",
        )
    return ChatSessionDetailResponse(
        session=ChatSessionItem(**{key: value for key, value in session.items() if key != "messages"}),
        messages=[ChatMessageItem(**message) for message in list(session.get("messages") or [])],
    )


@chat_router.post("/sessions/{session_id}/messages", response_model=ChatSessionDetailResponse)
def create_chat_message(
    session_id: str,
    payload: ChatMessageCreateRequest,
    conversation_service=Depends(get_conversation_service),
) -> ChatSessionDetailResponse:
    try:
        session = conversation_service.post_user_message(
            session_id=session_id,
            content=payload.content,
            scope=payload.scope.model_dump(),
            worksheet_names=payload.worksheet_names,
            top_k=payload.top_k,
        )
    except OpenAiConfigurationError as exc:
        raise api_error(status_code=503, code="model_config_error", message=str(exc)) from exc
    except OpenAiRequestError as exc:
        raise api_error(status_code=exc.status_code, code="model_request_error", message=str(exc)) from exc
    except ValueError as exc:
        message = str(exc)
        if "not found" in message.lower() or "会话" in message:
            raise api_error(status_code=404, code="chat_session_not_found", message=message) from exc
        raise api_error(status_code=400, code="invalid_chat_request", message=message) from exc
    return ChatSessionDetailResponse(
        session=ChatSessionItem(**{key: value for key, value in session.items() if key != "messages"}),
        messages=[ChatMessageItem(**message) for message in list(session.get("messages") or [])],
    )
