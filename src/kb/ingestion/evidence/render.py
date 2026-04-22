"""Excel evidence rendering helpers."""

from html import escape
from typing import Any

from src.kb.ingestion.excel import normalize_column_name, normalize_sheet_name

ROW_CONTEXT_RADIUS = 1
RENDER_KIND_TEXT = "text"
RENDER_KIND_ROW_RECORD = "row_record"
RENDER_KIND_SHEET_SUMMARY = "sheet_summary"
RENDER_KIND_WORKSHEET_PREVIEW = "worksheet_preview"


def build_paragraph_render_payload(
    *,
    paragraph: dict[str, Any],
    worksheet_rows: list[dict[str, Any]] | None = None,
    highlighted_columns: list[str] | None = None,
    fallback_reason: str | None = None,
) -> dict[str, Any]:
    """Build compact evidence payloads for paragraph-like previews."""

    metadata = dict(paragraph.get("metadata") or {})
    paragraph_kind = str(metadata.get("paragraph_kind") or "")
    highlighted_column_keys = _normalize_column_keys(highlighted_columns or [])

    if paragraph_kind == "row_record":
        return _build_row_record_payload(
            paragraph=paragraph,
            metadata=metadata,
            worksheet_rows=worksheet_rows or [],
            highlighted_columns=highlighted_column_keys,
            fallback_reason=fallback_reason,
        )
    if paragraph_kind == "sheet_summary":
        return _build_sheet_summary_payload(metadata=metadata)
    return _build_text_payload(fallback_reason=fallback_reason)


def build_worksheet_preview_payload(
    *,
    worksheet_name: str,
    worksheet_key: str,
    headers: list[str],
    column_keys: list[str],
    preview_rows: list[dict[str, Any]],
    page: int,
    page_size: int,
    total_rows: int,
    anchor_row_index: int | None = None,
    highlighted_row_indexes: list[int] | None = None,
    highlighted_columns: list[str] | None = None,
    fallback_reason: str | None = None,
) -> dict[str, Any]:
    """Build paginated worksheet preview payloads for source browsing."""

    header_pairs = _resolve_header_pairs(
        headers=[str(value) for value in headers if str(value).strip()],
        header_keys=[str(value) for value in column_keys if str(value).strip()],
        fallback_cells={},
    )
    normalized_highlighted_columns = _normalize_column_keys(highlighted_columns or [])
    normalized_highlighted_row_indexes = _normalize_row_indexes(highlighted_row_indexes or [])
    if anchor_row_index and anchor_row_index > 0 and anchor_row_index not in normalized_highlighted_row_indexes:
        normalized_highlighted_row_indexes.append(anchor_row_index)

    if not header_pairs:
        return {
            "render_kind": RENDER_KIND_WORKSHEET_PREVIEW,
            "rendered_html": _render_empty_state_card(
                render_kind=RENDER_KIND_WORKSHEET_PREVIEW,
                worksheet_name=worksheet_name,
                message="当前工作表缺少列定义，暂时无法渲染预览。",
            ),
            "render_metadata": _worksheet_preview_render_metadata(
                worksheet_name=worksheet_name,
                worksheet_key=worksheet_key,
                headers=[],
                column_keys=[],
                page=page,
                page_size=page_size,
                total_rows=total_rows,
                row_range_start=0,
                row_range_end=0,
                anchor_row_index=anchor_row_index,
                highlighted_row_indexes=normalized_highlighted_row_indexes,
                highlighted_columns=normalized_highlighted_columns,
                fallback_reason=fallback_reason or "missing_headers",
            ),
        }

    normalized_rows = _normalize_preview_rows(preview_rows=preview_rows, header_pairs=header_pairs)
    row_range_start = int(normalized_rows[0].get("row_index") or 0) if normalized_rows else 0
    row_range_end = int(normalized_rows[-1].get("row_index") or 0) if normalized_rows else 0
    effective_fallback_reason = fallback_reason
    if total_rows <= 0:
        effective_fallback_reason = effective_fallback_reason or "empty_worksheet"
    elif not normalized_rows:
        effective_fallback_reason = effective_fallback_reason or "page_out_of_range"

    rendered_html = (
        _render_empty_state_card(
            render_kind=RENDER_KIND_WORKSHEET_PREVIEW,
            worksheet_name=worksheet_name,
            message="当前页没有可展示的行。",
        )
        if not normalized_rows
        else _render_table_card_html(
            render_kind=RENDER_KIND_WORKSHEET_PREVIEW,
            worksheet_name=worksheet_name,
            header_pairs=header_pairs,
            rows=normalized_rows,
            highlighted_row_indexes=normalized_highlighted_row_indexes,
            highlighted_columns=normalized_highlighted_columns,
            meta_fragments=[
                f"第 {page} 页",
                f"每页 {page_size} 行",
                f"总计 {total_rows} 行",
                (
                    f"当前窗口 {row_range_start}-{row_range_end}"
                    if row_range_start and row_range_end
                    else "当前窗口无数据"
                ),
            ],
        )
    )
    return {
        "render_kind": RENDER_KIND_WORKSHEET_PREVIEW,
        "rendered_html": rendered_html,
        "render_metadata": _worksheet_preview_render_metadata(
            worksheet_name=worksheet_name,
            worksheet_key=worksheet_key,
            headers=[display_name for display_name, _ in header_pairs],
            column_keys=[column_key for _, column_key in header_pairs],
            page=page,
            page_size=page_size,
            total_rows=total_rows,
            row_range_start=row_range_start,
            row_range_end=row_range_end,
            anchor_row_index=anchor_row_index,
            highlighted_row_indexes=normalized_highlighted_row_indexes,
            highlighted_columns=normalized_highlighted_columns,
            fallback_reason=effective_fallback_reason,
        ),
    }


def _build_text_payload(*, fallback_reason: str | None = None) -> dict[str, Any]:
    return {
        "render_kind": RENDER_KIND_TEXT,
        "rendered_html": None,
        "render_metadata": {"fallback_reason": fallback_reason} if fallback_reason else {},
    }


def _build_row_record_payload(
    *,
    paragraph: dict[str, Any],
    metadata: dict[str, Any],
    worksheet_rows: list[dict[str, Any]],
    highlighted_columns: list[str],
    fallback_reason: str | None,
) -> dict[str, Any]:
    worksheet_name = str(metadata.get("worksheet_name") or "")
    worksheet_key = normalize_sheet_name(str(metadata.get("worksheet_key") or worksheet_name))
    row_index = int(metadata.get("row_index") or 0)
    record_key = str(metadata.get("record_key") or "")
    header_pairs = _resolve_header_pairs(
        headers=[str(value) for value in list(metadata.get("headers") or []) if str(value).strip()],
        header_keys=[
            normalize_column_name(str(value))
            for value in list(metadata.get("header_keys") or [])
            if normalize_column_name(str(value))
        ],
        fallback_cells=_display_cells_from_metadata(metadata),
    )
    if not header_pairs:
        return _build_text_payload(fallback_reason=fallback_reason or "missing_headers")

    render_rows = _normalize_record_rows(
        worksheet_rows=worksheet_rows,
        metadata=metadata,
        header_pairs=header_pairs,
        paragraph=paragraph,
        row_index=row_index,
    )
    if not render_rows:
        return _build_text_payload(fallback_reason=fallback_reason or "missing_rows")

    render_rows.sort(key=lambda item: (int(item.get("row_index") or 0), str(item.get("paragraph_id") or "")))
    selected_rows = [
        row
        for row in render_rows
        if abs(int(row.get("row_index") or 0) - row_index) <= ROW_CONTEXT_RADIUS
    ]
    if not selected_rows:
        selected_rows = [row for row in render_rows if int(row.get("row_index") or 0) == row_index] or render_rows[:1]

    window_start = min(int(row.get("row_index") or 0) for row in selected_rows)
    window_end = max(int(row.get("row_index") or 0) for row in selected_rows)
    rendered_html = _render_table_card_html(
        render_kind=RENDER_KIND_ROW_RECORD,
        worksheet_name=worksheet_name or "工作表",
        header_pairs=header_pairs,
        rows=selected_rows,
        highlighted_row_indexes=[row_index] if row_index > 0 else [],
        highlighted_columns=highlighted_columns,
        meta_fragments=[
            f"命中行 {row_index or '-'}",
            f"记录键 {record_key}" if record_key else "",
            "局部上下文前后各 1 行",
        ],
    )
    return {
        "render_kind": RENDER_KIND_ROW_RECORD,
        "rendered_html": rendered_html,
        "render_metadata": {
            "worksheet_name": worksheet_name or None,
            "worksheet_key": worksheet_key or None,
            "row_index": row_index,
            "anchor_row_index": row_index or None,
            "record_key": record_key or None,
            "highlighted_row_indexes": [row_index] if row_index > 0 else [],
            "highlighted_columns": highlighted_columns,
            "headers": [display_name for display_name, _ in header_pairs],
            "column_keys": [column_key for _, column_key in header_pairs],
            "column_order": [display_name for display_name, _ in header_pairs],
            "window_start_row": window_start,
            "window_end_row": window_end,
            "fallback_reason": fallback_reason,
        },
    }


def _build_sheet_summary_payload(*, metadata: dict[str, Any]) -> dict[str, Any]:
    worksheet_name = str(metadata.get("worksheet_name") or "")
    worksheet_key = normalize_sheet_name(str(metadata.get("worksheet_key") or worksheet_name))
    row_count = int(metadata.get("row_count") or 0)
    primary_key = str(metadata.get("primary_key") or "")
    indexed_columns = [str(value) for value in list(metadata.get("indexed_columns") or []) if str(value).strip()]
    headers = [str(value) for value in list(metadata.get("headers") or []) if str(value).strip()]
    column_keys = [
        normalize_column_name(str(value))
        for value in list(metadata.get("header_keys") or [])
        if normalize_column_name(str(value))
    ]

    indexed_columns_html = "".join(f"<li>{escape(value)}</li>" for value in indexed_columns) or "<li>未配置</li>"
    headers_html = "".join(f"<li>{escape(value)}</li>" for value in headers) or "<li>未识别</li>"
    rendered_html = (
        "<div class=\"kb-evidence-html kb-evidence-summary-card\">"
        f"<strong>{escape(worksheet_name or '工作表摘要')}</strong>"
        "<dl class=\"kb-evidence-summary-grid\">"
        f"<div><dt>总行数</dt><dd>{escape(str(row_count))}</dd></div>"
        f"<div><dt>主键</dt><dd>{escape(primary_key or '未识别')}</dd></div>"
        "</dl>"
        "<div class=\"kb-evidence-summary-lists\">"
        "<div><span>索引列</span><ul>"
        f"{indexed_columns_html}"
        "</ul></div>"
        "<div><span>表头</span><ul>"
        f"{headers_html}"
        "</ul></div>"
        "</div>"
        "</div>"
    )
    return {
        "render_kind": RENDER_KIND_SHEET_SUMMARY,
        "rendered_html": rendered_html,
        "render_metadata": {
            "worksheet_name": worksheet_name or None,
            "worksheet_key": worksheet_key or None,
            "row_count": row_count,
            "primary_key": primary_key or None,
            "indexed_columns": indexed_columns,
            "headers": headers,
            "column_keys": column_keys,
        },
    }


def _worksheet_preview_render_metadata(
    *,
    worksheet_name: str,
    worksheet_key: str,
    headers: list[str],
    column_keys: list[str],
    page: int,
    page_size: int,
    total_rows: int,
    row_range_start: int,
    row_range_end: int,
    anchor_row_index: int | None,
    highlighted_row_indexes: list[int],
    highlighted_columns: list[str],
    fallback_reason: str | None,
) -> dict[str, Any]:
    return {
        "worksheet_name": worksheet_name or None,
        "worksheet_key": worksheet_key or None,
        "headers": headers,
        "column_keys": column_keys,
        "page": page,
        "page_size": page_size,
        "total_rows": total_rows,
        "has_prev": page > 1,
        "has_next": page * page_size < total_rows,
        "row_range_start": row_range_start,
        "row_range_end": row_range_end,
        "anchor_row_index": anchor_row_index,
        "highlighted_row_indexes": highlighted_row_indexes,
        "highlighted_columns": highlighted_columns,
        "fallback_reason": fallback_reason,
    }


def _resolve_header_pairs(
    *,
    headers: list[str],
    header_keys: list[str],
    fallback_cells: dict[str, str],
) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    seen_keys: set[str] = set()
    for index, display_name in enumerate(headers):
        header_key = header_keys[index] if index < len(header_keys) else normalize_column_name(display_name)
        if not display_name.strip() or not header_key or header_key in seen_keys:
            continue
        seen_keys.add(header_key)
        pairs.append((display_name, header_key))

    if pairs:
        return pairs

    for display_name in [str(key) for key in fallback_cells.keys() if str(key).strip()]:
        header_key = normalize_column_name(display_name)
        if not header_key or header_key in seen_keys:
            continue
        seen_keys.add(header_key)
        pairs.append((display_name, header_key))
    return pairs


def _normalize_record_rows(
    *,
    worksheet_rows: list[dict[str, Any]],
    metadata: dict[str, Any],
    header_pairs: list[tuple[str, str]],
    paragraph: dict[str, Any],
    row_index: int,
) -> list[dict[str, Any]]:
    if worksheet_rows:
        result: list[dict[str, Any]] = []
        for row in worksheet_rows:
            result.append(
                {
                    "paragraph_id": str(row.get("paragraph_id") or ""),
                    "row_index": int(row.get("row_index") or 0),
                    "record_key": str(row.get("record_key") or ""),
                    "cells": _build_cells_for_header_pairs(
                        display_cells=_display_cells_from_row(row),
                        normalized_cells=_normalized_cells_from_row(row),
                        header_pairs=header_pairs,
                    ),
                }
            )
        return result

    display_cells = _display_cells_from_metadata(metadata)
    normalized_cells = _normalized_cells_from_metadata(metadata)
    if not display_cells and not normalized_cells:
        return []
    return [
        {
            "paragraph_id": str(paragraph.get("id") or ""),
            "row_index": row_index,
            "record_key": str(metadata.get("record_key") or ""),
            "cells": _build_cells_for_header_pairs(
                display_cells=display_cells,
                normalized_cells=normalized_cells,
                header_pairs=header_pairs,
            ),
        }
    ]


def _normalize_preview_rows(
    *,
    preview_rows: list[dict[str, Any]],
    header_pairs: list[tuple[str, str]],
) -> list[dict[str, Any]]:
    normalized_rows: list[dict[str, Any]] = []
    for row in preview_rows:
        normalized_rows.append(
            {
                "paragraph_id": str(row.get("paragraph_id") or ""),
                "row_index": int(row.get("row_index") or 0),
                "record_key": str(row.get("record_key") or ""),
                "cells": _build_cells_for_header_pairs(
                    display_cells={
                        display_name: str(value)
                        for display_name, value in dict(row.get("display_cells") or {}).items()
                        if str(display_name).strip()
                    },
                    normalized_cells={
                        normalize_column_name(str(column_key)): str(value)
                        for column_key, value in dict(row.get("cells") or {}).items()
                        if normalize_column_name(str(column_key))
                    },
                    header_pairs=header_pairs,
                ),
            }
        )
    return normalized_rows


def _build_cells_for_header_pairs(
    *,
    display_cells: dict[str, str],
    normalized_cells: dict[str, str],
    header_pairs: list[tuple[str, str]],
) -> dict[str, str]:
    return {
        header_key: str(normalized_cells.get(header_key) or display_cells.get(display_name) or "")
        for display_name, header_key in header_pairs
    }


def _render_table_card_html(
    *,
    render_kind: str,
    worksheet_name: str,
    header_pairs: list[tuple[str, str]],
    rows: list[dict[str, Any]],
    highlighted_row_indexes: list[int],
    highlighted_columns: list[str],
    meta_fragments: list[str],
) -> str:
    highlighted_row_index_set = {row_index for row_index in highlighted_row_indexes if row_index > 0}
    highlighted_column_set = set(highlighted_columns)
    header_cells_html = "".join(
        f"<th scope=\"col\">{escape(display_name)}</th>"
        for display_name, _ in header_pairs
    )
    html_rows: list[str] = []
    for row in rows:
        current_row_index = int(row.get("row_index") or 0)
        row_cells = dict(row.get("cells") or {})
        row_classes = ["kb-evidence-row"]
        if current_row_index in highlighted_row_index_set:
            row_classes.append("is-highlighted-row")
        rendered_cells: list[str] = []
        for _display_name, header_key in header_pairs:
            cell_classes = ["kb-evidence-cell"]
            if current_row_index in highlighted_row_index_set and header_key in highlighted_column_set:
                cell_classes.append("is-highlighted-cell")
            rendered_cells.append(
                f"<td class=\"{' '.join(cell_classes)}\">{escape(str(row_cells.get(header_key) or ''))}</td>"
            )
        html_rows.append(
            (
                f"<tr class=\"{' '.join(row_classes)}\">"
                f"<th scope=\"row\" class=\"kb-evidence-row-index\">{escape(str(current_row_index or '-'))}</th>"
                f"{''.join(rendered_cells)}"
                "</tr>"
            )
        )

    meta_html = "".join(
        f"<span class=\"kb-evidence-meta\">{escape(fragment)}</span>"
        for fragment in meta_fragments
        if fragment
    )
    return (
        f"<div class=\"kb-evidence-html kb-evidence-table-card kb-evidence-{escape(render_kind)}\">"
        "<div class=\"kb-evidence-meta-row\">"
        f"<strong>{escape(worksheet_name or '工作表')}</strong>"
        f"{meta_html}"
        "</div>"
        "<div class=\"kb-evidence-scroll\">"
        "<table class=\"kb-evidence-table\">"
        "<thead>"
        f"<tr><th scope=\"col\" class=\"kb-evidence-row-index\">行号</th>{header_cells_html}</tr>"
        "</thead>"
        f"<tbody>{''.join(html_rows)}</tbody>"
        "</table>"
        "</div>"
        "</div>"
    )


def _render_empty_state_card(*, render_kind: str, worksheet_name: str, message: str) -> str:
    return (
        f"<div class=\"kb-evidence-html kb-evidence-empty kb-evidence-{escape(render_kind)}\">"
        f"<strong>{escape(worksheet_name or '工作表')}</strong>"
        f"<p class=\"kb-evidence-empty-message\">{escape(message)}</p>"
        "</div>"
    )


def _normalize_column_keys(values: list[str]) -> list[str]:
    return [
        normalized_key
        for normalized_key in (
            normalize_column_name(str(value))
            for value in values
        )
        if normalized_key
    ]


def _normalize_row_indexes(values: list[int]) -> list[int]:
    normalized_rows: list[int] = []
    seen: set[int] = set()
    for value in values:
        row_index = int(value or 0)
        if row_index <= 0 or row_index in seen:
            continue
        seen.add(row_index)
        normalized_rows.append(row_index)
    return normalized_rows


def _display_cells_from_row(row: dict[str, Any]) -> dict[str, str]:
    return {
        str(key): str(value)
        for key, value in dict(row.get("cells") or {}).items()
        if str(key).strip()
    }


def _normalized_cells_from_row(row: dict[str, Any]) -> dict[str, str]:
    metadata = dict(row.get("metadata") or {})
    raw_value = metadata.get("normalized_cells")
    if isinstance(raw_value, dict):
        return {
            normalize_column_name(str(key)): str(value)
            for key, value in raw_value.items()
            if normalize_column_name(str(key))
        }
    return {}


def _display_cells_from_metadata(metadata: dict[str, Any]) -> dict[str, str]:
    raw_value = metadata.get("cells")
    if not isinstance(raw_value, dict):
        return {}
    return {
        str(key): str(value)
        for key, value in raw_value.items()
        if str(key).strip()
    }


def _normalized_cells_from_metadata(metadata: dict[str, Any]) -> dict[str, str]:
    raw_value = metadata.get("normalized_cells")
    if not isinstance(raw_value, dict):
        return {}
    return {
        normalize_column_name(str(key)): str(value)
        for key, value in raw_value.items()
        if normalize_column_name(str(key))
    }

