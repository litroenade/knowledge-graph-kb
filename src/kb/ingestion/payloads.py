"""知识库导入载荷归一化模块。

将上传文件、粘贴文本、目录扫描和结构化 JSON 输入统一整理成内部导入项。
"""

from typing import Any


def build_text_import_item(
    *,
    name: str,
    text: str,
    source_kind: str,
    input_mode: str,
    strategy: str,
    file_type: str | None = None,
    storage_path: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """构建文本导入项。"""

    return {
        "name": name,
        "text": text,
        "source_kind": source_kind,
        "input_mode": input_mode,
        "strategy": strategy,
        "file_type": file_type,
        "storage_path": storage_path,
        "metadata": metadata or {},
        "structured_entities": [],
        "structured_relations": [],
        "structured_paragraphs": [],
    }


def build_structured_import_item(
    *,
    name: str,
    payload: dict[str, Any],
    source_kind: str,
    input_mode: str,
    strategy: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """构建结构化导入项。"""

    relations = normalize_structured_relations(payload.get("relations"))
    entities = infer_relation_endpoint_entities(
        entities=normalize_structured_entities(payload.get("entities")),
        relations=relations,
    )
    paragraphs: list[dict[str, Any]] = normalize_structured_paragraphs(payload.get("paragraphs"))
    if not paragraphs and (entities or relations):
        paragraphs = build_structured_graph_paragraphs(entities=entities, relations=relations)
    text: str = "\n\n".join(paragraph["content"] for paragraph in paragraphs)
    return {
        "name": name,
        "text": text,
        "source_kind": source_kind,
        "input_mode": input_mode,
        "strategy": strategy,
        "file_type": str(payload.get("file_type") or "json"),
        "storage_path": None,
        "metadata": {**(metadata or {}), "schema": str(payload.get("schema") or "structured")},
        "structured_entities": entities,
        "structured_relations": relations,
        "structured_paragraphs": paragraphs,
    }


def build_structured_graph_paragraphs(
    *,
    entities: list[dict[str, Any]],
    relations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    lines: list[str] = []
    if entities:
        lines.append("Entities:")
        for entity in entities:
            name = str(entity["name"])
            description = str(entity.get("description") or "").strip()
            lines.append(f"- {name}: {description}" if description else f"- {name}")
    if relations:
        if lines:
            lines.append("")
        lines.append("Relations:")
        for relation in relations:
            confidence = float(relation.get("confidence") or 1.0)
            lines.append(
                f"- {relation['subject']} --{relation['predicate']}--> {relation['object']} "
                f"(confidence={confidence:g})"
            )
    content = "\n".join(lines).strip()
    if not content:
        return []
    return [
        {
            "position": 0,
            "content": content,
            "knowledge_type": "factual",
            "metadata": {"synthetic": True, "source": "structured_graph"},
        }
    ]


def normalize_structured_paragraphs(raw_value: Any) -> list[dict[str, Any]]:
    """归一化结构化段落列表。"""

    if not isinstance(raw_value, list):
        return []
    normalized_rows: list[dict[str, Any]] = []
    for index, item in enumerate(raw_value):
        if isinstance(item, dict):
            content: str = str(item.get("content") or "").strip()
            if not content:
                continue
            normalized_rows.append(
                {
                    "position": int(item.get("position", index)),
                    "content": content,
                    "knowledge_type": str(item.get("knowledge_type") or "").strip(),
                    "metadata": dict(item.get("metadata", {})),
                }
            )
            continue
        content = str(item).strip()
        if content:
            normalized_rows.append(
                {
                    "position": index,
                    "content": content,
                    "knowledge_type": "",
                    "metadata": {},
                }
            )
    return normalized_rows


def normalize_structured_entities(raw_value: Any) -> list[dict[str, Any]]:
    """归一化结构化实体列表。"""

    if not isinstance(raw_value, list):
        return []
    normalized_rows: list[dict[str, Any]] = []
    for item in raw_value:
        if not isinstance(item, dict):
            continue
        name: str = str(item.get("name") or item.get("display_name") or "").strip()
        if not name:
            continue
        normalized_rows.append(
            {
                "name": name,
                "description": str(item.get("description") or "").strip(),
                "metadata": dict(item.get("metadata", {})),
            }
        )
    return normalized_rows


def infer_relation_endpoint_entities(
    *,
    entities: list[dict[str, Any]],
    relations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """从关系端点补齐缺失实体，避免结构化关系在写图阶段被跳过。"""

    inferred_entities = list(entities)
    known_names = {str(entity["name"]).strip().casefold() for entity in inferred_entities}
    for relation in relations:
        for endpoint_key in ("subject", "object"):
            endpoint_name = str(relation.get(endpoint_key) or "").strip()
            normalized_name = endpoint_name.casefold()
            if not endpoint_name or normalized_name in known_names:
                continue
            inferred_entities.append(
                {
                    "name": endpoint_name,
                    "description": "",
                    "metadata": {"inferred_from_relation": True},
                }
            )
            known_names.add(normalized_name)
    return inferred_entities


def normalize_structured_relations(raw_value: Any) -> list[dict[str, Any]]:
    """归一化结构化关系列表。"""

    if not isinstance(raw_value, list):
        return []
    normalized_rows: list[dict[str, Any]] = []
    for item in raw_value:
        if not isinstance(item, dict):
            continue
        subject: str = str(item.get("subject") or item.get("source") or "").strip()
        object_name: str = str(item.get("object") or item.get("target") or "").strip()
        predicate: str = str(item.get("predicate") or item.get("relation") or "").strip()
        if not subject or not object_name or not predicate:
            continue
        normalized_rows.append(
            {
                "subject": subject,
                "predicate": predicate,
                "object": object_name,
                "confidence": float(item.get("confidence") or item.get("weight") or 1.0),
                "metadata": dict(item.get("metadata", {})),
            }
        )
    return normalized_rows
