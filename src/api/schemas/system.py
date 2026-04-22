"""System and error API schemas."""

from typing import Any

from pydantic import BaseModel, Field


class SystemHealthResponse(BaseModel):
    status: str = "ok"


class SystemCheckItem(BaseModel):
    name: str
    ok: bool
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class SystemReadyResponse(BaseModel):
    status: str
    checks: list[SystemCheckItem] = Field(default_factory=list)


class ApiErrorResponse(BaseModel):
    code: str
    message: str
