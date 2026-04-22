"""Common schemas shared by multiple route groups."""

from typing import Literal

from pydantic import BaseModel, Field


class StatusResponse(BaseModel):
    status: str


class KBScopeItem(BaseModel):
    mode: Literal["all", "single", "subset"]
    source_ids: list[str] = Field(default_factory=list)
    version_mode: Literal["latest", "specific"] = "latest"
    version_id: str | None = None
    excluded_source_ids: list[str] = Field(default_factory=list)
