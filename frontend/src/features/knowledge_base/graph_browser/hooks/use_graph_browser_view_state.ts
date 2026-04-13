import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';

import type {
  GraphDrawerMode,
  GraphFocusCommand,
  GraphLayerMode,
  GraphNodeDetailRecord,
  GraphViewIntent,
  GraphViewMode,
  GraphViewportAction,
  GraphViewportMode,
  GraphViewportRequest,
  KnowledgeGraphNodeRecord,
  LocalGraphState,
} from '../../shared/types/knowledge_base_types';
import { DEFAULT_PREDICATE } from '../components/graph_browser_utils';
import type {
  GraphBrowserRelationDraft,
  GraphBrowserViewState,
} from '../components/graph_browser_view_types';

interface UseGraphBrowserViewStateProps {
  selected_node_id: string | null;
  selected_edge_id: string | null;
  highlighted_node_ids: string[];
  highlighted_edge_ids: string[];
  selected_node: KnowledgeGraphNodeRecord | null;
  node_detail: GraphNodeDetailRecord | null;
  graph_focus_command: GraphFocusCommand | null;
}

const DEFAULT_LAYER_MODES: GraphLayerMode[] = ['semantic'];
const DEFAULT_READING_MODE: GraphViewIntent = 'overview';
const DEFAULT_LOCAL_GRAPH_STATE: LocalGraphState = {
  anchor_node_id: null,
  depth: 1,
};
const DEFAULT_RELATION_DRAFT: GraphBrowserRelationDraft = {
  subject_node_id: '',
  predicate: DEFAULT_PREDICATE,
  object_node_id: '',
  weight: 0.9,
};

function is_entity_node(
  node: KnowledgeGraphNodeRecord | null | undefined,
): node is KnowledgeGraphNodeRecord {
  return Boolean(node && node.type === 'entity');
}

function is_reading_focus_node_id(node_id: string | null | undefined): boolean {
  return Boolean(node_id && !node_id.startsWith('source:') && !node_id.startsWith('workbook:'));
}

function ensure_layer_modes(next_modes: GraphLayerMode[]): GraphLayerMode[] {
  const unique_modes = Array.from(new Set(next_modes));
  return unique_modes.includes('semantic') ? unique_modes : ['semantic', ...unique_modes];
}

export function use_graph_browser_view_state(
  props: UseGraphBrowserViewStateProps,
): {
  search_shell_ref: RefObject<HTMLDivElement>;
  state: GraphBrowserViewState;
  left_drawer_mode: 'filters' | 'create-node' | 'relation' | null;
  inspector_open: boolean;
  compact_inspector_open: boolean;
  set_source_keyword: Dispatch<SetStateAction<string>>;
  set_node_keyword: Dispatch<SetStateAction<string>>;
  set_is_search_open: Dispatch<SetStateAction<boolean>>;
  set_active_search_index: Dispatch<SetStateAction<number>>;
  set_rename_value: Dispatch<SetStateAction<string>>;
  set_create_label: Dispatch<SetStateAction<string>>;
  set_create_description: Dispatch<SetStateAction<string>>;
  set_relation_draft: Dispatch<SetStateAction<GraphBrowserRelationDraft>>;
  set_active_layer_modes: Dispatch<SetStateAction<GraphLayerMode[]>>;
  open_inspector_panel: () => void;
  open_left_drawer: (mode: 'filters' | 'create-node' | 'relation') => void;
  close_left_drawer: () => void;
  close_inspector: () => void;
  set_graph_view_mode: Dispatch<SetStateAction<GraphViewMode>>;
  set_local_graph_state: Dispatch<SetStateAction<LocalGraphState>>;
  request_viewport: (
    type: GraphViewportAction,
    reason?: GraphViewportRequest['reason'],
  ) => void;
  fit_all: (reason?: GraphViewportRequest['reason']) => void;
  focus_selection: (reason?: GraphViewportRequest['reason']) => void;
  relayout_graph: () => void;
  enter_global_graph: () => void;
  enter_local_graph: () => void;
  reset_view_state: () => void;
} {
  const {
    selected_node_id,
    selected_edge_id,
    highlighted_node_ids,
    highlighted_edge_ids,
    selected_node,
    node_detail,
    graph_focus_command,
  } = props;
  const search_shell_ref = useRef<HTMLDivElement | null>(null);
  const viewport_request_id_ref = useRef(0);
  const last_graph_focus_command_id_ref = useRef<number | null>(null);
  const [layout_revision, set_layout_revision] = useState(0);
  const [graph_view_mode, set_graph_view_mode] = useState<GraphViewMode>('global');
  const [reading_mode, set_reading_mode] = useState<GraphViewIntent>(DEFAULT_READING_MODE);
  const [local_graph_state, set_local_graph_state] =
    useState<LocalGraphState>(DEFAULT_LOCAL_GRAPH_STATE);
  const [viewport_mode, set_viewport_mode] = useState<GraphViewportMode>('fit-all');
  const [viewport_request, set_viewport_request] = useState<GraphViewportRequest | null>(null);
  const [active_graph_drawer, set_active_graph_drawer] = useState<GraphDrawerMode>(null);
  const [inspector_mode, set_inspector_mode] = useState<'compact' | 'panel'>('compact');
  const [active_layer_modes, set_active_layer_modes] =
    useState<GraphLayerMode[]>(DEFAULT_LAYER_MODES);
  const [source_keyword, set_source_keyword] = useState('');
  const [node_keyword, set_node_keyword] = useState('');
  const [is_search_open, set_is_search_open] = useState(false);
  const [active_search_index, set_active_search_index] = useState(0);
  const [rename_value, set_rename_value] = useState('');
  const [create_label, set_create_label] = useState('');
  const [create_description, set_create_description] = useState('');
  const [relation_draft, set_relation_draft] =
    useState<GraphBrowserRelationDraft>(DEFAULT_RELATION_DRAFT);

  const has_selection = Boolean(selected_node_id || selected_edge_id);
  const has_reading_selection =
    Boolean(selected_edge_id) || is_reading_focus_node_id(selected_node_id);
  const has_reading_focus_context =
    has_reading_selection ||
    highlighted_edge_ids.length > 0 ||
    highlighted_node_ids.some((node_id) => is_reading_focus_node_id(node_id));

  useEffect(() => {
    if (node_detail) {
      set_rename_value(node_detail.node.display_label ?? node_detail.node.label);
    }
  }, [node_detail]);

  useEffect(() => {
    if (!selected_node_id && !selected_edge_id) {
      return;
    }
    set_inspector_mode('compact');
    if (graph_view_mode === 'global' && has_reading_selection) {
      set_reading_mode('reading');
    }
  }, [graph_view_mode, has_reading_selection, selected_edge_id, selected_node_id]);

  useEffect(() => {
    if (graph_view_mode === 'global' && !has_reading_focus_context) {
      set_reading_mode(DEFAULT_READING_MODE);
    }
  }, [graph_view_mode, has_reading_focus_context]);

  useEffect(() => {
    if (graph_view_mode !== 'local' || !is_entity_node(selected_node)) {
      return;
    }
    if (local_graph_state.anchor_node_id === selected_node.id) {
      return;
    }
    set_local_graph_state({
      anchor_node_id: selected_node.id,
      depth: Math.max(local_graph_state.depth, 1),
    });
  }, [graph_view_mode, local_graph_state.anchor_node_id, local_graph_state.depth, selected_node]);

  useEffect(() => {
    if (!graph_focus_command || last_graph_focus_command_id_ref.current === graph_focus_command.id) {
      return;
    }
    last_graph_focus_command_id_ref.current = graph_focus_command.id;
    if (graph_focus_command.target !== 'graph') {
      return;
    }

    set_active_layer_modes((current) =>
      ensure_layer_modes([...current, ...graph_focus_command.layer_modes]),
    );
    set_graph_view_mode(graph_focus_command.graph_view_mode);
    set_reading_mode(graph_focus_command.view_intent);
    if (graph_focus_command.graph_view_mode === 'global') {
      set_local_graph_state(DEFAULT_LOCAL_GRAPH_STATE);
    } else {
      set_local_graph_state({
        anchor_node_id: graph_focus_command.selected_node_id,
        depth: 1,
      });
    }
    if (graph_focus_command.selected_node_id || graph_focus_command.selected_edge_id) {
      set_inspector_mode('compact');
    }
    viewport_request_id_ref.current += 1;
    const next_mode =
      graph_focus_command.viewport_action === 'focus-selection'
        ? 'focus-selection'
        : 'fit-all';
    set_viewport_mode(next_mode);
    set_viewport_request({
      id: viewport_request_id_ref.current,
      type: graph_focus_command.viewport_action,
      mode: next_mode,
      reason: 'focus-command',
    });
  }, [graph_focus_command]);

  function request_viewport(
    type: GraphViewportAction,
    reason: GraphViewportRequest['reason'] = 'user',
  ): void {
    viewport_request_id_ref.current += 1;
    const next_mode =
      type === 'focus-selection' ? 'focus-selection' : type === 'fit-all' ? 'fit-all' : viewport_mode;
    if (type === 'fit-all' || type === 'focus-selection') {
      set_viewport_mode(next_mode);
    }
    set_viewport_request({
      id: viewport_request_id_ref.current,
      type,
      mode: next_mode,
      reason,
    });
  }

  function fit_all(reason: GraphViewportRequest['reason'] = 'user'): void {
    request_viewport('fit-all', reason);
  }

  function focus_selection(reason: GraphViewportRequest['reason'] = 'user'): void {
    request_viewport('focus-selection', reason);
  }

  function relayout_graph(): void {
    set_layout_revision((current) => current + 1);
    request_viewport('relayout');
  }

  function open_left_drawer(mode: 'filters' | 'create-node' | 'relation'): void {
    set_active_graph_drawer(mode);
  }

  function close_left_drawer(): void {
    set_active_graph_drawer((current) =>
      current === 'filters' || current === 'create-node' || current === 'relation' ? null : current,
    );
  }

  function close_inspector(): void {
    set_inspector_mode('compact');
  }

  function open_inspector_panel(): void {
    set_inspector_mode('panel');
  }

  function enter_global_graph(): void {
    set_graph_view_mode('global');
    set_local_graph_state(DEFAULT_LOCAL_GRAPH_STATE);
    set_reading_mode(has_reading_focus_context ? 'reading' : DEFAULT_READING_MODE);
    fit_all('mode-change');
  }

  function enter_local_graph(): void {
    if (!is_entity_node(selected_node)) {
      return;
    }
    set_graph_view_mode('local');
    set_reading_mode('reading');
    set_local_graph_state({
      anchor_node_id: selected_node.id,
      depth: 1,
    });
    fit_all('mode-change');
  }

  function reset_view_state(): void {
    set_node_keyword('');
    set_source_keyword('');
    set_is_search_open(false);
    set_active_search_index(0);
    set_graph_view_mode('global');
    set_reading_mode(DEFAULT_READING_MODE);
    set_local_graph_state(DEFAULT_LOCAL_GRAPH_STATE);
    set_active_graph_drawer(null);
    set_inspector_mode('compact');
    set_active_layer_modes(DEFAULT_LAYER_MODES);
    fit_all('user');
  }

  const left_drawer_mode =
    active_graph_drawer === 'filters' ||
    active_graph_drawer === 'create-node' ||
    active_graph_drawer === 'relation'
      ? active_graph_drawer
      : null;

  return {
    search_shell_ref,
    state: {
      layout_revision,
      graph_view_mode,
      reading_mode,
      local_graph_state,
      viewport_mode,
      viewport_request,
      active_graph_drawer,
      inspector_mode,
      active_layer_modes,
      source_keyword,
      node_keyword,
      is_search_open,
      active_search_index,
      rename_value,
      create_label,
      create_description,
      relation_draft,
    },
    left_drawer_mode,
    inspector_open: inspector_mode === 'panel' && has_selection,
    compact_inspector_open: inspector_mode === 'compact' && has_selection,
    set_source_keyword,
    set_node_keyword,
    set_is_search_open,
    set_active_search_index,
    set_rename_value,
    set_create_label,
    set_create_description,
    set_relation_draft,
    set_active_layer_modes,
    open_inspector_panel,
    open_left_drawer,
    close_left_drawer,
    close_inspector,
    set_graph_view_mode,
    set_local_graph_state,
    request_viewport,
    fit_all,
    focus_selection,
    relayout_graph,
    enter_global_graph,
    enter_local_graph,
    reset_view_state,
  };
}
