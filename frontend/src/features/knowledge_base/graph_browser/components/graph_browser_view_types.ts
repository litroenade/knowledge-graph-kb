import type {
  GraphDrawerMode,
  GraphLayerMode,
  GraphViewIntent,
  GraphViewMode,
  GraphViewportMode,
  GraphViewportRequest,
  LocalGraphState,
} from '../../shared/types/knowledge_base_types';

export interface GraphBrowserRelationDraft {
  subject_node_id: string;
  predicate: string;
  object_node_id: string;
  weight: number;
}

export interface PreviewCardRecord {
  key: string;
  title: string;
  description: string;
  source_id?: string | null;
  paragraph_id?: string | null;
}

export interface GraphBrowserViewState {
  layout_revision: number;
  graph_view_mode: GraphViewMode;
  reading_mode: GraphViewIntent;
  local_graph_state: LocalGraphState;
  viewport_mode: GraphViewportMode;
  viewport_request: GraphViewportRequest | null;
  active_graph_drawer: GraphDrawerMode;
  inspector_mode: 'compact' | 'panel';
  active_layer_modes: GraphLayerMode[];
  source_keyword: string;
  node_keyword: string;
  is_search_open: boolean;
  active_search_index: number;
  rename_value: string;
  create_label: string;
  create_description: string;
  relation_draft: GraphBrowserRelationDraft;
}
