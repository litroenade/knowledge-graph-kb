from fastapi.testclient import TestClient


def test_system_health_and_ready(client: TestClient) -> None:
    health_response = client.get("/api/system/health")
    assert health_response.status_code == 200
    assert health_response.json() == {"status": "ok"}

    ready_response = client.get("/api/system/ready")
    assert ready_response.status_code == 200

    payload = ready_response.json()
    assert payload["status"] == "degraded"
    check_names = {item["name"] for item in payload["checks"]}
    assert check_names == {"database", "vector_index", "model_config", "frontend_dist"}
    checks = {item["name"]: item for item in payload["checks"]}
    assert checks["database"]["ok"] is True
    assert checks["vector_index"]["ok"] is True
    assert checks["frontend_dist"]["ok"] is True
    assert checks["model_config"]["ok"] is False
