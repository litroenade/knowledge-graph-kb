import {
  compact_selected_source_summary,
  format_source_display_name,
} from '../../graph_browser/components/graph_browser_utils';
import { WORKSPACE_LABELS } from '../config/ui_constants';
import {
  use_workspace_focus_context,
  use_workspace_graph_context,
  use_workspace_import_context,
  use_workspace_source_context,
  use_workspace_ui_context,
} from '../context/knowledge_base_workspace_context';

const ACTIVE_TASK_STATUSES: Set<string> = new Set(['queued', 'running']);
const AVAILABLE_SOURCE_STATUSES: Set<string> = new Set(['ready', 'partial']);

function is_source_context_node(node: { type: string }): boolean {
  return node.type === 'source' || node.type === 'workbook';
}

export function use_workspace_shell() {
  const ui = use_workspace_ui_context();
  const graph = use_workspace_graph_context();
  const imports = use_workspace_import_context();
  const source = use_workspace_source_context();
  const focus = use_workspace_focus_context();

  const active_task_count = imports.tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status)).length;
  const available_source_count = source.sources.filter((item) => AVAILABLE_SOURCE_STATUSES.has(item.status)).length;
  const selected_sources = source.sources.filter((item) => graph.selected_source_ids.includes(item.id));
  const selected_source_names = selected_sources.map((item) =>
    format_source_display_name(item, source.sources),
  );
  const highlight_count = graph.highlighted_node_ids.length + graph.highlighted_edge_ids.length;
  const semantic_scope_entity_count = graph.graph.nodes.filter(
    (node) => (node.family ?? 'semantic') === 'semantic' && node.type === 'entity',
  ).length;
  const semantic_scope_relation_count = graph.graph.edges.filter(
    (edge) => (edge.family ?? 'semantic') === 'semantic' && edge.type !== 'provenance',
  ).length;
  const semantic_scope_source_anchor_count = graph.graph.nodes.filter((node) => is_source_context_node(node)).length;
  const semantic_scope_provenance_count = graph.graph.edges.filter((edge) => edge.type === 'provenance').length;
  const selected_node_label =
    graph.graph.nodes.find((node) => node.id === graph.selected_node_id)?.display_label ??
    graph.graph.nodes.find((node) => node.id === graph.selected_node_id)?.label ??
    null;
  const selected_edge_label =
    graph.graph.edges.find((edge) => edge.id === graph.selected_edge_id)?.display_label ??
    graph.graph.edges.find((edge) => edge.id === graph.selected_edge_id)?.label ??
    null;
  const focus_summary =
    selected_node_label ??
    selected_edge_label ??
    source.source_detail?.source.name ??
    (ui.last_query_text ? `最近问题：${ui.last_query_text}` : '准备开始新的知识问答');

  return {
    active_workspace: ui.active_workspace,
    set_active_workspace: ui.set_active_workspace,
    message: ui.message,
    error: ui.error,
    workspace_label: WORKSPACE_LABELS[ui.active_workspace],
    query_mode: ui.query_mode,
    document_count: available_source_count,
    task_count: imports.tasks.length,
    active_task_count,
    ready_source_count: available_source_count,
    node_count: graph.graph.nodes.length,
    edge_count: graph.graph.edges.length,
    semantic_scope_entity_count,
    semantic_scope_relation_count,
    semantic_scope_source_anchor_count,
    semantic_scope_provenance_count,
    highlight_count,
    highlight_node_count: graph.highlighted_node_ids.length,
    highlight_edge_count: graph.highlighted_edge_ids.length,
    focus_summary,
    selected_source_names,
    selected_source_summary: compact_selected_source_summary(graph.selected_source_ids, source.sources, 3),
    source_density: graph.density,
    graph_data_view: graph.graph_data_view,
    sidebar_collapsed: ui.sidebar_collapsed,
    set_sidebar_collapsed: ui.set_sidebar_collapsed,
    sidebar_width: ui.sidebar_width,
    set_sidebar_width: ui.set_sidebar_width,
    clear_source_filters: focus.clear_source_filters,
    reset_graph_filters: focus.reset_graph_filters,
    clear_highlights: focus.clear_highlights,
    clear_graph_selection: focus.clear_graph_selection,
    refresh_graph: graph.refresh_graph,
  };
}
