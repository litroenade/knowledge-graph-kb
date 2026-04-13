"""Shared retrieval dataclasses for answer retrieval orchestration."""

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

ScopeMode = Literal["all", "single", "subset"]
VersionMode = Literal["latest", "specific"]


def _dedupe_strings(values: list[str] | None) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw_value in list(values or []):
        value = str(raw_value or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


@dataclass(slots=True)
class KBScope:
    """Explicit retrieval boundary for KB requests."""

    mode: ScopeMode
    source_ids: list[str] = field(default_factory=list)
    version_mode: VersionMode = "latest"
    version_id: str | None = None
    excluded_source_ids: list[str] = field(default_factory=list)

    @classmethod
    def from_payload(cls, payload: Any) -> "KBScope":
        if isinstance(payload, KBScope):
            return payload.validate()
        if not isinstance(payload, dict):
            raise ValueError("A scope payload is required.")
        return cls(
            mode=str(payload.get("mode") or "").strip() or "all",
            source_ids=_dedupe_strings(payload.get("source_ids")),
            version_mode=str(payload.get("version_mode") or "latest").strip() or "latest",
            version_id=str(payload.get("version_id") or "").strip() or None,
            excluded_source_ids=_dedupe_strings(payload.get("excluded_source_ids")),
        ).validate()

    def validate(self) -> "KBScope":
        normalized_mode = str(self.mode or "").strip()
        if normalized_mode not in {"all", "single", "subset"}:
            raise ValueError("Scope mode must be one of: all, single, subset.")
        normalized_version_mode = str(self.version_mode or "").strip() or "latest"
        if normalized_version_mode not in {"latest", "specific"}:
            raise ValueError("Scope version_mode must be one of: latest, specific.")

        normalized_source_ids = _dedupe_strings(self.source_ids)
        normalized_excluded_source_ids = [
            source_id
            for source_id in _dedupe_strings(self.excluded_source_ids)
            if source_id not in normalized_source_ids
        ]
        normalized_version_id = str(self.version_id or "").strip() or None

        if normalized_mode == "single" and len(normalized_source_ids) != 1:
            raise ValueError("single scope requires exactly one source_id.")
        if normalized_mode == "subset" and not normalized_source_ids:
            raise ValueError("subset scope requires at least one source_id.")
        if normalized_mode == "all":
            normalized_source_ids = []
        if normalized_version_mode == "specific" and not normalized_version_id:
            raise ValueError("specific version_mode requires version_id.")
        if normalized_version_mode == "latest":
            normalized_version_id = None

        return KBScope(
            mode=normalized_mode,  # type: ignore[arg-type]
            source_ids=normalized_source_ids,
            version_mode=normalized_version_mode,  # type: ignore[arg-type]
            version_id=normalized_version_id,
            excluded_source_ids=normalized_excluded_source_ids,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "source_ids": list(self.source_ids),
            "version_mode": self.version_mode,
            "version_id": self.version_id,
            "excluded_source_ids": list(self.excluded_source_ids),
        }


@dataclass(slots=True)
class ScopedSourceVersion:
    """Concrete source/version pair resolved from a KBScope."""

    source_id: str
    version_id: str
    source_name: str | None = None
    file_path: str | None = None

    def key(self) -> tuple[str, str]:
        return self.source_id, self.version_id


@dataclass(slots=True)
class RetrievalRequest:
    """Normalized retrieval request used across retrievers."""

    query: str
    scope: KBScope
    scope_pairs: list[ScopedSourceVersion] = field(default_factory=list)
    worksheet_names: list[str] = field(default_factory=list)
    filters: dict[str, str] = field(default_factory=dict)
    top_k: int = 6


@dataclass(slots=True)
class ParagraphHit:
    """A paragraph-level hit returned by any retriever."""

    paragraph_id: str
    source_id: str
    version_id: str
    score: float
    rank: int
    retriever: str
    match_type: str
    file_path: str | None = None
    chunk_id: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class RetrievalLaneTrace:
    """A single retriever or post-processing lane trace."""

    executed: bool
    skipped_reason: str | None
    hit_count: int
    latency_ms: float
    top_paragraph_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class RetrievalTrace:
    """Full answer retrieval trace for structured, vector, fusion, and PPR lanes."""

    structured: RetrievalLaneTrace
    vector: RetrievalLaneTrace
    fusion: RetrievalLaneTrace
    ppr: RetrievalLaneTrace
    total_ms: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "structured": self.structured.to_dict(),
            "vector": self.vector.to_dict(),
            "fusion": self.fusion.to_dict(),
            "ppr": self.ppr.to_dict(),
            "total_ms": self.total_ms,
        }


@dataclass(slots=True)
class HybridRetrievalResult:
    """Final retrieval result used by answer generation."""

    hits: list[ParagraphHit]
    retrieval_mode: str
    trace: RetrievalTrace
    highlighted_node_ids: list[str] = field(default_factory=list)
    highlighted_edge_ids: list[str] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)
