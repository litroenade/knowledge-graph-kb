"""Application service for graph projection and manual relations."""

from typing import Any

from src.kb.common import (
    build_contains_edge_id,
    build_entity_node_id,
    build_manual_edge_id,
    build_mention_edge_id,
    build_paragraph_node_id,
    build_relation_edge_id,
    build_sheet_edge_id,
    build_source_node_id,
)
from src.kb.storage import GraphStore, SourceStore, VectorIndex
from src.kb.application.retrieval.types import KBScope

SPREADSHEET_FILE_TYPES: set[str] = {"xlsx", "xlsm", "xls"}
MULTIPLE_SOURCE_SCOPE = "__multiple__"


class GraphService:
    """Project graph nodes, edges, and details from repository data."""

    def __init__(self, *, graph_store: GraphStore, source_store: SourceStore, vector_index: VectorIndex) -> None:
        self.graph_store = graph_store
        self.source_store = source_store
        self.vector_index = vector_index

    def build_graph(
        self,
        *,
        scope: dict[str, Any],
        view: str = "semantic",
        density: int = 100,
        anchor_node_ids: list[str] | None = None,
        anchor_edge_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        normalized_scope = KBScope.from_payload(scope)
        source_version_pairs = self.source_store.resolve_scope_pairs(normalized_scope)
        if not source_version_pairs:
            raise ValueError("Graph scope did not resolve to any active source snapshots.")
        visible_source_ids = list({str(pair["source_id"]) for pair in source_version_pairs})
        source_rows = self.graph_store.list_graph_sources(visible_source_ids)
        visible_sources = [source for source in source_rows if self._is_graph_visible_source(source)]
        visible_source_ids = [str(source["id"]) for source in visible_sources]
        if not visible_source_ids:
            return {"view": str(view or "semantic").strip().lower() or "semantic", "nodes": [], "edges": []}
        source_version_pairs = [
            pair for pair in source_version_pairs if str(pair["source_id"]) in set(visible_source_ids)
        ]
        visible_source_version_keys = {
            self._source_version_scope_key(str(pair["source_id"]), str(pair["version_id"]))
            for pair in source_version_pairs
        }
        source_name_by_id = {str(source["id"]): str(source["name"]) for source in visible_sources}
        normalized_view = str(view or "semantic").strip().lower() or "semantic"
        if normalized_view == "semantic":
            graph = self._build_semantic_graph(
                source_version_pairs=source_version_pairs,
                visible_sources=visible_sources,
                source_name_by_id=source_name_by_id,
                visible_source_version_keys=visible_source_version_keys,
                density=density,
            )
        elif normalized_view == "structure":
            graph = self._build_structure_graph(
                source_version_pairs=source_version_pairs,
                visible_sources=visible_sources,
                source_name_by_id=source_name_by_id,
            )
        elif normalized_view == "evidence":
            graph = self._build_evidence_graph(
                source_version_pairs=source_version_pairs,
                source_name_by_id=source_name_by_id,
                visible_source_version_keys=visible_source_version_keys,
                anchor_node_ids=anchor_node_ids or [],
                anchor_edge_ids=anchor_edge_ids or [],
            )
        else:
            raise ValueError(f"Unsupported graph view: {view}")

        visible_node_ids = {str(node["id"]) for node in graph["nodes"]}
        return {
            "view": normalized_view,
            "nodes": graph["nodes"],
            "edges": self._prune_dangling_edges(graph["edges"], node_ids=visible_node_ids),
        }

    def _build_semantic_graph(
        self,
        *,
        source_version_pairs: list[dict[str, Any]],
        visible_sources: list[dict[str, Any]],
        source_name_by_id: dict[str, str],
        visible_source_version_keys: set[str],
        density: int,
    ) -> dict[str, list[dict[str, Any]]]:
        entity_rows = self.graph_store.list_graph_entities(source_version_pairs)
        manual_entity_rows = self._list_scoped_manual_entities(visible_source_version_keys)
        entity_rows = list(
            {
                str(entity["id"]): entity
                for entity in [*entity_rows, *manual_entity_rows]
            }.values()
        )
        entity_by_id = {str(entity["id"]): entity for entity in entity_rows}
        source_by_id = {
            str(source["id"]): source
            for source in visible_sources
        }
        semantic_edges: list[dict[str, Any]] = []

        for relation in self.graph_store.list_graph_relations(source_version_pairs):
            relation_edge_type = self._relation_edge_type(relation)
            if self._is_structural_edge_type(relation_edge_type):
                continue
            subject_entity_id = str(relation["subject_entity_id"])
            object_entity_id = str(relation["object_entity_id"])
            if subject_entity_id not in entity_by_id or object_entity_id not in entity_by_id:
                continue
            display_label = self._relation_display_label(relation, relation_edge_type)
            semantic_edges.append(
                {
                    "id": build_relation_edge_id(str(relation["id"])),
                    "source": build_entity_node_id(subject_entity_id),
                    "target": build_entity_node_id(object_entity_id),
                    "type": relation_edge_type,
                    "label": display_label,
                    "display_label": display_label,
                    "relation_kind_label": self._relation_kind_label(relation_edge_type),
                    "source_name": self._relation_source_name(relation, source_name_by_id),
                    "evidence_paragraph_id": str(relation.get("source_paragraph_id") or "") or None,
                    "is_structural": False,
                    "family": "semantic",
                    "weight": max(1.0, float(relation.get("confidence") or 1.0)),
                    "metadata": relation,
                }
            )

        visible_entity_node_ids = {
            build_entity_node_id(entity_id)
            for entity_id in entity_by_id
        }
        for relation in self.graph_store.list_manual_relations():
            subject_node_id = str(relation["subject_node_id"])
            object_node_id = str(relation["object_node_id"])
            if subject_node_id not in visible_entity_node_ids or object_node_id not in visible_entity_node_ids:
                continue
            semantic_edges.append(
                {
                    "id": build_manual_edge_id(str(relation["id"])),
                    "source": subject_node_id,
                    "target": object_node_id,
                    "type": "manual",
                    "label": str(relation["predicate"]),
                    "display_label": str(relation["predicate"]),
                    "relation_kind_label": "手工关系",
                    "source_name": None,
                    "evidence_paragraph_id": None,
                    "is_structural": False,
                    "family": "semantic",
                    "weight": float(relation["weight"]),
                    "metadata": relation,
                }
            )

        kept_edges = self._apply_semantic_density_filter(semantic_edges, density=density)
        kept_entity_node_ids = {
            node_id
            for edge in kept_edges
            for node_id in (str(edge["source"]), str(edge["target"]))
        }
        provenance_edges: list[dict[str, Any]] = []
        seen_provenance_edge_ids: set[str] = set()
        connected_source_node_ids: set[str] = set()

        for entity in entity_rows:
            entity_id = str(entity["id"])
            entity_node_id = build_entity_node_id(entity_id)
            if entity_node_id not in kept_entity_node_ids:
                continue
            source_id = self._metadata_value(entity, "source_id")
            if not source_id:
                continue
            source = source_by_id.get(source_id)
            if source is None:
                continue
            provenance_edge_id = f"provenance:{source_id}:{entity_id}"
            if provenance_edge_id in seen_provenance_edge_ids:
                continue
            seen_provenance_edge_ids.add(provenance_edge_id)
            source_node_id = build_source_node_id(source_id)
            connected_source_node_ids.add(source_node_id)
            provenance_edges.append(
                {
                    "id": provenance_edge_id,
                    "source": source_node_id,
                    "target": entity_node_id,
                    "type": "provenance",
                    "label": "来源",
                    "display_label": "来源",
                    "relation_kind_label": "来源归属",
                    "source_name": source_name_by_id.get(source_id),
                    "evidence_paragraph_id": None,
                    "is_structural": False,
                    "family": "semantic",
                    "weight": 0.75,
                    "metadata": {
                        "source_id": source_id,
                        "version_id": self._metadata_value(entity, "version_id"),
                        "entity_id": entity_id,
                    },
                }
            )

        nodes: list[dict[str, Any]] = []
        for entity in entity_rows:
            entity_id = str(entity["id"])
            node_id = build_entity_node_id(entity_id)
            if node_id not in kept_entity_node_ids:
                continue
            node_type = self._entity_node_type(entity)
            nodes.append(
                {
                    "id": node_id,
                    "type": node_type,
                    "label": self._entity_node_label(entity),
                    "display_label": self._entity_node_label(entity),
                    "kind_label": self._node_kind_label(node_type),
                    "source_name": self._resolve_entity_source_name(entity, source_name_by_id),
                    "evidence_count": self._entity_evidence_count(entity),
                    "size": self._entity_node_size(entity),
                    "score": None,
                    "family": "semantic",
                    "metadata": entity,
                }
            )

        for source in visible_sources:
            source_id = str(source["id"])
            source_node_id = build_source_node_id(source_id)
            if source_node_id not in connected_source_node_ids:
                continue
            source_node_type = self._source_node_type(source)
            nodes.append(
                {
                    "id": source_node_id,
                    "type": source_node_type,
                    "label": str(source["name"]),
                    "display_label": str(source["name"]),
                    "kind_label": self._node_kind_label(source_node_type),
                    "source_name": str(source["name"]),
                    "evidence_count": None,
                    "size": self._source_node_size(source),
                    "score": None,
                    "family": "semantic",
                    "metadata": source,
                }
            )

        return {"nodes": nodes, "edges": [*kept_edges, *provenance_edges]}

    def _build_structure_graph(
        self,
        *,
        source_version_pairs: list[dict[str, Any]],
        visible_sources: list[dict[str, Any]],
        source_name_by_id: dict[str, str],
    ) -> dict[str, list[dict[str, Any]]]:
        paragraph_rows = self.graph_store.list_graph_paragraphs(source_version_pairs)
        structure_entity_rows = [
            entity
            for entity in self.graph_store.list_graph_entities(source_version_pairs)
            if self._entity_node_type(entity) in {"worksheet", "record"}
        ]
        structure_entity_by_id = {
            str(entity["id"]): entity
            for entity in structure_entity_rows
        }
        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []

        for source in visible_sources:
            source_id = str(source["id"])
            source_node_type = self._source_node_type(source)
            nodes.append(
                {
                    "id": build_source_node_id(source_id),
                    "type": source_node_type,
                    "label": str(source["name"]),
                    "display_label": str(source["name"]),
                    "kind_label": self._node_kind_label(source_node_type),
                    "source_name": str(source["name"]),
                    "evidence_count": int(dict(source.get("metadata") or {}).get("paragraph_count") or 0) or None,
                    "size": self._source_node_size(source),
                    "score": None,
                    "family": "structure",
                    "metadata": source,
                }
            )

        for paragraph in paragraph_rows:
            paragraph_id = str(paragraph["id"])
            source_id = str(paragraph["source_id"])
            nodes.append(
                {
                    "id": build_paragraph_node_id(paragraph_id),
                    "type": "paragraph",
                    "label": self._paragraph_label(str(paragraph["content"])),
                    "display_label": self._paragraph_label(str(paragraph["content"])),
                    "kind_label": self._node_kind_label("paragraph"),
                    "source_name": source_name_by_id.get(source_id),
                    "evidence_count": 1,
                    "size": 3.0,
                    "score": None,
                    "family": "structure",
                    "metadata": paragraph,
                }
            )
            edges.append(
                {
                    "id": build_contains_edge_id(source_id, paragraph_id),
                    "source": build_source_node_id(source_id),
                    "target": build_paragraph_node_id(paragraph_id),
                    "type": "contains",
                    "label": "包含段落",
                    "display_label": "包含段落",
                    "relation_kind_label": "结构关系",
                    "source_name": source_name_by_id.get(source_id),
                    "evidence_paragraph_id": paragraph_id,
                    "is_structural": True,
                    "family": "structure",
                    "weight": 1.0,
                    "metadata": {"source_id": source_id, "paragraph_id": paragraph_id},
                }
            )

        for entity in structure_entity_rows:
            entity_id = str(entity["id"])
            node_type = self._entity_node_type(entity)
            nodes.append(
                {
                    "id": build_entity_node_id(entity_id),
                    "type": node_type,
                    "label": self._entity_node_label(entity),
                    "display_label": self._entity_node_label(entity),
                    "kind_label": self._node_kind_label(node_type),
                    "source_name": self._resolve_entity_source_name(entity, source_name_by_id),
                    "evidence_count": self._entity_evidence_count(entity),
                    "size": self._entity_node_size(entity),
                    "score": None,
                    "family": "structure",
                    "metadata": entity,
                }
            )
            if node_type == "worksheet":
                source_id = self._metadata_value(entity, "source_id")
                if not source_id:
                    continue
                edges.append(
                    {
                        "id": build_sheet_edge_id(source_id, entity_id),
                        "source": build_source_node_id(source_id),
                        "target": build_entity_node_id(entity_id),
                        "type": "contains_sheet",
                        "label": "包含工作表",
                        "display_label": "包含工作表",
                        "relation_kind_label": "结构关系",
                        "source_name": source_name_by_id.get(source_id),
                        "evidence_paragraph_id": None,
                        "is_structural": True,
                        "family": "structure",
                        "weight": 1.0,
                        "metadata": {
                            "source_id": source_id,
                            "entity_id": entity_id,
                            "worksheet_name": self._metadata_value(entity, "worksheet_name"),
                        },
                    }
                )

        for relation in self.graph_store.list_graph_relations(source_version_pairs):
            relation_edge_type = self._relation_edge_type(relation)
            if relation_edge_type != "contains_record":
                continue
            subject_entity_id = str(relation["subject_entity_id"])
            object_entity_id = str(relation["object_entity_id"])
            if subject_entity_id not in structure_entity_by_id or object_entity_id not in structure_entity_by_id:
                continue
            display_label = self._relation_display_label(relation, relation_edge_type)
            edges.append(
                {
                    "id": build_relation_edge_id(str(relation["id"])),
                    "source": build_entity_node_id(subject_entity_id),
                    "target": build_entity_node_id(object_entity_id),
                    "type": relation_edge_type,
                    "label": display_label,
                    "display_label": display_label,
                    "relation_kind_label": "结构关系",
                    "source_name": self._relation_source_name(relation, source_name_by_id),
                    "evidence_paragraph_id": str(relation.get("source_paragraph_id") or "") or None,
                    "is_structural": True,
                    "family": "structure",
                    "weight": max(1.0, float(relation.get("confidence") or 1.0)),
                    "metadata": relation,
                }
            )

        if not edges:
            return {
                "nodes": [
                    node
                    for node in nodes
                    if str(node.get("type") or "") in {"source", "workbook"}
                ],
                "edges": [],
            }

        connected_node_ids = {
            node_id
            for edge in edges
            for node_id in (str(edge["source"]), str(edge["target"]))
        }
        return {
            "nodes": [node for node in nodes if str(node["id"]) in connected_node_ids],
            "edges": edges,
        }

    def _build_evidence_graph(
        self,
        *,
        source_version_pairs: list[dict[str, Any]],
        source_name_by_id: dict[str, str],
        visible_source_version_keys: set[str],
        anchor_node_ids: list[str],
        anchor_edge_ids: list[str],
    ) -> dict[str, list[dict[str, Any]]]:
        if not anchor_node_ids and not anchor_edge_ids:
            raise ValueError("Evidence graph requires at least one anchor node or edge.")

        paragraph_rows = self.graph_store.list_graph_paragraphs(source_version_pairs)
        paragraph_by_id = {
            str(paragraph["id"]): paragraph
            for paragraph in paragraph_rows
        }
        paragraph_source_id_by_id = {
            str(paragraph["id"]): str(paragraph.get("source_id") or "")
            for paragraph in paragraph_rows
        }
        paragraph_entity_links = self.graph_store.list_paragraph_entity_links(source_version_pairs=source_version_pairs)
        links_by_entity_id: dict[str, list[dict[str, Any]]] = {}
        links_by_paragraph_id: dict[str, list[dict[str, Any]]] = {}
        for link in paragraph_entity_links:
            entity_id = str(link["entity_id"])
            paragraph_id = str(link["paragraph_id"])
            links_by_entity_id.setdefault(entity_id, []).append(link)
            links_by_paragraph_id.setdefault(paragraph_id, []).append(link)

        entity_rows = self.graph_store.list_graph_entities(source_version_pairs)
        manual_entity_rows = self._list_scoped_manual_entities(visible_source_version_keys)
        entity_rows = list(
            {
                str(entity["id"]): entity
                for entity in [*entity_rows, *manual_entity_rows]
            }.values()
        )
        entity_by_id = {str(entity["id"]): entity for entity in entity_rows}

        selected_entity_ids: set[str] = set()
        selected_paragraph_ids: set[str] = set()

        for node_id in anchor_node_ids:
            normalized_node_id = str(node_id or "").strip()
            entity_id = self._entity_id_from_node_id(normalized_node_id)
            if entity_id and entity_id in entity_by_id:
                selected_entity_ids.add(entity_id)
                continue
            if normalized_node_id.startswith("paragraph:"):
                paragraph_id = normalized_node_id.split(":", maxsplit=1)[1]
                if paragraph_id in paragraph_by_id:
                    selected_paragraph_ids.add(paragraph_id)
                    for link in links_by_paragraph_id.get(paragraph_id, []):
                        linked_entity_id = str(link["entity_id"])
                        if linked_entity_id in entity_by_id:
                            selected_entity_ids.add(linked_entity_id)
                continue
            if normalized_node_id.startswith("source:"):
                source_id = normalized_node_id.split(":", maxsplit=1)[1]
                source_paragraph_ids = [
                    str(paragraph["id"])
                    for paragraph in paragraph_rows
                    if str(paragraph.get("source_id") or "") == source_id
                ][:12]
                selected_paragraph_ids.update(source_paragraph_ids)
                for paragraph_id in source_paragraph_ids:
                    for link in links_by_paragraph_id.get(paragraph_id, []):
                        linked_entity_id = str(link["entity_id"])
                        if linked_entity_id in entity_by_id:
                            selected_entity_ids.add(linked_entity_id)

        for edge_id in anchor_edge_ids:
            normalized_edge_id = str(edge_id or "").strip()
            if normalized_edge_id.startswith("relation:"):
                relation = self.graph_store.get_relation(normalized_edge_id.split(":", maxsplit=1)[1])
                if relation is None:
                    continue
                subject_entity_id = str(relation["subject_entity_id"])
                object_entity_id = str(relation["object_entity_id"])
                if subject_entity_id in entity_by_id:
                    selected_entity_ids.add(subject_entity_id)
                if object_entity_id in entity_by_id:
                    selected_entity_ids.add(object_entity_id)
                paragraph_id = str(relation.get("source_paragraph_id") or "").strip()
                if paragraph_id and paragraph_id in paragraph_by_id:
                    selected_paragraph_ids.add(paragraph_id)
                continue
            if normalized_edge_id.startswith("manual:"):
                relation = self.graph_store.get_manual_relation(normalized_edge_id.split(":", maxsplit=1)[1])
                if relation is None:
                    continue
                subject_entity_id = self._entity_id_from_node_id(str(relation["subject_node_id"]))
                object_entity_id = self._entity_id_from_node_id(str(relation["object_node_id"]))
                if subject_entity_id and subject_entity_id in entity_by_id:
                    selected_entity_ids.add(subject_entity_id)
                if object_entity_id and object_entity_id in entity_by_id:
                    selected_entity_ids.add(object_entity_id)

        for entity_id in list(selected_entity_ids):
            ranked_links = sorted(
                links_by_entity_id.get(entity_id, []),
                key=lambda link: float(link.get("mention_count") or 1.0),
                reverse=True,
            )
            for link in ranked_links[:8]:
                paragraph_id = str(link["paragraph_id"])
                if paragraph_id in paragraph_by_id:
                    selected_paragraph_ids.add(paragraph_id)

        if not selected_entity_ids and not selected_paragraph_ids:
            return {"nodes": [], "edges": []}

        nodes: list[dict[str, Any]] = []
        for entity_id in selected_entity_ids:
            entity = entity_by_id.get(entity_id)
            if entity is None:
                continue
            node_type = self._entity_node_type(entity)
            nodes.append(
                {
                    "id": build_entity_node_id(entity_id),
                    "type": node_type,
                    "label": self._entity_node_label(entity),
                    "display_label": self._entity_node_label(entity),
                    "kind_label": self._node_kind_label(node_type),
                    "source_name": self._resolve_entity_source_name(entity, source_name_by_id),
                    "evidence_count": self._entity_evidence_count(entity),
                    "size": self._entity_node_size(entity),
                    "score": None,
                    "family": "evidence",
                    "metadata": entity,
                }
            )

        for paragraph_id in selected_paragraph_ids:
            paragraph = paragraph_by_id.get(paragraph_id)
            if paragraph is None:
                continue
            nodes.append(
                {
                    "id": build_paragraph_node_id(paragraph_id),
                    "type": "paragraph",
                    "label": self._paragraph_label(str(paragraph["content"])),
                    "display_label": self._paragraph_label(str(paragraph["content"])),
                    "kind_label": self._node_kind_label("paragraph"),
                    "source_name": source_name_by_id.get(paragraph_source_id_by_id.get(paragraph_id, "")),
                    "evidence_count": 1,
                    "size": 3.0,
                    "score": None,
                    "family": "evidence",
                    "metadata": paragraph,
                }
            )

        edges: list[dict[str, Any]] = []
        for paragraph_id in selected_paragraph_ids:
            for link in links_by_paragraph_id.get(paragraph_id, []):
                entity_id = str(link["entity_id"])
                if entity_id not in selected_entity_ids:
                    continue
                edges.append(
                    {
                        "id": build_mention_edge_id(paragraph_id, entity_id),
                        "source": build_paragraph_node_id(paragraph_id),
                        "target": build_entity_node_id(entity_id),
                        "type": "mentions",
                        "label": "提及",
                        "display_label": "提及",
                        "relation_kind_label": "证据关系",
                        "source_name": source_name_by_id.get(paragraph_source_id_by_id.get(paragraph_id, "")),
                        "evidence_paragraph_id": paragraph_id,
                        "is_structural": True,
                        "family": "evidence",
                        "weight": max(1.0, float(link.get("mention_count") or 1.0)),
                        "metadata": link,
                    }
                )

        return {"nodes": nodes, "edges": edges}

    def _list_scoped_manual_entities(
        self,
        visible_source_version_keys: set[str],
    ) -> list[dict[str, Any]]:
        manual_entity_rows: list[dict[str, Any]] = []
        for entity in self.graph_store.list_entities():
            metadata = dict(entity.get("metadata") or {})
            if not bool(metadata.get("manual_created")):
                continue
            entity_scope_key = self._node_source_scope(build_entity_node_id(str(entity["id"])))
            if entity_scope_key in {MULTIPLE_SOURCE_SCOPE, None}:
                continue
            if entity_scope_key not in visible_source_version_keys:
                continue
            manual_entity_rows.append(entity)
        return manual_entity_rows

    def _apply_semantic_density_filter(
        self,
        edges: list[dict[str, Any]],
        *,
        density: int,
    ) -> list[dict[str, Any]]:
        normalized_density = max(5, min(density, 100))
        if normalized_density >= 100 or len(edges) <= 1:
            return edges
        edge_limit = max(1, round(len(edges) * normalized_density / 100))
        components = self._build_semantic_components(edges)
        if not components:
            return edges[:edge_limit]

        kept_edges: list[dict[str, Any]] = []
        for component in sorted(components, key=lambda item: item["score"], reverse=True):
            component_edges = sorted(
                component["edges"],
                key=lambda edge: float(edge.get("weight") or 1.0),
                reverse=True,
            )
            remaining = edge_limit - len(kept_edges)
            if remaining <= 0:
                break
            if len(component_edges) <= remaining:
                kept_edges.extend(component_edges)
                continue
            if not kept_edges:
                kept_edges.extend(component_edges[:remaining])
            break
        return kept_edges or sorted(
            edges,
            key=lambda edge: float(edge.get("weight") or 1.0),
            reverse=True,
        )[:edge_limit]

    def _build_semantic_components(
        self,
        edges: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not edges:
            return []
        edge_by_id = {
            str(edge["id"]): edge
            for edge in edges
        }
        adjacency: dict[str, list[str]] = {}
        edge_ids_by_node: dict[str, list[str]] = {}
        for edge in edges:
            source_node_id = str(edge["source"])
            target_node_id = str(edge["target"])
            adjacency.setdefault(source_node_id, []).append(target_node_id)
            adjacency.setdefault(target_node_id, []).append(source_node_id)
            edge_ids_by_node.setdefault(source_node_id, []).append(str(edge["id"]))
            edge_ids_by_node.setdefault(target_node_id, []).append(str(edge["id"]))

        visited: set[str] = set()
        components: list[dict[str, Any]] = []
        for node_id in adjacency:
            if node_id in visited:
                continue
            queue = [node_id]
            visited.add(node_id)
            component_edge_ids: set[str] = set()
            component_node_ids: set[str] = set()
            while queue:
                current_node_id = queue.pop(0)
                component_node_ids.add(current_node_id)
                for edge_id in edge_ids_by_node.get(current_node_id, []):
                    component_edge_ids.add(edge_id)
                for next_node_id in adjacency.get(current_node_id, []):
                    if next_node_id in visited:
                        continue
                    visited.add(next_node_id)
                    queue.append(next_node_id)
            component_edges = [
                edge_by_id[edge_id]
                for edge_id in component_edge_ids
                if edge_id in edge_by_id
            ]
            components.append(
                {
                    "node_ids": list(component_node_ids),
                    "edges": component_edges,
                    "score": sum(float(edge.get("weight") or 1.0) for edge in component_edges)
                    + len(component_edges) * 2.0,
                }
            )
        return components

    def _is_graph_visible_source(self, source: dict[str, Any]) -> bool:
        return str(source.get("status") or "").strip().lower() in {"ready", "partial"}

    def get_node_detail(self, node_id: str, version_id: str | None = None) -> dict[str, Any]:
        if node_id.startswith("source:"):
            source_id = node_id.split(":", maxsplit=1)[1]
            source = self.source_store.get_source(source_id)
            if source is None:
                raise KeyError(node_id)
            detail = self.source_store.get_source_detail(source_id, version_id=version_id)
            if detail is None:
                raise KeyError(node_id)
            selected_version = detail.get("selected_version")
            resolved_version_id = str(selected_version["id"]) if selected_version is not None else None
            paragraphs = (
                self.source_store.list_source_paragraphs(source_id, version_id=resolved_version_id)[:12]
                if resolved_version_id
                else []
            )
            relations = (
                self.graph_store.list_relations_for_source(
                    source_id,
                    version_id=resolved_version_id,
                    limit=20,
                )
                if resolved_version_id
                else []
            )
            return {
                "node": {
                    "id": node_id,
                    "type": self._source_node_type(source),
                    "label": str(source["name"]),
                    "display_label": str(source["name"]),
                    "kind_label": self._node_kind_label(self._source_node_type(source)),
                    "source_name": str(source["name"]),
                    "evidence_count": int(dict(source.get("metadata") or {}).get("paragraph_count") or 0) or None,
                    "size": self._source_node_size(source),
                    "score": None,
                    "metadata": {**source, "selected_version": selected_version},
                },
                "source": source,
                "paragraphs": paragraphs,
                "relations": relations,
            }
        if node_id.startswith("paragraph:"):
            paragraph_id = node_id.split(":", maxsplit=1)[1]
            paragraph = self.source_store.get_paragraph(paragraph_id)
            if paragraph is None:
                raise KeyError(node_id)
            source = self.source_store.get_source(str(paragraph["source_id"]))
            relations = self.graph_store.list_relations_for_paragraph(paragraph_id)
            return {
                "node": {
                    "id": node_id,
                    "type": "paragraph",
                    "label": self._paragraph_label(str(paragraph["content"])),
                    "display_label": self._paragraph_label(str(paragraph["content"])),
                    "kind_label": self._node_kind_label("paragraph"),
                    "source_name": str(source["name"]) if source else None,
                    "evidence_count": 1,
                    "size": 3.0,
                    "score": None,
                    "metadata": paragraph,
                },
                "source": source,
                "paragraphs": [paragraph],
                "relations": relations,
            }
        if node_id.startswith("entity:"):
            entity_id = node_id.split(":", maxsplit=1)[1]
            entity = self.graph_store.get_entity(entity_id)
            if entity is None:
                raise KeyError(node_id)
            paragraphs = self.graph_store.list_paragraphs_for_entity(entity_id, limit=12)
            relations = self.graph_store.list_relations_for_entity(entity_id, limit=24)
            return {
                "node": {
                    "id": node_id,
                    "type": self._entity_node_type(entity),
                    "label": self._entity_node_label(entity),
                    "display_label": self._entity_node_label(entity),
                    "kind_label": self._node_kind_label(self._entity_node_type(entity)),
                    "source_name": self._resolve_entity_source_name(entity),
                    "evidence_count": self._entity_evidence_count(entity),
                    "size": self._entity_node_size(entity),
                    "score": None,
                    "metadata": entity,
                },
                "source": None,
                "paragraphs": paragraphs,
                "relations": relations,
            }
        raise KeyError(node_id)

    def get_edge_detail(self, edge_id: str) -> dict[str, Any]:
        if edge_id.startswith("relation:"):
            relation_id = edge_id.split(":", maxsplit=1)[1]
            relation = self.graph_store.get_relation(relation_id)
            if relation is None:
                raise KeyError(edge_id)
            paragraph = None
            source = None
            if relation.get("source_paragraph_id"):
                paragraph = self.source_store.get_paragraph(str(relation["source_paragraph_id"]))
                if paragraph is not None:
                    source = self.source_store.get_source(str(paragraph["source_id"]))
            return {
                "edge": {
                    "id": edge_id,
                    "source": build_entity_node_id(str(relation["subject_entity_id"])),
                    "target": build_entity_node_id(str(relation["object_entity_id"])),
                    "type": self._relation_edge_type(relation),
                    "label": self._relation_display_label(relation, self._relation_edge_type(relation)),
                    "display_label": self._relation_display_label(relation, self._relation_edge_type(relation)),
                    "relation_kind_label": self._relation_kind_label(self._relation_edge_type(relation)),
                    "source_name": str(source["name"]) if source else None,
                    "evidence_paragraph_id": str(relation.get("source_paragraph_id") or "") or None,
                    "is_structural": self._is_structural_edge_type(self._relation_edge_type(relation)),
                    "weight": float(relation["confidence"]),
                    "metadata": relation,
                },
                "source": source,
                "paragraph": paragraph,
            }
        if edge_id.startswith("manual:"):
            relation_id = edge_id.split(":", maxsplit=1)[1]
            relation = self.graph_store.get_manual_relation(relation_id)
            if relation is None:
                raise KeyError(edge_id)
            return {
                "edge": {
                    "id": edge_id,
                    "source": str(relation["subject_node_id"]),
                    "target": str(relation["object_node_id"]),
                    "type": "manual",
                    "label": str(relation["predicate"]),
                    "display_label": str(relation["predicate"]),
                    "relation_kind_label": "手工关系",
                    "source_name": None,
                    "evidence_paragraph_id": None,
                    "is_structural": False,
                    "weight": float(relation["weight"]),
                    "metadata": relation,
                },
                "source": None,
                "paragraph": None,
            }
        if edge_id.startswith("contains:"):
            source_id, paragraph_id = self._parse_binary_edge_id(edge_id, prefix="contains")
            source = self.source_store.get_source(source_id)
            paragraph = self.source_store.get_paragraph(paragraph_id)
            if source is None or paragraph is None or str(paragraph.get("source_id") or "") != source_id:
                raise KeyError(edge_id)
            return {
                "edge": {
                    "id": edge_id,
                    "source": build_source_node_id(source_id),
                    "target": build_paragraph_node_id(paragraph_id),
                    "type": "contains",
                    "label": "包含段落",
                    "display_label": "包含段落",
                    "relation_kind_label": "结构关系",
                    "source_name": str(source["name"]),
                    "evidence_paragraph_id": paragraph_id,
                    "is_structural": True,
                    "weight": 1.0,
                    "metadata": {"source_id": source_id, "paragraph_id": paragraph_id},
                },
                "source": source,
                "paragraph": paragraph,
            }
        if edge_id.startswith("sheet:"):
            source_id, entity_id = self._parse_binary_edge_id(edge_id, prefix="sheet")
            source = self.source_store.get_source(source_id)
            entity = self.graph_store.get_entity(entity_id)
            if source is None or entity is None:
                raise KeyError(edge_id)
            if self._entity_node_type(entity) != "worksheet":
                raise KeyError(edge_id)
            if self._metadata_value(entity, "source_id") != source_id:
                raise KeyError(edge_id)
            return {
                "edge": {
                    "id": edge_id,
                    "source": build_source_node_id(source_id),
                    "target": build_entity_node_id(entity_id),
                    "type": "contains_sheet",
                    "label": "包含工作表",
                    "display_label": "包含工作表",
                    "relation_kind_label": "结构关系",
                    "source_name": str(source["name"]),
                    "evidence_paragraph_id": None,
                    "is_structural": True,
                    "weight": 1.0,
                    "metadata": {
                        "source_id": source_id,
                        "entity_id": entity_id,
                        "worksheet_name": self._metadata_value(entity, "worksheet_name"),
                    },
                },
                "source": source,
                "paragraph": None,
            }
        if edge_id.startswith("mention:"):
            paragraph_id, entity_id = self._parse_binary_edge_id(edge_id, prefix="mention")
            paragraph = self.source_store.get_paragraph(paragraph_id)
            entity = self.graph_store.get_entity(entity_id)
            if paragraph is None or entity is None:
                raise KeyError(edge_id)
            links = self.graph_store.list_paragraph_entity_links(paragraph_ids=[paragraph_id], entity_id=entity_id)
            if not links:
                raise KeyError(edge_id)
            source = self.source_store.get_source(str(paragraph["source_id"]))
            return {
                "edge": {
                    "id": edge_id,
                    "source": build_paragraph_node_id(paragraph_id),
                    "target": build_entity_node_id(entity_id),
                    "type": "mentions",
                    "label": "提及",
                    "display_label": "提及",
                    "relation_kind_label": "结构关系",
                    "source_name": str(source["name"]) if source else None,
                    "evidence_paragraph_id": paragraph_id,
                    "is_structural": True,
                    "weight": 1.0,
                    "metadata": {"paragraph_id": paragraph_id, "entity_id": entity_id},
                },
                "source": source,
                "paragraph": paragraph,
            }
        raise KeyError(edge_id)

    def list_manual_relations(self) -> list[dict[str, Any]]:
        return self.graph_store.list_manual_relations()

    def create_manual_entity(
        self,
        *,
        label: str,
        description: str = "",
        source_id: str | None = None,
        version_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized_label = " ".join(str(label or "").split()).strip()
        if not normalized_label:
            raise ValueError("实体名称不能为空。")
        normalized_source_id = str(source_id or "").strip() or None
        normalized_version_id = str(version_id or "").strip() or None
        if normalized_version_id and not normalized_source_id:
            raise ValueError("指定快照前必须先选择来源。")
        if normalized_source_id is None:
            raise ValueError("请先选择单一来源快照，再创建手工实体。")
        if self.source_store.get_source(normalized_source_id) is None:
            raise ValueError("手工实体关联的来源不存在。")
        if normalized_version_id is None:
            normalized_version_id = self.source_store.resolve_latest_active_version_id(normalized_source_id)
        if normalized_version_id is None:
            raise ValueError("当前来源还没有可用快照，无法创建手工实体。")
        if self.source_store.get_source_version(normalized_source_id, normalized_version_id) is None:
            raise ValueError("手工实体关联的快照不存在。")

        entity = self.graph_store.create_entity(
            display_name=normalized_label,
            description=description,
            metadata={
                **dict(metadata or {}),
                "entity_kind": "manual_entity",
                "manual_created": True,
                "source_id": normalized_source_id,
                "version_id": normalized_version_id,
            },
            appearance_count=0,
        )
        return {
            "id": build_entity_node_id(str(entity["id"])),
            "type": "entity",
            "label": self._entity_node_label(entity),
            "display_label": self._entity_node_label(entity),
            "kind_label": self._node_kind_label("entity"),
            "source_name": self._resolve_entity_source_name(entity),
            "evidence_count": self._entity_evidence_count(entity),
            "size": self._entity_node_size(entity),
            "score": None,
            "metadata": entity,
        }

    def create_manual_relation(
        self,
        *,
        subject_node_id: str,
        predicate: str,
        object_node_id: str,
        weight: float,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        normalized_subject_node_id = str(subject_node_id or "").strip()
        normalized_object_node_id = str(object_node_id or "").strip()
        normalized_predicate = str(predicate or "").strip()
        if not normalized_subject_node_id or not normalized_object_node_id:
            raise ValueError("手工关系必须选择起点和终点节点。")
        if not normalized_predicate:
            raise ValueError("手工关系谓词不能为空。")
        if weight <= 0:
            raise ValueError("手工关系权重必须大于 0。")
        if not normalized_subject_node_id.startswith("entity:") or not normalized_object_node_id.startswith("entity:"):
            raise ValueError("手工关系只能连接实体节点。")
        self._assert_node_exists(normalized_subject_node_id)
        self._assert_node_exists(normalized_object_node_id)
        subject_source_scope = self._node_source_scope(normalized_subject_node_id)
        object_source_scope = self._node_source_scope(normalized_object_node_id)
        if MULTIPLE_SOURCE_SCOPE in {subject_source_scope, object_source_scope}:
            raise ValueError("无法为跨来源或跨快照实体创建手工关系，请先收窄到单一来源快照。")
        if subject_source_scope != object_source_scope:
            raise ValueError("手工关系的起点和终点必须位于同一来源快照内。")
        relation_metadata = dict(metadata)
        if isinstance(subject_source_scope, str) and subject_source_scope:
            source_id, version_id = subject_source_scope.split("::", maxsplit=1)
            relation_metadata["source_id"] = source_id
            relation_metadata["version_id"] = version_id
        return self.graph_store.create_manual_relation(
            subject_node_id=normalized_subject_node_id,
            predicate=normalized_predicate,
            object_node_id=normalized_object_node_id,
            weight=weight,
            metadata=relation_metadata,
        )

    def delete_manual_relation(self, relation_id: str) -> bool:
        return self.graph_store.delete_manual_relation(relation_id)

    def update_node_label(self, node_id: str, label: str) -> None:
        normalized_label = " ".join(str(label or "").split()).strip()
        if not normalized_label:
            raise ValueError("节点名称不能为空。")

        if node_id.startswith("source:"):
            source_id = node_id.split(":", maxsplit=1)[1]
            updated_source = self.source_store.update_source(source_id, name=normalized_label)
            if updated_source is None:
                raise KeyError(node_id)
            return

        if node_id.startswith("entity:"):
            entity_id = node_id.split(":", maxsplit=1)[1]
            updated_entity = self.graph_store.update_entity(entity_id, display_name=normalized_label)
            if updated_entity is None:
                raise KeyError(node_id)
            return

        raise ValueError("当前节点类型不支持重命名。")

    def delete_node(self, node_id: str) -> None:
        if node_id.startswith("source:"):
            self.delete_source(node_id.split(":", maxsplit=1)[1])
            return

        if node_id.startswith("paragraph:"):
            self._delete_paragraph(node_id.split(":", maxsplit=1)[1])
            return

        if node_id.startswith("entity:"):
            self._delete_entity(node_id.split(":", maxsplit=1)[1])
            return

        raise KeyError(node_id)

    def delete_edge(self, edge_id: str) -> None:
        if edge_id.startswith("manual:"):
            relation_id = edge_id.split(":", maxsplit=1)[1]
            if not self.graph_store.delete_manual_relation(relation_id):
                raise KeyError(edge_id)
            return

        if edge_id.startswith("relation:"):
            relation_id = edge_id.split(":", maxsplit=1)[1]
            relation = self.graph_store.get_relation(relation_id)
            if relation is None:
                raise KeyError(edge_id)
            if not self.graph_store.delete_relation(relation_id):
                raise KeyError(edge_id)
            self._cleanup_entities(
                [
                    str(relation["subject_entity_id"]),
                    str(relation["object_entity_id"]),
                ]
            )
            return

        raise ValueError("当前边类型不支持删除。")

    def delete_source(self, source_id: str) -> None:
        source = self.source_store.get_source(source_id)
        if source is None:
            raise KeyError(source_id)

        paragraphs = self.source_store.list_paragraphs_for_source(source_id)
        paragraph_ids = [str(paragraph["id"]) for paragraph in paragraphs]
        scoped_manual_entities = [
            entity
            for entity in self.graph_store.list_entities()
            if bool(dict(entity.get("metadata") or {}).get("manual_created"))
            and str(dict(entity.get("metadata") or {}).get("source_id") or "").strip() == source_id
        ]
        scoped_manual_entity_ids = [str(entity["id"]) for entity in scoped_manual_entities]
        scoped_manual_node_ids = [build_entity_node_id(entity_id) for entity_id in scoped_manual_entity_ids]
        source_relations = self.graph_store.list_relations_referencing_source(source_id)
        related_manual_relations = [
            relation
            for relation in self.graph_store.list_manual_relations()
            if relation["subject_node_id"] in scoped_manual_node_ids
            or relation["object_node_id"] in scoped_manual_node_ids
        ]
        affected_entity_ids = [
            str(link["entity_id"])
            for link in self.graph_store.list_paragraph_entity_links(paragraph_ids=paragraph_ids)
        ]
        affected_entity_ids.extend(str(relation["subject_entity_id"]) for relation in source_relations)
        affected_entity_ids.extend(str(relation["object_entity_id"]) for relation in source_relations)
        affected_entity_ids.extend(scoped_manual_entity_ids)
        affected_entity_ids.extend(
            entity_id
            for relation in related_manual_relations
            for entity_id in (
                self._entity_id_from_node_id(str(relation["subject_node_id"])),
                self._entity_id_from_node_id(str(relation["object_node_id"])),
            )
            if entity_id is not None
        )

        self.graph_store.delete_relations_for_paragraphs(paragraph_ids)
        self.graph_store.delete_relations([str(relation["id"]) for relation in source_relations])
        self.graph_store.delete_manual_relations_for_nodes(
            [build_source_node_id(source_id)]
            + [build_paragraph_node_id(paragraph_id) for paragraph_id in paragraph_ids]
            + scoped_manual_node_ids
        )

        if not self.source_store.delete_source(source_id):
            raise KeyError(source_id)

        self.vector_index.remove_source(source_id)
        self._cleanup_entities(affected_entity_ids)

    def _delete_paragraph(self, paragraph_id: str) -> None:
        paragraph = self.source_store.get_paragraph(paragraph_id)
        if paragraph is None:
            raise KeyError(paragraph_id)

        affected_entity_ids = [
            str(link["entity_id"])
            for link in self.graph_store.list_paragraph_entity_links(paragraph_ids=[paragraph_id])
        ]
        paragraph_relations = self.graph_store.list_relations_for_paragraph(paragraph_id)
        affected_entity_ids.extend(str(relation["subject_entity_id"]) for relation in paragraph_relations)
        affected_entity_ids.extend(str(relation["object_entity_id"]) for relation in paragraph_relations)

        self.graph_store.delete_relations_for_paragraphs([paragraph_id])
        self.graph_store.delete_manual_relations_for_node(build_paragraph_node_id(paragraph_id))

        if not self.source_store.delete_paragraph(paragraph_id):
            raise KeyError(paragraph_id)

        self.vector_index.remove_paragraphs([paragraph_id])
        self._cleanup_entities(affected_entity_ids)

    def _delete_entity(self, entity_id: str) -> None:
        entity = self.graph_store.get_entity(entity_id)
        if entity is None:
            raise KeyError(entity_id)

        self.graph_store.delete_manual_relations_for_node(build_entity_node_id(entity_id))
        if not self.graph_store.delete_entity(entity_id):
            raise KeyError(entity_id)

    def _cleanup_entities(self, entity_ids: list[str]) -> None:
        for entity_id in {str(item).strip() for item in entity_ids if str(item).strip()}:
            entity = self.graph_store.get_entity(entity_id)
            if entity is None:
                continue

            paragraph_link_count = self.graph_store.count_paragraph_links_for_entity(entity_id)
            relation_count = self.graph_store.count_relations_for_entity(entity_id)
            metadata = dict(entity.get("metadata") or {})
            is_manual_entity = bool(metadata.get("manual_created"))
            source_id = str(metadata.get("source_id") or "").strip()
            if paragraph_link_count <= 0 and relation_count <= 0:
                if is_manual_entity and not source_id:
                    self.graph_store.set_entity_appearance_count(entity_id, paragraph_link_count)
                    continue
                self.graph_store.delete_manual_relations_for_node(build_entity_node_id(entity_id))
                self.graph_store.delete_entity(entity_id)
                continue

            self.graph_store.set_entity_appearance_count(entity_id, paragraph_link_count)

    def _source_node_type(self, source: dict[str, Any]) -> str:
        metadata = dict(source.get("metadata") or {})
        file_type = str(source.get("file_type") or "").strip().lower()
        if int(metadata.get("spreadsheet_sheet_count") or 0) > 0 or file_type in SPREADSHEET_FILE_TYPES:
            return "workbook"
        return "source"

    def _source_node_size(self, source: dict[str, Any]) -> float:
        return 10.0 if self._source_node_type(source) == "workbook" else 8.0

    def _entity_node_type(self, entity: dict[str, Any]) -> str:
        entity_kind = self._metadata_value(entity, "entity_kind")
        if entity_kind == "worksheet":
            return "worksheet"
        if entity_kind == "row_record":
            return "record"
        return "entity"

    def _entity_node_label(self, entity: dict[str, Any]) -> str:
        entity_kind = self._metadata_value(entity, "entity_kind")
        if entity_kind == "worksheet":
            return self._metadata_value(entity, "display_label") or self._metadata_value(entity, "worksheet_name") or str(
                entity["display_name"]
            )
        if entity_kind == "row_record":
            return self._metadata_value(entity, "display_label") or str(entity["display_name"])
        return str(entity["display_name"])

    def _entity_node_size(self, entity: dict[str, Any]) -> float:
        entity_kind = self._metadata_value(entity, "entity_kind")
        if entity_kind == "worksheet":
            return 13.0
        if entity_kind == "row_record":
            return 8.0
        return max(2.0, min(float(entity.get("appearance_count") or 1) / 2.0 + 2.0, 10.0))

    def _relation_edge_type(self, relation: dict[str, Any]) -> str:
        metadata = dict(relation.get("metadata") or {})
        relation_source = str(metadata.get("relation_source") or "")
        if relation_source == "spreadsheet_structure" or str(relation.get("predicate") or "") == "has_record":
            return "contains_record"
        return "relation"

    def _relation_display_label(self, relation: dict[str, Any], edge_type: str) -> str:
        if edge_type == "contains_record":
            return "包含记录"
        return str(relation.get("predicate") or "").strip() or edge_type

    def _relation_kind_label(self, edge_type: str) -> str:
        if edge_type == "manual":
            return "手工关系"
        if self._is_structural_edge_type(edge_type):
            return "结构关系"
        return "抽取关系"

    def _is_structural_edge_type(self, edge_type: str) -> bool:
        return edge_type in {"contains", "contains_sheet", "contains_record", "mentions"}

    def _node_kind_label(self, node_type: str) -> str:
        return {
            "source": "来源",
            "workbook": "工作簿",
            "paragraph": "段落",
            "worksheet": "工作表",
            "record": "记录",
            "entity": "实体",
        }.get(node_type, node_type)

    def _entity_evidence_count(self, entity: dict[str, Any]) -> int | None:
        count = int(entity.get("appearance_count") or 0)
        return count or None

    def _resolve_entity_source_name(
        self,
        entity: dict[str, Any],
        source_name_by_id: dict[str, str] | None = None,
    ) -> str | None:
        metadata = dict(entity.get("metadata") or {})
        source_name = str(metadata.get("source_name") or "").strip()
        if source_name:
            return source_name
        source_id = str(metadata.get("source_id") or "").strip()
        if source_id and source_name_by_id and source_id in source_name_by_id:
            return source_name_by_id[source_id]
        if source_id:
            source = self.source_store.get_source(source_id)
            if source is not None:
                return str(source["name"])
        return None

    def _relation_source_name(self, relation: dict[str, Any], source_name_by_id: dict[str, str]) -> str | None:
        paragraph_id = str(relation.get("source_paragraph_id") or "").strip()
        if not paragraph_id:
            return None
        paragraph = self.source_store.get_paragraph(paragraph_id)
        if paragraph is None:
            return None
        source_id = str(paragraph.get("source_id") or "").strip()
        return source_name_by_id.get(source_id) or self._source_name_from_store(source_id)

    def _source_name_from_store(self, source_id: str) -> str | None:
        if not source_id:
            return None
        source = self.source_store.get_source(source_id)
        return str(source["name"]) if source is not None else None

    def _node_source_scope(self, node_id: str) -> str | None:
        if node_id.startswith("source:"):
            source_id = node_id.split(":", maxsplit=1)[1]
            if self.source_store.get_source(source_id) is None:
                raise KeyError(node_id)
            version_id = self.source_store.resolve_latest_active_version_id(source_id)
            if version_id is None:
                return None
            return self._source_version_scope_key(source_id, version_id)
        if node_id.startswith("paragraph:"):
            paragraph_id = node_id.split(":", maxsplit=1)[1]
            paragraph = self.source_store.get_paragraph(paragraph_id)
            if paragraph is None:
                raise KeyError(node_id)
            source_id = str(paragraph.get("source_id") or "").strip()
            version_id = str(paragraph.get("version_id") or "").strip()
            if not source_id or not version_id:
                return None
            return self._source_version_scope_key(source_id, version_id)
        if node_id.startswith("entity:"):
            entity_id = node_id.split(":", maxsplit=1)[1]
            entity = self.graph_store.get_entity(entity_id)
            if entity is None:
                raise KeyError(node_id)
            metadata = dict(entity.get("metadata") or {})
            source_id = str(metadata.get("source_id") or "").strip()
            version_id = str(metadata.get("version_id") or "").strip()
            if source_id:
                resolved_version_id = version_id or self.source_store.resolve_latest_active_version_id(source_id)
                if resolved_version_id:
                    return self._source_version_scope_key(source_id, resolved_version_id)
            paragraph_links = self.graph_store.list_paragraph_entity_links(entity_id=entity_id)
            if not paragraph_links:
                return None
            source_version_keys = {
                self._source_version_scope_key(
                    str(paragraph.get("source_id") or "").strip(),
                    str(paragraph.get("version_id") or "").strip(),
                )
                for paragraph in (
                    self.source_store.get_paragraph(str(link["paragraph_id"]))
                    for link in paragraph_links
                )
                if paragraph is not None
                and str(paragraph.get("source_id") or "").strip()
                and str(paragraph.get("version_id") or "").strip()
            }
            if len(source_version_keys) == 1:
                return next(iter(source_version_keys))
            if len(source_version_keys) > 1:
                return MULTIPLE_SOURCE_SCOPE
            return None
        return None

    def _source_version_scope_key(self, source_id: str, version_id: str) -> str:
        return f"{source_id}::{version_id}"

    def _entity_id_from_node_id(self, node_id: str) -> str | None:
        if node_id.startswith("entity:"):
            return node_id.split(":", maxsplit=1)[1]
        return None

    def _metadata_value(self, row: dict[str, Any], key: str) -> str:
        metadata = row.get("metadata")
        if not isinstance(metadata, dict):
            return ""
        value = metadata.get(key)
        return str(value).strip() if value is not None else ""

    def _assert_node_exists(self, node_id: str) -> None:
        if node_id.startswith("source:"):
            source_id = node_id.split(":", maxsplit=1)[1]
            if self.source_store.get_source(source_id) is not None:
                return
        elif node_id.startswith("paragraph:"):
            paragraph_id = node_id.split(":", maxsplit=1)[1]
            if self.source_store.get_paragraph(paragraph_id) is not None:
                return
        elif node_id.startswith("entity:"):
            entity_id = node_id.split(":", maxsplit=1)[1]
            if self.graph_store.get_entity(entity_id) is not None:
                return
        raise ValueError("手工关系引用了不存在的图谱节点。")

    def _parse_binary_edge_id(self, edge_id: str, *, prefix: str) -> tuple[str, str]:
        parts = edge_id.split(":", maxsplit=2)
        if len(parts) != 3 or parts[0] != prefix:
            raise KeyError(edge_id)
        return parts[1], parts[2]

    def _apply_density_filter(self, edges: list[dict[str, Any]], *, density: int) -> list[dict[str, Any]]:
        normalized_density = max(5, min(density, 100))
        if normalized_density >= 100 or len(edges) <= 1:
            return edges
        edge_limit = max(1, round(len(edges) * normalized_density / 100))
        return sorted(edges, key=lambda edge: edge["weight"], reverse=True)[:edge_limit]

    def _prune_dangling_edges(self, edges: list[dict[str, Any]], *, node_ids: set[str]) -> list[dict[str, Any]]:
        return [
            edge
            for edge in edges
            if str(edge.get("source") or "") in node_ids and str(edge.get("target") or "") in node_ids
        ]

    def _paragraph_label(self, content: str) -> str:
        compact = " ".join(content.split())
        return compact if len(compact) <= 28 else f"{compact[:28]}..."













