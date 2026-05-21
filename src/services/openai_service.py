"""Compatibility exports for legacy OpenAI service imports."""

from src.kb.infrastructure.providers.openai import (
    OpenAiConfigurationError,
    OpenAiGateway,
    OpenAiRequestError,
)

OpenAiService = OpenAiGateway

__all__ = [
    "OpenAiConfigurationError",
    "OpenAiGateway",
    "OpenAiRequestError",
    "OpenAiService",
]
