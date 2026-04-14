"""Conversation service."""

from typing import Any

from src.config import Settings
from src.kb.providers import OpenAiConfigurationError, OpenAiRequestError
from src.kb.storage import ConversationStore
from src.utils.logger import get_logger

from ..retrieval.types import KBScope
from .answer import AnswerService

logger = get_logger(__name__)


class ConversationService:
    """Manage persisted QA sessions and messages."""

    DEFAULT_SESSION_TITLE = "\u65b0\u5bf9\u8bdd"

    def __init__(
        self,
        *,
        settings: Settings,
        store: ConversationStore,
        answer_service: AnswerService,
    ) -> None:
        self.settings = settings
        self.store = store
        self.answer_service = answer_service

    def list_sessions(self, *, limit: int = 50) -> list[dict[str, Any]]:
        return self.store.list_sessions(limit=limit)

    def create_session(self, *, title: str | None = None, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        normalized_title = str(title or "").strip() or self.DEFAULT_SESSION_TITLE
        return self.store.create_session(title=normalized_title, metadata=metadata)

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        session = self.store.get_session(session_id)
        if session is None:
            return None
        return self._hydrate_session_with_rendering(session)

    def post_user_message(
        self,
        *,
        session_id: str,
        content: str,
        scope: dict[str, Any],
        worksheet_names: list[str] | None = None,
        top_k: int | None = None,
    ) -> dict[str, Any]:
        session = self.store.get_session(session_id)
        if session is None:
            raise ValueError("\u672a\u627e\u5230\u95ee\u7b54\u4f1a\u8bdd\u3002")

        normalized_content = str(content or "").strip()
        if not normalized_content:
            raise ValueError("\u6d88\u606f\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a\u3002")
        normalized_scope = KBScope.from_payload(scope)

        existing_messages = self.store.list_messages(session_id)
        user_turn_count = sum(1 for message in existing_messages if str(message.get("role") or "") == "user")
        turn_index = user_turn_count + 1
        self.store.create_message(
            session_id=session_id,
            role="user",
            content=normalized_content,
            turn_index=turn_index,
            scope=normalized_scope.to_dict(),
        )
        self._update_session_after_user_message(
            session=session,
            session_id=session_id,
            content=normalized_content,
            existing_messages=existing_messages,
            scope=normalized_scope.to_dict(),
            worksheet_names=worksheet_names,
        )

        recent_history = self._history_context(existing_messages)
        try:
            answer_payload = self.answer_service.answer(
                query=normalized_content,
                scope=normalized_scope.to_dict(),
                worksheet_names=worksheet_names,
                top_k=top_k or self.settings.query_context_chunks,
                conversation_history=recent_history,
            )
        except Exception as exc:
            self._persist_failed_assistant_message(
                session_id=session_id,
                turn_index=turn_index,
                scope=normalized_scope.to_dict(),
                exc=exc,
            )
            raise
        self.store.create_message(
            session_id=session_id,
            role="assistant",
            content=str(answer_payload["answer"]),
            turn_index=turn_index,
            citations=list(answer_payload.get("citations") or []),
            scope=dict(answer_payload.get("scope") or normalized_scope.to_dict()),
            sources=list(answer_payload.get("sources") or []),
            execution=dict(answer_payload.get("execution") or {}),
            retrieval_trace=dict(answer_payload.get("retrieval_trace") or {}),
            highlighted_node_ids=list(answer_payload.get("highlighted_node_ids") or []),
            highlighted_edge_ids=list(answer_payload.get("highlighted_edge_ids") or []),
        )
        refreshed_session = self.store.get_session(session_id)
        if refreshed_session is None:
            raise ValueError("Chat session could not be reloaded after message persistence.")
        return self._hydrate_session_with_rendering(refreshed_session)

    def _hydrate_session_with_rendering(self, session: dict[str, Any]) -> dict[str, Any]:
        hydrated_session = self.store.hydrate_session(session)
        hydrated_messages: list[dict[str, Any]] = []
        for message in list(hydrated_session.get("messages") or []):
            normalized_message = dict(message)
            if str(normalized_message.get("role") or "") == "assistant":
                normalized_message["citations"] = self.answer_service.hydrate_citations(
                    list(normalized_message.get("citations") or [])
                )
            hydrated_messages.append(normalized_message)
        return {**hydrated_session, "messages": hydrated_messages}

    def _update_session_after_user_message(
        self,
        *,
        session: dict[str, Any],
        session_id: str,
        content: str,
        existing_messages: list[dict[str, Any]],
        scope: dict[str, Any],
        worksheet_names: list[str] | None,
    ) -> None:
        should_update_title = not existing_messages and str(session.get("title") or "").strip() == self.DEFAULT_SESSION_TITLE
        next_metadata = dict(session.get("metadata", {}))
        next_metadata["scope"] = dict(scope)
        if worksheet_names is not None:
            next_metadata["worksheet_names"] = list(worksheet_names)

        update_payload: dict[str, Any] = {"metadata": next_metadata}
        if should_update_title:
            update_payload["title"] = self._title_from_content(content)
        self.store.update_session(session_id, **update_payload)

    def _persist_failed_assistant_message(
        self,
        *,
        session_id: str,
        turn_index: int,
        scope: dict[str, Any],
        exc: Exception,
    ) -> None:
        error_message = self._error_message_from_exception(exc)
        try:
            self.store.create_message(
                session_id=session_id,
                role="assistant",
                content=error_message,
                turn_index=turn_index,
                scope=scope,
                execution={
                    "status": "failed",
                    "retrieval_mode": "none",
                    "model_invoked": False,
                    "matched_paragraph_count": 0,
                    "message": error_message,
                },
                error=error_message,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to persist assistant error message after QA failure: session_id=%s", session_id)

    def _error_message_from_exception(self, exc: Exception) -> str:
        if isinstance(exc, (OpenAiConfigurationError, OpenAiRequestError, ValueError)):
            message = str(exc).strip()
            if message:
                return message
        return "\u7cfb\u7edf\u6682\u65f6\u65e0\u6cd5\u5904\u7406\u5f53\u524d\u6d88\u606f\u3002"

    def _history_context(self, messages: list[dict[str, Any]]) -> list[dict[str, str]]:
        if not messages:
            return []
        history_window = max(0, self.settings.query_history_turns) * 2
        if history_window <= 0:
            return []
        recent_messages = messages[-history_window:]
        return [
            {
                "role": str(message.get("role") or ""),
                "content": str(message.get("content") or ""),
            }
            for message in recent_messages
            if str(message.get("content") or "").strip()
        ]

    def _title_from_content(self, content: str) -> str:
        compact = " ".join(content.split())
        if len(compact) <= 24:
            return compact
        return f"{compact[:24].rstrip()}..."
