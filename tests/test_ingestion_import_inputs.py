import json
from pathlib import Path

from src.config import Settings
from src.kb.ingestion.parser import detect_file_type, extract_text
from src.kb.ingestion.payloads import build_structured_import_item
from src.kb.ingestion.strategy import normalize_strategy
from src.kb.use_cases.imports.service import ImportPipeline, ImportService


class FakeImportJobStore:
    def __init__(self) -> None:
        self.jobs: dict[str, dict[str, object]] = {}
        self.job_files: list[dict[str, object]] = []

    def create_job(
        self,
        *,
        source: str,
        input_mode: str,
        strategy: str,
        params: dict[str, object],
        total_files: int,
    ) -> dict[str, object]:
        job = {
            "id": "job-1",
            "source": source,
            "input_mode": input_mode,
            "strategy": strategy,
            "params": params,
            "total_files": total_files,
        }
        self.jobs[str(job["id"])] = job
        return job

    def create_job_file(self, **kwargs: object) -> dict[str, object]:
        self.job_files.append(kwargs)
        return kwargs

    def get_job(self, job_id: str) -> dict[str, object] | None:
        return self.jobs.get(job_id)

    def hydrate_job(self, job: dict[str, object]) -> dict[str, object]:
        return {**job, "files": list(self.job_files)}


class FakeImportExecutor:
    def __init__(self) -> None:
        self.submitted: list[dict[str, object]] = []

    def submit(self, *, job_id: str, items: list[dict[str, object]]) -> None:
        self.submitted.append({"job_id": job_id, "items": items})


def test_detect_file_type_accepts_markdown_and_json() -> None:
    assert detect_file_type(Path("notes.md")) == "md"
    assert detect_file_type(Path("records.json")) == "json"


def test_extract_text_formats_record_json_as_factual_text(tmp_path: Path) -> None:
    path = tmp_path / "aquaculture.json"
    path.write_text(
        json.dumps(
            [
                {
                    "species_name": "bream",
                    "scientific_name": "Parabramis pekinensis",
                    "stocking_density": "2000-2200 per mu",
                    "dissolved_oxygen": "",
                    "notes": "high-density culture",
                },
                {
                    "species_name": "grass carp",
                    "scientific_name": "Ctenopharyngodon idella",
                    "feed_formula": "adjust feeding by water temperature",
                },
            ]
        ),
        encoding="utf-8",
    )

    text = extract_text(path)

    assert "Record 1" in text
    assert "species_name: bream" in text
    assert "stocking_density: 2000-2200 per mu" in text
    assert "dissolved_oxygen" not in text
    assert "Record 2" in text
    assert "feed_formula: adjust feeding by water temperature" in text


def test_structured_import_with_only_entities_and_relations_creates_anchor_paragraph() -> None:
    item = build_structured_import_item(
        name="openie result",
        payload={
            "entities": [
                {"name": "bream", "description": "freshwater fish"},
                {"name": "high-density culture", "description": "culture mode"},
            ],
            "relations": [
                {
                    "subject": "bream",
                    "predicate": "uses_mode",
                    "object": "high-density culture",
                    "confidence": 0.9,
                }
            ],
        },
        source_kind="openie",
        input_mode="json",
        strategy="auto",
    )

    assert item["text"]
    assert item["structured_paragraphs"] == [
        {
            "position": 0,
            "content": (
                "Entities:\n"
                "- bream: freshwater fish\n"
                "- high-density culture: culture mode\n\n"
                "Relations:\n"
                "- bream --uses_mode--> high-density culture (confidence=0.9)"
            ),
            "knowledge_type": "factual",
            "metadata": {"synthetic": True, "source": "structured_graph"},
        }
    ]


def test_structured_import_with_relation_only_infers_endpoint_entities() -> None:
    item = build_structured_import_item(
        name="relation-only result",
        payload={
            "relations": [
                {
                    "subject": "bream",
                    "predicate": "eats",
                    "object": "feed",
                }
            ],
        },
        source_kind="openie",
        input_mode="json",
        strategy="auto",
    )

    assert item["structured_entities"] == [
        {"name": "bream", "description": "", "metadata": {"inferred_from_relation": True}},
        {"name": "feed", "description": "", "metadata": {"inferred_from_relation": True}},
    ]
    assert item["text"] == (
        "Entities:\n"
        "- bream\n"
        "- feed\n\n"
        "Relations:\n"
        "- bream --eats--> feed (confidence=1)"
    )


def test_structured_json_paragraphs_use_selected_strategy_when_type_is_missing(tmp_path: Path) -> None:
    item = build_structured_import_item(
        name="structured paragraphs",
        payload={"paragraphs": [{"content": "first paragraph"}, "second paragraph"]},
        source_kind="convert",
        input_mode="json",
        strategy="narrative",
    )
    pipeline = ImportPipeline.__new__(ImportPipeline)
    pipeline.settings = Settings(kb_data_dir=str(tmp_path / "kb"))

    paragraphs = pipeline._build_paragraph_payloads(
        raw_text=str(item["text"]),
        item=item,
        strategy="narrative",
        source_file_type="json",
    )

    assert [paragraph["knowledge_type"] for paragraph in paragraphs] == ["narrative", "narrative"]


def test_import_service_normalizes_legacy_strategy_before_dispatch_and_retry(tmp_path: Path) -> None:
    job_store = FakeImportJobStore()
    executor = FakeImportExecutor()
    service = ImportService(
        settings=Settings(kb_data_dir=str(tmp_path / "kb")),
        job_store=job_store,
        executor=executor,
    )

    service.submit_paste(title="legacy strategy", content="line 1\nline 2", strategy="plain")

    assert job_store.job_files[0]["strategy"] == "factual"
    retry_payload = dict(job_store.job_files[0]["metadata"])["retry_payload"]
    assert retry_payload["strategy"] == "factual"
    submitted_items = executor.submitted[0]["items"]
    assert submitted_items[0]["strategy"] == "factual"


def test_legacy_frontend_strategy_aliases_remain_deterministic() -> None:
    assert normalize_strategy("plain") == "factual"
    assert normalize_strategy("table") == "factual"
