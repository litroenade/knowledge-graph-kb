from threading import Event

from fastapi.testclient import TestClient

from src.kb.application.imports.service import ImportCancelledError


def test_cancel_job_transitions_from_cancelling_to_cancelled(client: TestClient, monkeypatch) -> None:
    container = client.app.state.kb_container
    import_service = container.import_service
    job_store = container.import_job_store
    executor = import_service.executor

    job = job_store.create_job(
        source="manual-cancel",
        input_mode="paste",
        strategy="auto",
        params={},
        total_files=1,
    )
    job_store.create_job_file(
        job_id=job["id"],
        name="manual-cancel.txt",
        source_kind="paste",
        input_mode="paste",
        strategy="auto",
        storage_path=None,
        metadata={},
    )

    cancellation_event = Event()
    executor._cancellations[job["id"]] = cancellation_event

    cancel_response = client.post(f"/api/kb/imports/jobs/{job['id']}/cancel")
    assert cancel_response.status_code == 200, cancel_response.text

    cancelling_job = cancel_response.json()
    assert cancelling_job["status"] == "cancelling"
    assert cancelling_job["current_step"] == "cancelling"
    assert cancelling_job["finished_at"] is None

    cancellation_event.set()

    def fake_process_item(**kwargs):
        if kwargs["is_cancel_requested"]():
            raise ImportCancelledError("cancel requested")
        return "source-1"

    monkeypatch.setattr(executor.pipeline, "process_item", fake_process_item)

    executor._run_job(
        job_id=job["id"],
        items=[{"name": "manual-cancel.txt"}],
        cancellation_event=cancellation_event,
    )

    final_job = import_service.get_job(job["id"])
    assert final_job is not None
    assert final_job["status"] == "cancelled"
    assert final_job["current_step"] == "cancelled"
    assert final_job["finished_at"] is not None
    assert final_job["files"][0]["status"] == "cancelled"
