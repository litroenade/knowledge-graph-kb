from fastapi.testclient import TestClient


ALL_SCOPE = {
    "mode": "all",
    "source_ids": [],
    "version_mode": "latest",
    "version_id": None,
    "excluded_source_ids": [],
}


def _subset_scope(source_id: str) -> dict[str, object]:
    return {
        "mode": "subset",
        "source_ids": [source_id],
        "version_mode": "latest",
        "version_id": None,
        "excluded_source_ids": [],
    }


def _import_source(client: TestClient, title: str, content: str) -> None:
    response = client.post(
        "/api/kb/imports/paste",
        json={
            "title": title,
            "content": content,
            "strategy": "auto",
            "metadata": {"filename": title},
        },
    )
    assert response.status_code == 200, response.text


def _source_id_by_name(client: TestClient, title: str) -> str:
    response = client.get("/api/kb/sources", params={"keyword": title, "limit": 20})
    assert response.status_code == 200, response.text
    matches = [item for item in response.json() if item["name"] == title]
    assert matches, response.json()
    return str(matches[0]["id"])


def test_query_search_endpoints_respect_scope(client: TestClient) -> None:
    _import_source(client, "Scope One.txt", "Alpha and Beta are linked in the same paragraph.")
    _import_source(client, "Scope Two.txt", "Alpha appears alone in another source.")

    source_one_id = _source_id_by_name(client, "Scope One.txt")
    source_two_id = _source_id_by_name(client, "Scope Two.txt")

    entity_all_response = client.post(
        "/api/kb/search/entities",
        json={"query": "Beta", "scope": ALL_SCOPE, "limit": 20},
    )
    assert entity_all_response.status_code == 200, entity_all_response.text
    assert [item["display_name"] for item in entity_all_response.json()["items"]] == ["Beta"]

    entity_scoped_response = client.post(
        "/api/kb/search/entities",
        json={"query": "Beta", "scope": _subset_scope(source_two_id), "limit": 20},
    )
    assert entity_scoped_response.status_code == 200, entity_scoped_response.text
    assert entity_scoped_response.json()["items"] == []

    entity_alpha_scoped_response = client.post(
        "/api/kb/search/entities",
        json={"query": "Alpha", "scope": _subset_scope(source_two_id), "limit": 20},
    )
    assert entity_alpha_scoped_response.status_code == 200, entity_alpha_scoped_response.text
    assert [item["display_name"] for item in entity_alpha_scoped_response.json()["items"]] == ["Alpha"]

    relation_all_response = client.post(
        "/api/kb/search/relations",
        json={"query": "Beta", "scope": ALL_SCOPE, "limit": 20},
    )
    assert relation_all_response.status_code == 200, relation_all_response.text
    assert len(relation_all_response.json()["items"]) == 1

    relation_scoped_response = client.post(
        "/api/kb/search/relations",
        json={"query": "Beta", "scope": _subset_scope(source_two_id), "limit": 20},
    )
    assert relation_scoped_response.status_code == 200, relation_scoped_response.text
    assert relation_scoped_response.json()["items"] == []

    source_all_response = client.post(
        "/api/kb/search/sources",
        json={"query": "Scope", "scope": ALL_SCOPE, "limit": 20},
    )
    assert source_all_response.status_code == 200, source_all_response.text
    assert {item["id"] for item in source_all_response.json()["items"]} == {source_one_id, source_two_id}

    source_scoped_response = client.post(
        "/api/kb/search/sources",
        json={"query": "Scope", "scope": _subset_scope(source_two_id), "limit": 20},
    )
    assert source_scoped_response.status_code == 200, source_scoped_response.text
    assert [item["id"] for item in source_scoped_response.json()["items"]] == [source_two_id]
