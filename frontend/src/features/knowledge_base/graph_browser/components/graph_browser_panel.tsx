import {
  useEffect,
  useMemo,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import type { ResolvedTheme } from '../../../../theme';
import { GRAPH_VIEW_MODE_LABELS, NODE_TYPE_LABELS } from '../../shared/config/ui_constants';
import type {
  GraphDataView,
  KnowledgeGraphEdgeRecord,
  KnowledgeGraphNodeRecord,
} from '../../shared/types/knowledge_base_types';
import { GraphBrowserEntityDrawer } from './graph_browser_entity_drawer';
import { GraphBrowserFiltersDrawer } from './graph_browser_filters_drawer';
import { GraphBrowserInspector } from './graph_browser_inspector';
import { GraphBrowserRelationDrawer } from './graph_browser_relation_drawer';
import { GraphBrowserStageChrome } from './graph_browser_stage_chrome';
import { GraphBrowserToolbar } from './graph_browser_toolbar';
import type { PreviewCardRecord } from './graph_browser_view_types';
import { use_graph_browser } from '../hooks/use_graph_browser';
import { use_graph_browser_view_state } from '../hooks/use_graph_browser_view_state';
import {
  collect_edge_import_rows,
  collect_node_import_rows,
  create_search_candidate,
  DEFAULT_PREDICATE,
  edge_action_copy,
  node_action_copy,
  selected_source_summary,
  type GraphSearchCandidateRecord,
} from './graph_browser_utils';
import { PixiKnowledgeGraphCanvas } from './pixi_knowledge_graph_canvas';
import { project_graph } from './graph_projection';
import '../styles/graph_browser_panel.css';

interface GraphBrowserPanelProps {
  resolved_theme: ResolvedTheme;
}

function normalize_keyword(value: string): string {
  return value.trim().toLowerCase();
}

function is_entity_node(
  node: KnowledgeGraphNodeRecord | null | undefined,
): node is KnowledgeGraphNodeRecord {
  return Boolean(node && node.type === 'entity');
}

function node_kind_label(node: KnowledgeGraphNodeRecord): string {
  return node.kind_label ?? NODE_TYPE_LABELS[node.type] ?? node.type;
}

function node_search_text(node: KnowledgeGraphNodeRecord): string {
  return [
    node.display_label ?? node.label,
    node_kind_label(node),
    node.source_name ?? '',
    node.id,
  ]
    .join(' ')
    .toLowerCase();
}

function edge_node_label(
  node_id: string,
  node_map: Map<string, KnowledgeGraphNodeRecord>,
): string {
  const node = node_map.get(node_id);
  return node?.display_label ?? node?.label ?? node_id;
}

function preview_text(value: Record<string, unknown>, fallback = '暂无更多信息'): string {
  const candidates = [
    value.content,
    value.excerpt,
    value.summary,
    value.display_label,
    value.label,
    value.name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return fallback;
}

function to_record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function relation_summary_text(
  edge: KnowledgeGraphEdgeRecord,
  node_map: Map<string, KnowledgeGraphNodeRecord>,
): string {
  const source_label = edge_node_label(edge.source, node_map);
  const target_label = edge_node_label(edge.target, node_map);
  return `${source_label} -> ${edge.display_label ?? edge.label} -> ${target_label}`;
}

function summary_value(
  value: string | number | null | undefined,
  fallback = '—',
): string {
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function relation_preview_copy(relation: unknown, index: number) {
  const relation_record = to_record(relation);
  return {
    key: String(relation_record.id ?? `relation-${index}`),
    title: preview_text(relation_record, `关系 ${index + 1}`),
    description: preview_text(to_record(relation_record.metadata), '当前节点的一条关联关系。'),
  };
}

function read_text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function read_number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function paragraph_preview_copy(paragraph: unknown, index: number): PreviewCardRecord {
  const record = to_record(paragraph);
  const paragraph_id = read_text(record.id) ?? read_text(record.paragraph_id);
  const source_name =
    read_text(record.source_name) ??
    read_text(to_record(record.source).name) ??
    read_text(record.source_label);
  const position = read_number(record.position) ?? read_number(record.paragraph_position);
  const description_parts = [
    source_name ? `来源：${source_name}` : null,
    position !== null ? `段落 ${position + 1}` : null,
  ].filter(Boolean);

  return {
    key: paragraph_id ?? `paragraph-${index}`,
    title: preview_text(record, `段落 ${index + 1}`),
    description: description_parts.join(' · ') || '关联证据段落',
    paragraph_id,
    source_id: read_text(record.source_id),
  };
}

function source_preview_copy(source: unknown, index: number): PreviewCardRecord {
  const record = to_record(source);
  return {
    key: read_text(record.id) ?? `source-${index}`,
    title: preview_text(record, `来源 ${index + 1}`),
    description:
      read_text(record.summary) ??
      read_text(record.source_kind) ??
      read_text(record.file_type) ??
      '当前证据关联的来源',
    source_id: read_text(record.id) ?? read_text(record.source_id),
    paragraph_id:
      read_text(record.paragraph_id) ??
      (read_text(record.source_id) ? read_text(record.id) : null),
  };
}

function paragraph_focus_label(
  paragraph_id: string | null,
  node_detail: { paragraphs: Record<string, unknown>[] } | null,
  edge_detail: { paragraph: Record<string, unknown> | null } | null,
): string | null {
  if (!paragraph_id) {
    return null;
  }

  const candidates = [
    ...(node_detail?.paragraphs ?? []),
    ...(edge_detail?.paragraph ? [edge_detail.paragraph] : []),
  ];
  const matched = candidates.find((paragraph) => {
    const record = to_record(paragraph);
    return read_text(record.id) === paragraph_id || read_text(record.paragraph_id) === paragraph_id;
  });
  const record = matched ? to_record(matched) : {};
  const position = read_number(record.position) ?? read_number(record.paragraph_position);
  const source_name =
    read_text(record.source_name) ?? read_text(to_record(record.source).name) ?? null;

  if (position !== null && source_name) {
    return `定位段落：${source_name} · 第 ${position + 1} 段`;
  }
  if (position !== null) {
    return `定位段落：第 ${position + 1} 段`;
  }
  return `定位段落：${paragraph_id}`;
}

const GRAPH_DATA_VIEW_LABELS: Record<GraphDataView, string> = {
  semantic: '语义图谱',
  structure: '结构图谱',
  evidence: '证据子图',
};

export function GraphBrowserPanel(props: GraphBrowserPanelProps) {
  const { resolved_theme } = props;
  const {
    graph,
    sources,
    manual_relations,
    selected_source_ids,
    graph_data_view,
    density,
    selected_node_id,
    selected_edge_id,
    node_detail,
    edge_detail,
    graph_error_message,
    highlighted_node_ids,
    highlighted_edge_ids,
    graph_focus_command,
    is_graph_loading,
    is_creating_node,
    is_creating_manual_relation,
    is_renaming_node,
    is_deleting_node,
    is_deleting_edge,
    set_selected_source_ids,
    set_graph_data_view,
    set_density,
    select_node,
    select_edge,
    clear_graph_selection,
    request_node_detail,
    request_edge_detail,
    clear_graph_details,
    create_entity,
    create_relation,
    rename_node,
    delete_node,
    delete_edge,
    clear_highlights,
    refresh_graph,
    reset_graph_filters,
    clear_source_filters,
    focus_source,
    focus_paragraph,
    focus_citation,
    open_evidence_graph,
  } = use_graph_browser();

  const node_map = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );
  const selected_node = selected_node_id ? node_map.get(selected_node_id) ?? null : null;
  const selected_edge =
    selected_edge_id ? graph.edges.find((edge) => edge.id === selected_edge_id) ?? null : null;
  const has_focus_target = Boolean(
    selected_node_id || selected_edge_id || highlighted_node_ids.length || highlighted_edge_ids.length,
  );

  const view = use_graph_browser_view_state({
    selected_node_id,
    selected_edge_id,
    highlighted_node_ids,
    highlighted_edge_ids,
    selected_node,
    node_detail,
    graph_focus_command,
  });

  const {
    state,
    search_shell_ref,
    left_drawer_mode,
    inspector_open,
    compact_inspector_open,
    set_source_keyword,
    set_node_keyword,
    set_is_search_open,
    set_active_search_index,
    set_rename_value,
    set_create_label,
    set_create_description,
    set_relation_draft,
    open_inspector_panel,
    request_viewport,
    fit_all,
    focus_selection,
    relayout_graph,
    enter_global_graph,
    enter_local_graph,
    open_left_drawer,
    close_left_drawer,
    close_inspector,
    reset_view_state,
  } = view;

  const {
    layout_revision,
    graph_view_mode,
    reading_mode,
    local_graph_state,
    viewport_mode,
    viewport_request,
    source_keyword,
    node_keyword,
    is_search_open,
    active_search_index,
    rename_value,
    create_label,
    create_description,
    relation_draft,
  } = state;

  const source_scope_label = useMemo(
    () => selected_source_summary(selected_source_ids, sources),
    [selected_source_ids, sources],
  );
  const layer_summary_label = GRAPH_DATA_VIEW_LABELS[graph_data_view];

  const projected_graph = useMemo(
    () =>
      project_graph(graph, {
        active_layer_modes: [graph_data_view],
        reading_mode,
        selected_node_id,
        selected_edge_id,
        highlighted_node_ids,
        highlighted_edge_ids,
        graph_view_mode,
        local_graph_state,
      }),
    [
      graph,
      graph_data_view,
      graph_view_mode,
      highlighted_edge_ids,
      highlighted_node_ids,
      reading_mode,
      local_graph_state,
      selected_edge_id,
      selected_node_id,
    ],
  );

  const relation_node_options = useMemo(
    () =>
      graph.nodes
        .filter((node) => node.type === 'entity')
        .sort((left, right) =>
          (left.display_label ?? left.label).localeCompare(
            right.display_label ?? right.label,
            'zh-CN',
          ),
        ),
    [graph.nodes],
  );

  const searchable_nodes = useMemo(
    () =>
      projected_graph.nodes
        .filter((node) => node.type === 'entity')
        .sort((left, right) =>
          (left.display_label ?? left.label).localeCompare(
            right.display_label ?? right.label,
            'zh-CN',
          ),
        ),
    [projected_graph.nodes],
  );

  const node_matches = useMemo<GraphSearchCandidateRecord[]>(() => {
    const keyword = normalize_keyword(node_keyword);
    const matches = !keyword
      ? searchable_nodes.slice(0, 8)
      : searchable_nodes.filter((node) => node_search_text(node).includes(keyword)).slice(0, 8);
    return matches.map(create_search_candidate);
  }, [node_keyword, searchable_nodes]);

  const filtered_sources = useMemo(() => {
    const keyword = normalize_keyword(source_keyword);
    return !keyword
      ? sources
      : sources.filter((source) =>
          `${source.name} ${source.summary ?? ''} ${source.source_kind}`
            .toLowerCase()
            .includes(keyword),
        );
  }, [source_keyword, sources]);

  const selected_node_copy = useMemo(
    () => (node_detail ? node_action_copy(node_detail) : null),
    [node_detail],
  );
  const selected_edge_copy = useMemo(
    () => (edge_detail ? edge_action_copy(edge_detail) : null),
    [edge_detail],
  );
  const selected_node_rows = useMemo(
    () => (node_detail ? collect_node_import_rows(node_detail.node.type, node_detail.node.metadata) : []),
    [node_detail],
  );
  const selected_edge_rows = useMemo(
    () => (edge_detail ? collect_edge_import_rows(edge_detail.edge.metadata) : []),
    [edge_detail],
  );
  const node_relation_previews = useMemo(
    () => (node_detail ? node_detail.relations.slice(0, 3).map(relation_preview_copy) : []),
    [node_detail],
  );
  const node_paragraph_previews = useMemo(
    () => (node_detail ? node_detail.paragraphs.slice(0, 3).map(paragraph_preview_copy) : []),
    [node_detail],
  );
  const node_source_previews = useMemo(() => {
    if (!node_detail) {
      return [];
    }
    const previews = new Map<string, PreviewCardRecord>();
    if (node_detail.source) {
      const source_preview = source_preview_copy(node_detail.source, 0);
      previews.set(source_preview.key, source_preview);
    }
    node_detail.paragraphs.forEach((paragraph, index) => {
      const record = to_record(paragraph);
      const source_id = read_text(record.source_id);
      const source_name =
        read_text(record.source_name) ??
        read_text(to_record(record.source).name) ??
        read_text(record.source_label);
      if (!source_id && !source_name) {
        return;
      }
      const preview = source_preview_copy(
        {
          id: source_id ?? `source-${index}`,
          name: source_name ?? `来源 ${index + 1}`,
          summary: typeof record.content === 'string' ? record.content : undefined,
          paragraph_id: read_text(record.id) ?? read_text(record.paragraph_id),
          source_id,
        },
        index + 1,
      );
      const current = previews.get(preview.key);
      if (!current || (!current.paragraph_id && preview.paragraph_id)) {
        previews.set(preview.key, preview);
      }
    });
    return Array.from(previews.values()).slice(0, 3);
  }, [node_detail]);
  const edge_paragraph_preview = useMemo(
    () => (edge_detail?.paragraph ? paragraph_preview_copy(edge_detail.paragraph, 0) : null),
    [edge_detail],
  );
  const edge_source_preview = useMemo(() => {
    if (edge_detail?.source) {
      return source_preview_copy(
        {
          ...to_record(edge_detail.source),
          paragraph_id:
            read_text(to_record(edge_detail.paragraph).id) ??
            read_text(to_record(edge_detail.paragraph).paragraph_id),
          source_id: read_text(to_record(edge_detail.source).id),
        },
        0,
      );
    }
    if (edge_detail?.paragraph) {
      const record = to_record(edge_detail.paragraph);
      const source_id = read_text(record.source_id);
      const source_name =
        read_text(record.source_name) ?? read_text(to_record(record.source).name) ?? null;
      if (source_id || source_name) {
        return source_preview_copy(
          {
            id: source_id ?? 'edge-source',
            name: source_name ?? '来源',
          },
          0,
        );
      }
    }
    return null;
  }, [edge_detail]);
  const related_evidence_source_ids = useMemo(
    () =>
      Array.from(
        new Set(
          [...node_source_previews, ...(edge_source_preview ? [edge_source_preview] : [])]
            .map((preview) => preview.source_id)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [edge_source_preview, node_source_previews],
  );

  const evidence_layer_active = graph_data_view === 'evidence';
  const can_enter_local_graph = graph_data_view === 'semantic' && is_entity_node(selected_node);
  const search_results_visible = is_search_open && Boolean(node_keyword.trim() || node_matches.length);
  const active_search_candidate = node_matches[active_search_index] ?? node_matches[0] ?? null;
  const current_focus_reason = useMemo(() => {
    if (selected_node) {
      return `当前焦点：${selected_node.display_label ?? selected_node.label}`;
    }
    if (selected_edge) {
      return `当前焦点：${relation_summary_text(selected_edge, node_map)}`;
    }
    if (highlighted_node_ids.length || highlighted_edge_ids.length) {
      return '当前焦点：高亮上下文';
    }
    return '当前焦点：全局图';
  }, [highlighted_edge_ids.length, highlighted_node_ids.length, node_map, selected_edge, selected_node]);
  const highlighted_source_id = useMemo(
    () =>
      highlighted_node_ids
        .find((node_id) => node_id.startsWith('source:'))
        ?.replace(/^source:/, '') ?? null,
    [highlighted_node_ids],
  );
  const highlighted_paragraph_id = useMemo(
    () =>
      highlighted_node_ids
        .find((node_id) => node_id.startsWith('paragraph:'))
        ?.replace(/^paragraph:/, '') ?? null,
    [highlighted_node_ids],
  );
  const current_highlight_reason_label = useMemo(() => {
    if (highlighted_paragraph_id || highlighted_source_id) {
      return '当前高亮原因：来源证据';
    }
    return current_focus_reason;
  }, [current_focus_reason, highlighted_paragraph_id, highlighted_source_id]);
  const current_paragraph_label = useMemo(
    () => paragraph_focus_label(highlighted_paragraph_id, node_detail, edge_detail),
    [edge_detail, highlighted_paragraph_id, node_detail],
  );
  const current_view_label =
    graph_data_view === 'structure'
      ? '结构图谱'
      : graph_data_view === 'evidence'
        ? '证据子图'
        : graph_view_mode === 'local'
          ? GRAPH_VIEW_MODE_LABELS.local
          : reading_mode === 'reading'
            ? '\u5168\u5c40\u9605\u8bfb'
            : '\u5168\u5c40\u6d4f\u89c8';
  const visible_summary_label = [
    `当前可见: ${projected_graph.summary.visible_entity_count} 实体`,
    `${projected_graph.summary.visible_semantic_edge_count} 语义关系`,
    projected_graph.summary.visible_source_anchor_count
      ? `${projected_graph.summary.visible_source_anchor_count} 来源锚点`
      : null,
    projected_graph.summary.visible_provenance_edge_count
      ? `${projected_graph.summary.visible_provenance_edge_count} 来源连接`
      : null,
  ]
    .filter(Boolean)
    .join(' / ');
  const selected_edge_source_label = selected_edge
    ? edge_node_label(selected_edge.source, node_map)
    : '';
  const selected_edge_target_label = selected_edge
    ? edge_node_label(selected_edge.target, node_map)
    : '';
  const node_source_label = useMemo(() => {
    if (!node_detail) {
      return '未关联来源';
    }
    const source_name =
      typeof to_record(node_detail.source).name === 'string'
        ? (to_record(node_detail.source).name as string)
        : '';
    return summary_value(
      selected_node?.source_name ?? summary_value(source_name, ''),
      '未关联来源',
    );
  }, [node_detail, selected_node?.source_name]);
  const compact_selection = useMemo(() => {
    if (!compact_inspector_open) {
      return null;
    }
    if (selected_node) {
      const source_summary = selected_node.source_name
        ? `\u6765\u6e90: ${selected_node.source_name}`
        : '\u672a\u5173\u8054\u6765\u6e90';
      const evidence_summary =
        typeof selected_node.evidence_count === 'number'
          ? `\u8bc1\u636e ${selected_node.evidence_count}`
          : '\u8bc1\u636e\u5f85\u5c55\u5f00';
      return {
        title: selected_node.display_label ?? selected_node.label,
        subtitle: node_kind_label(selected_node),
        summary: `${source_summary} · ${evidence_summary}`,
      };
    }
    if (selected_edge) {
      return {
        title: selected_edge.display_label ?? selected_edge.label,
        subtitle: summary_value(selected_edge.relation_kind_label, selected_edge.type),
        summary: `${selected_edge_source_label} -> ${selected_edge_target_label}`,
      };
    }
    return null;
  }, [
    compact_inspector_open,
    selected_edge,
    selected_edge_source_label,
    selected_edge_target_label,
    selected_node,
  ]);

  useEffect(() => {
    set_active_search_index((current) => {
      if (!node_matches.length) {
        return 0;
      }
      return Math.min(current, node_matches.length - 1);
    });
  }, [node_matches.length, set_active_search_index]);

  function handle_select_node(node_id: string): void {
    select_node(node_id);
  }

  function handle_select_edge(edge_id: string): void {
    select_edge(edge_id);
  }

  function handle_clear_selection(): void {
    clear_graph_selection();
    clear_graph_details();
    close_inspector();
  }

  function handle_clear_all(): void {
    clear_graph_selection();
    clear_graph_details();
    clear_highlights();
    reset_view_state();
  }

  async function handle_refresh_graph(): Promise<void> {
    await refresh_graph();
    fit_all('refresh');
  }

  function choose_search_candidate(candidate: GraphSearchCandidateRecord): void {
    set_node_keyword(candidate.label);
    set_is_search_open(false);
    set_active_search_index(0);
    handle_select_node(candidate.id);
    focus_selection('user');
  }

  function handle_apply_search(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!active_search_candidate) {
      return;
    }
    choose_search_candidate(active_search_candidate);
  }

  function handle_search_key_down(event: KeyboardEvent<HTMLInputElement>): void {
    if (!search_results_visible && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      set_is_search_open(true);
      return;
    }
    if (!node_matches.length) {
      if (event.key === 'Escape') {
        set_is_search_open(false);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      set_active_search_index((current) => (current + 1) % node_matches.length);
      set_is_search_open(true);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      set_active_search_index((current) => (current - 1 + node_matches.length) % node_matches.length);
      set_is_search_open(true);
      return;
    }
    if (event.key === 'Enter') {
      if (is_search_open && active_search_candidate) {
        event.preventDefault();
        choose_search_candidate(active_search_candidate);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      set_is_search_open(false);
    }
  }

  function handle_search_shell_blur(event: FocusEvent<HTMLDivElement>): void {
    const next_target = event.relatedTarget as Node | null;
    if (next_target && search_shell_ref.current?.contains(next_target)) {
      return;
    }
    set_is_search_open(false);
  }

  function handle_toggle_source(source_id: string): void {
    set_selected_source_ids((current) =>
      current.includes(source_id)
        ? current.filter((item) => item !== source_id)
        : [...current, source_id],
    );
  }

  function open_evidence_entry(): void {
    open_evidence_graph({
      node_ids: selected_node_id ? [selected_node_id] : highlighted_node_ids,
      edge_ids: selected_edge_id ? [selected_edge_id] : highlighted_edge_ids,
    });
    if (related_evidence_source_ids.length) {
      set_selected_source_ids(related_evidence_source_ids);
    }
    if (has_focus_target) {
      focus_selection('user');
    }
  }

  function highlight_current_evidence(source_id?: string | null, paragraph_id?: string | null): void {
    if (source_id && paragraph_id) {
      focus_citation(source_id, paragraph_id);
      return;
    }
    if (paragraph_id) {
      focus_paragraph(paragraph_id);
      return;
    }
    if (source_id) {
      set_selected_source_ids([source_id]);
      open_evidence_graph({ node_ids: [`source:${source_id}`] });
      focus_selection('user');
      return;
    }
    open_evidence_entry();
  }

  function handle_open_details(): void {
    if (selected_node_id) {
      request_node_detail(selected_node_id);
      open_inspector_panel();
      return;
    }
    if (selected_edge_id) {
      request_edge_detail(selected_edge_id);
      open_inspector_panel();
    }
  }

  async function handle_create_entity(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const label = create_label.trim();
    if (!label) {
      return;
    }
    const description = create_description.trim();
    const scoped_source_id = selected_source_ids.length === 1 ? selected_source_ids[0] : null;
    await create_entity(label, {
      description: description || undefined,
      source_id: scoped_source_id,
      metadata: {
        ...(description ? { description } : {}),
        ...(scoped_source_id ? { source_id: scoped_source_id } : {}),
      },
    });
    set_create_label('');
    set_create_description('');
  }

  async function handle_create_relation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const { subject_node_id, predicate, object_node_id, weight } = relation_draft;
    if (!subject_node_id || !object_node_id || !predicate.trim() || subject_node_id === object_node_id) {
      return;
    }
    await create_relation(subject_node_id, predicate.trim(), object_node_id, weight);
    set_relation_draft((current) => ({
      ...current,
      predicate: current.predicate.trim() || DEFAULT_PREDICATE,
      object_node_id: '',
    }));
  }

  async function handle_rename_node(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!node_detail) {
      return;
    }
    const next_label = rename_value.trim();
    const current_label = node_detail.node.display_label ?? node_detail.node.label;
    if (!next_label || next_label === current_label) {
      return;
    }
    await rename_node(node_detail.node.id, next_label);
  }

  async function handle_delete_selected_node(): Promise<void> {
    if (!node_detail || !selected_node_copy?.delete_allowed) {
      return;
    }
    if (!window.confirm(selected_node_copy.delete_message)) {
      return;
    }
    await delete_node(node_detail.node.id);
    close_inspector();
    if (graph_view_mode === 'local') {
      enter_global_graph();
      return;
    }
    fit_all('user');
  }

  async function handle_delete_selected_edge(): Promise<void> {
    if (!edge_detail || !selected_edge_copy?.delete_allowed) {
      return;
    }
    if (!window.confirm(selected_edge_copy.delete_message)) {
      return;
    }
    await delete_edge(edge_detail.edge.id);
    close_inspector();
    fit_all('user');
  }

  function assign_relation_endpoint(role: 'subject' | 'object', node_id?: string): void {
    const next_node_id = node_id ?? selected_node_id ?? '';
    const node = next_node_id ? node_map.get(next_node_id) ?? null : null;
    if (!is_entity_node(node)) {
      return;
    }
    open_left_drawer('relation');
    set_relation_draft((current) => ({
      ...current,
      subject_node_id: role === 'subject' ? next_node_id : current.subject_node_id,
      object_node_id: role === 'object' ? next_node_id : current.object_node_id,
    }));
  }

  function start_relation_from_current_node(): void {
    if (!is_entity_node(selected_node)) {
      return;
    }
    open_left_drawer('relation');
    set_relation_draft((current) => ({
      ...current,
      subject_node_id: current.subject_node_id || selected_node.id,
    }));
  }

  function copy_edge_to_relation_form(): void {
    if (!edge_detail) {
      return;
    }
    const subject_node = node_map.get(edge_detail.edge.source) ?? null;
    const object_node = node_map.get(edge_detail.edge.target) ?? null;
    if (!is_entity_node(subject_node) || !is_entity_node(object_node)) {
      return;
    }
    open_left_drawer('relation');
    set_relation_draft({
      subject_node_id: edge_detail.edge.source,
      predicate: edge_detail.edge.display_label || edge_detail.edge.label || DEFAULT_PREDICATE,
      object_node_id: edge_detail.edge.target,
      weight: edge_detail.edge.weight || 0.9,
    });
  }

  const show_stage_selection = Boolean(
    compact_inspector_open &&
      !inspector_open &&
      (!selected_node || (selected_node.type !== 'source' && selected_node.type !== 'workbook')),
  );
  const stage_compact_selection = show_stage_selection ? compact_selection : null;
  const show_stage_status =
    !inspector_open &&
    (Boolean(stage_compact_selection || current_paragraph_label) ||
      current_view_label !== '全局浏览' ||
      layer_summary_label !== '语义图谱');
  const stage_class_name = [
    'kb-graph-stage',
    left_drawer_mode ? 'has-left-drawer' : '',
    inspector_open ? 'has-right-drawer' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className='kb-panel kb-graph-page'>
      <GraphBrowserToolbar
        active_search_candidate={active_search_candidate}
        active_search_index={active_search_index}
        can_enter_local_graph={can_enter_local_graph}
        graph_view_mode={graph_view_mode}
        has_focus_target={has_focus_target}
        node_keyword={node_keyword}
        node_matches={node_matches}
        on_apply_search={handle_apply_search}
        on_choose_search_candidate={choose_search_candidate}
        on_enter_global_graph={enter_global_graph}
        on_enter_local_graph={enter_local_graph}
        on_fit_all={() => fit_all('user')}
        on_focus_selected={() => focus_selection('user')}
        on_node_keyword_change={(value) => {
          set_node_keyword(value);
          set_active_search_index(0);
          set_is_search_open(true);
        }}
        on_open_create_node={() => open_left_drawer('create-node')}
        on_open_filters={() => open_left_drawer('filters')}
        on_open_relation={() => open_left_drawer('relation')}
        on_relayout_graph={relayout_graph}
        on_refresh_graph={() => void handle_refresh_graph()}
        on_search_focus={() => set_is_search_open(true)}
        on_search_key_down={handle_search_key_down}
        on_search_shell_blur={handle_search_shell_blur}
        on_zoom_in={() => request_viewport('zoom-in')}
        on_zoom_out={() => request_viewport('zoom-out')}
        search_results_visible={search_results_visible}
        search_shell_ref={search_shell_ref}
        source_scope_label={source_scope_label}
        visible_summary_label={visible_summary_label}
      />

      {graph_error_message ? <div className='kb-graph-error-banner'>{graph_error_message}</div> : null}

      <section className={stage_class_name}>

        {left_drawer_mode ? (
          <aside className='kb-graph-drawer kb-graph-drawer-left'>
            <div className='kb-graph-drawer-card'>
              {left_drawer_mode === 'filters' ? (
                <GraphBrowserFiltersDrawer
                  density={density}
                  filtered_sources={filtered_sources}
                  graph_data_view={graph_data_view}
                  on_clear_source_filters={clear_source_filters}
                  on_close={close_left_drawer}
                  on_reset_graph_filters={reset_graph_filters}
                  on_select_graph_data_view={set_graph_data_view}
                  on_set_density={set_density}
                  on_source_keyword_change={set_source_keyword}
                  on_toggle_source={handle_toggle_source}
                  selected_source_ids={selected_source_ids}
                  source_keyword={source_keyword}
                  source_scope_label={source_scope_label}
                  sources={sources}
                />
              ) : null}

              {left_drawer_mode === 'create-node' ? (
                <GraphBrowserEntityDrawer
                  create_description={create_description}
                  create_label={create_label}
                  is_creating_node={is_creating_node}
                  on_close={close_left_drawer}
                  on_create_description_change={set_create_description}
                  on_create_label_change={set_create_label}
                  on_submit={(event) => void handle_create_entity(event)}
                />
              ) : null}

              {left_drawer_mode === 'relation' ? (
                <GraphBrowserRelationDrawer
                  graph={graph}
                  is_creating_manual_relation={is_creating_manual_relation}
                  manual_relation_count={manual_relations.length}
                  on_assign_object={() => assign_relation_endpoint('object', selected_node?.id)}
                  on_assign_subject={() => assign_relation_endpoint('subject', selected_node?.id)}
                  on_close={close_left_drawer}
                  on_relation_draft_change={set_relation_draft}
                  on_submit={(event) => void handle_create_relation(event)}
                  relation_draft={relation_draft}
                  relation_node_options={relation_node_options}
                  selected_node={selected_node}
                />
              ) : null}
            </div>
          </aside>
        ) : null}

        <div className='kb-graph-stage-canvas-shell'>
          <PixiKnowledgeGraphCanvas
            edges={projected_graph.edges}
            graph_view_mode={graph_view_mode}
            reading_lens={projected_graph.reading_lens}
            highlighted_edge_ids={highlighted_edge_ids}
            highlighted_node_ids={highlighted_node_ids}
            layout_revision={layout_revision}
            nodes={projected_graph.nodes}
            on_clear_selection={handle_clear_selection}
            on_select_edge={handle_select_edge}
            on_select_node={handle_select_node}
            resolved_theme={resolved_theme}
            selected_edge_id={selected_edge_id}
            selected_node_id={selected_node_id}
            viewport_mode={viewport_mode}
            viewport_request={viewport_request}
          />

          <GraphBrowserStageChrome
            current_view_label={current_view_label}
            compact_selection={stage_compact_selection}
            focus_label={current_highlight_reason_label}
            layer_summary_label={layer_summary_label}
            show_provenance_legend={projected_graph.summary.visible_provenance_edge_count > 0}
            show_source_anchor_legend={projected_graph.summary.visible_source_anchor_count > 0}
            show_status={show_stage_status}
            on_clear_selection={show_stage_selection ? handle_clear_selection : null}
            on_focus_selected={show_stage_selection ? () => focus_selection('user') : null}
            on_open_details={show_stage_selection ? handle_open_details : null}
            paragraph_label={current_paragraph_label}
          />

          {is_graph_loading ? <div className='kb-graph-loading'>正在刷新图谱...</div> : null}

          {has_focus_target && !compact_inspector_open && !inspector_open ? (
            <button
              aria-label='清空图谱选择与高亮'
              className='kb-graph-clear-button'
              onClick={handle_clear_all}
              type='button'
            >
              清空焦点
            </button>
          ) : null}
        </div>

        {inspector_open ? (
          <aside className='kb-graph-drawer kb-graph-drawer-right'>
            <div className='kb-graph-drawer-card'>
              <GraphBrowserInspector
                current_paragraph_label={current_paragraph_label}
                edge_detail={edge_detail}
                edge_paragraph_preview={edge_paragraph_preview}
                edge_source_preview={edge_source_preview}
                evidence_layer_active={evidence_layer_active}
                inspector_open={inspector_open}
                is_deleting_edge={is_deleting_edge}
                is_deleting_node={is_deleting_node}
                is_renaming_node={is_renaming_node}
                node_detail={node_detail}
                node_kind_label={node_kind_label}
                node_paragraph_previews={node_paragraph_previews}
                node_relation_previews={node_relation_previews}
                node_source_label={node_source_label}
                node_source_previews={node_source_previews}
                on_assign_object={() => assign_relation_endpoint('object')}
                on_assign_subject={() => assign_relation_endpoint('subject')}
                on_clear_highlights={clear_highlights}
                on_clear_selection={handle_clear_selection}
                on_close={close_inspector}
                on_copy_edge_to_relation_form={copy_edge_to_relation_form}
                on_delete_selected_edge={() => void handle_delete_selected_edge()}
                on_delete_selected_node={() => void handle_delete_selected_node()}
                on_focus_evidence_paragraph={focus_paragraph}
                on_focus_selected={() => focus_selection('user')}
                on_highlight_current_evidence={highlight_current_evidence}
                on_open_evidence_entry={open_evidence_entry}
                on_open_evidence_source={focus_source}
                on_rename_value_change={set_rename_value}
                on_start_relation_from_current_node={start_relation_from_current_node}
                on_submit_rename={(event) => void handle_rename_node(event)}
                rename_value={rename_value}
                selected_edge_copy={selected_edge_copy}
                selected_edge_rows={selected_edge_rows}
                selected_edge_source_label={selected_edge_source_label}
                selected_edge_target_label={selected_edge_target_label}
                selected_node_copy={selected_node_copy}
                selected_node_rows={selected_node_rows}
                summary_value={summary_value}
              />
            </div>
          </aside>
        ) : null}
      </section>
    </section>
  );
}
