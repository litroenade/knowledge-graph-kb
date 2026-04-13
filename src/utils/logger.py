"""Shared Rich-backed logging configuration for the backend."""

from __future__ import annotations

import logging
from typing import Final

from rich.console import Console
from rich.logging import RichHandler
from rich.pretty import install as install_rich_pretty
from rich.traceback import install as install_rich_traceback

DEFAULT_LOG_MESSAGE_FORMAT: Final[str] = "%(name)s | %(message)s"
DEFAULT_RICH_TIME_FORMAT: Final[str] = "[%Y-%m-%d %H:%M:%S]"
NOISY_LOGGER_LEVELS: Final[dict[str, int]] = {
    "uvicorn.access": logging.WARNING,
    "httpx": logging.WARNING,
    "httpcore": logging.WARNING,
    "openai": logging.WARNING,
    "multipart": logging.WARNING,
    "faiss.loader": logging.WARNING,
}
MANAGED_LOGGERS: Final[tuple[str, ...]] = (
    "src",
    "uvicorn",
    "uvicorn.error",
    "uvicorn.access",
)

_LOGGING_CONFIGURED = False
_RICH_CONSOLE = Console(stderr=True, soft_wrap=True)


def _resolve_log_level(log_level: str) -> int:
    """Resolve a text log level into a stdlib logging constant."""

    normalized_level = str(log_level or "INFO").strip().upper()
    return getattr(logging, normalized_level, logging.INFO)


def _build_rich_handler(log_level: int) -> RichHandler:
    handler = RichHandler(
        console=_RICH_CONSOLE,
        show_time=True,
        omit_repeated_times=False,
        show_level=True,
        show_path=False,
        markup=False,
        rich_tracebacks=True,
        tracebacks_show_locals=False,
        log_time_format=DEFAULT_RICH_TIME_FORMAT,
    )
    handler.setLevel(log_level)
    handler.setFormatter(logging.Formatter(DEFAULT_LOG_MESSAGE_FORMAT))
    return handler


def _normalize_managed_logger(logger_name: str, level: int) -> None:
    managed_logger = logging.getLogger(logger_name)
    managed_logger.handlers.clear()
    managed_logger.propagate = True
    managed_logger.setLevel(level)


def configure_logging(log_level: str = "INFO") -> None:
    """Configure root logging once and keep levels in sync afterwards."""

    global _LOGGING_CONFIGURED

    resolved_level = _resolve_log_level(log_level)
    root_logger = logging.getLogger()

    if not _LOGGING_CONFIGURED:
        install_rich_pretty(console=_RICH_CONSOLE)
        install_rich_traceback(console=_RICH_CONSOLE, show_locals=False)
        logging.captureWarnings(True)
        root_logger.handlers.clear()
        root_logger.addHandler(_build_rich_handler(resolved_level))
        _LOGGING_CONFIGURED = True

    root_logger.setLevel(resolved_level)
    for handler in root_logger.handlers:
        handler.setLevel(resolved_level)

    for logger_name in MANAGED_LOGGERS:
        _normalize_managed_logger(logger_name, resolved_level)

    for logger_name, noisy_level in NOISY_LOGGER_LEVELS.items():
        noisy_logger = logging.getLogger(logger_name)
        noisy_logger.handlers.clear()
        noisy_logger.propagate = True
        noisy_logger.setLevel(noisy_level)


def get_logger(name: str) -> logging.Logger:
    """Return a module logger routed through the shared Rich configuration."""

    return logging.getLogger(name)
