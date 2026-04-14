import type { Dispatch, SetStateAction } from 'react';

import type {
  GraphDataView,
  GraphFocusCommand,
  GraphLayerMode,
  GraphViewIntent,
  GraphViewMode,
  WorkspaceTab,
} from '../../types/knowledge_base_types';

interface WorkspaceFocusActionsProps {
  default_graph_density: number;
  highlighted_node_ids: string[];
  selected_node_id: string | null;
  set_active_workspace: Dispatch<SetStateAction<WorkspaceTab>>;
  set_is_source_library_open: Dispatch<SetStateAction<boolean>>;
  set_selected_edge_id: Dispatch<SetStateAction<string | null>>;
  set_selected_node_id: Dispatch<SetStateAction<string | null>>;
  set_highlighted_node_ids: Dispatch<SetStateAction<string[]>>;
  set_highlighted_edge_ids: Dispatch<SetStateAction<string[]>>;
  set_selected_source_browser_id: Dispatch<SetStateAction<string | null>>;
  set_selected_source_ids: Dispatch<SetStateAction<string[]>>;
  open_source_worksheet_preview: (payload: {
    source_id: string;
    version_id?: string | null;
    worksheet_key?: string | null;
    anchor_row_index?: number | null;
    highlighted_columns?: string[];
  }) => void;
  set_graph_data_view: (view: GraphDataView) => void;
  open_evidence_graph: (payload?: { node_ids?: string[]; edge_ids?: string[] }) => void;
  set_density: Dispatch<SetStateAction<number>>;
  set_graph_focus_command: Dispatch<SetStateAction<GraphFocusCommand | null>>;
}

interface CitationFocusOptions {
  preferred_anchor_node_id?: string | null;
  anchor_node_ids?: string[];
}

interface SourceFocusOptions {
  version_id?: string | null;
  worksheet_key?: string | null;
  anchor_row_index?: number | null;
  highlighted_columns?: string[];
}

export function use_workspace_focus_actions(props: WorkspaceFocusActionsProps) {
  const {
    default_graph_density,
    highlighted_node_ids,
    selected_node_id,
    set_active_workspace,
    set_is_source_library_open,
    set_selected_edge_id,
    set_selected_node_id,
    set_highlighted_node_ids,
    set_highlighted_edge_ids,
    set_selected_source_browser_id,
    set_selected_source_ids,
    open_source_worksheet_preview,
    set_graph_data_view,
    open_evidence_graph,
    set_density,
    set_graph_focus_command,
  } = props;

  function layer_modes_for_graph_data_view(graph_data_view: GraphDataView): GraphLayerMode[] {
    return [graph_data_view];
  }

  function issue_graph_focus_command(command: Omit<GraphFocusCommand, 'id'>): void {
    set_graph_focus_command((current) => ({
      ...command,
      id: (current?.id ?? 0) + 1,
    }));
  }

  function unique_ids(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function semantic_highlight_ids(): string[] {
    return highlighted_node_ids.filter((node_id) => node_id.startsWith('entity:'));
  }

  function preferred_semantic_anchor(): string | null {
    if (selected_node_id?.startsWith('entity:')) {
      return selected_node_id;
    }
    const semantic_ids = semantic_highlight_ids();
    if (semantic_ids.length === 1) {
      return semantic_ids[0];
    }
    return null;
  }

  function resolve_citation_anchor(options?: CitationFocusOptions): string | null {
    const preferred_anchor_node_id = String(options?.preferred_anchor_node_id ?? '').trim();
    if (preferred_anchor_node_id) {
      return preferred_anchor_node_id;
    }

    const anchor_node_ids = unique_ids(
      (options?.anchor_node_ids ?? []).filter((node_id) => node_id.startsWith('entity:')),
    );
    const current_anchor = preferred_semantic_anchor();
    if (current_anchor && anchor_node_ids.includes(current_anchor)) {
      return current_anchor;
    }
    return null;
  }

  function apply_graph_focus(options: {
    target: GraphFocusCommand['target'];
    reason: GraphFocusCommand['reason'];
    view_intent?: GraphViewIntent;
    graph_view_mode: GraphViewMode;
    selected_node_id: string | null;
    selected_edge_id: string | null;
    highlighted_node_ids: string[];
    highlighted_edge_ids: string[];
    graph_data_view?: GraphDataView;
    anchor_node_ids?: string[];
    anchor_edge_ids?: string[];
    source_ids?: string[];
    layer_modes?: GraphLayerMode[];
    viewport_action?: GraphFocusCommand['viewport_action'];
    source_browser_id?: string | null;
    source_library_open?: boolean;
    active_workspace?: WorkspaceTab;
  }): void {
    const source_ids = options.source_ids ?? [];
    const graph_data_view = options.graph_data_view ?? 'semantic';
    const layer_modes = options.layer_modes ?? layer_modes_for_graph_data_view(graph_data_view);
    const active_workspace =
      options.active_workspace ?? (options.target === 'source-browser' ? 'chat' : 'graph');
    const source_library_open = options.source_library_open ?? options.target === 'source-browser';

    set_active_workspace(active_workspace);
    set_is_source_library_open(source_library_open);
    set_selected_source_browser_id(options.source_browser_id ?? source_ids[0] ?? null);
    set_selected_source_ids(source_ids);
    set_graph_data_view(graph_data_view);
    set_selected_node_id(options.selected_node_id);
    set_selected_edge_id(options.selected_edge_id);
    set_highlighted_node_ids(options.highlighted_node_ids);
    set_highlighted_edge_ids(options.highlighted_edge_ids);
    if (graph_data_view === 'evidence') {
      open_evidence_graph({
        node_ids: options.anchor_node_ids,
        edge_ids: options.anchor_edge_ids,
      });
    }
    issue_graph_focus_command({
      target: options.target,
      reason: options.reason,
      graph_data_view,
      view_intent: options.view_intent ?? 'reading',
      graph_view_mode: options.graph_view_mode,
      selected_node_id: options.selected_node_id,
      selected_edge_id: options.selected_edge_id,
      highlighted_node_ids: options.highlighted_node_ids,
      highlighted_edge_ids: options.highlighted_edge_ids,
      source_ids,
      layer_modes,
      viewport_action: options.viewport_action ?? 'focus-selection',
    });
  }

  function focus_entity(entity_id: string): void {
    apply_graph_focus({
      target: 'graph',
      reason: 'entity',
      view_intent: 'reading',
      graph_view_mode: 'global',
      selected_node_id: `entity:${entity_id}`,
      selected_edge_id: null,
      highlighted_node_ids: [`entity:${entity_id}`],
      highlighted_edge_ids: [],
      graph_data_view: 'semantic',
    });
  }

  function focus_relation(relation_id: string): void {
    apply_graph_focus({
      target: 'graph',
      reason: 'relation',
      view_intent: 'reading',
      graph_view_mode: 'global',
      selected_node_id: null,
      selected_edge_id: `relation:${relation_id}`,
      highlighted_node_ids: [],
      highlighted_edge_ids: [`relation:${relation_id}`],
      graph_data_view: 'semantic',
    });
  }

  function focus_source(source_id: string, options?: SourceFocusOptions): void {
    apply_graph_focus({
      target: 'source-browser',
      reason: 'source',
      view_intent: 'reading',
      graph_view_mode: 'global',
      selected_node_id: null,
      selected_edge_id: null,
      highlighted_node_ids: [`source:${source_id}`],
      highlighted_edge_ids: [],
      source_ids: [source_id],
      graph_data_view: 'semantic',
      source_browser_id: source_id,
      active_workspace: 'chat',
      source_library_open: true,
    });
    open_source_worksheet_preview({
      source_id,
      version_id: options?.version_id ?? null,
      worksheet_key: options?.worksheet_key ?? null,
      anchor_row_index: options?.anchor_row_index ?? null,
      highlighted_columns: options?.highlighted_columns ?? [],
    });
  }

  function focus_paragraph(paragraph_id: string): void {
    apply_graph_focus({
      target: 'graph',
      reason: 'paragraph',
      view_intent: 'reading',
      graph_view_mode: 'global',
      selected_node_id: `paragraph:${paragraph_id}`,
      selected_edge_id: null,
      highlighted_node_ids: [`paragraph:${paragraph_id}`],
      highlighted_edge_ids: [],
      graph_data_view: 'evidence',
      anchor_node_ids: [`paragraph:${paragraph_id}`],
    });
  }

  function focus_citation(
    source_id: string,
    paragraph_id: string,
    options?: CitationFocusOptions,
  ): void {
    const semantic_ids = semantic_highlight_ids();
    const anchor_node_id = resolve_citation_anchor(options);

    apply_graph_focus({
      target: 'graph',
      reason: 'citation',
      view_intent: 'reading',
      graph_view_mode: 'global',
      selected_node_id: anchor_node_id,
      selected_edge_id: null,
      highlighted_node_ids: unique_ids([
        ...semantic_ids,
        `source:${source_id}`,
        `paragraph:${paragraph_id}`,
      ]),
      highlighted_edge_ids: [],
      source_ids: [source_id],
      graph_data_view: 'evidence',
      anchor_node_ids: unique_ids(
        [anchor_node_id, `paragraph:${paragraph_id}`].filter(Boolean) as string[],
      ),
      source_browser_id: source_id,
    });
  }

  function clear_highlights(): void {
    set_highlighted_node_ids([]);
    set_highlighted_edge_ids([]);
  }

  function select_node(node_id: string): void {
    set_selected_edge_id(null);
    set_selected_node_id(node_id);
  }

  function select_edge(edge_id: string): void {
    set_selected_node_id(null);
    set_selected_edge_id(edge_id);
  }

  function clear_graph_selection(): void {
    set_selected_node_id(null);
    set_selected_edge_id(null);
  }

  function clear_source_filters(): void {
    set_selected_source_ids([]);
  }

  function reset_graph_filters(): void {
    set_selected_source_ids([]);
    set_graph_data_view('semantic');
    set_density(default_graph_density);
  }

  return {
    focus_entity,
    focus_relation,
    focus_source,
    focus_paragraph,
    focus_citation,
    clear_highlights,
    select_node,
    select_edge,
    clear_graph_selection,
    clear_source_filters,
    reset_graph_filters,
  };
}
