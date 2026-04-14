/**
 * Shared workspace type definitions.
 */
export interface ImportChunkRecord {
  id: string;
  job_id: string;
  file_id: string;
  paragraph_id: string | null;
  chunk_index: number;
  chunk_type: string;
  status: string;
  step: string;
  progress: number;
  content_preview: string | null;
  metadata: Record<string, unknown>;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportFileRecord {
  id: string;
  job_id: string;
  source_id: string | null;
  name: string;
  source_kind: string;
  input_mode: string;
  strategy: string;
  status: string;
  current_step: string;
  progress: number;
  total_chunks: number;
  completed_chunks: number;
  failed_chunks: number;
  storage_path: string | null;
  metadata: Record<string, unknown>;
  error: string | null;
  failure_stage: string | null;
  step_durations: Record<string, number>;
  stats: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  chunks: ImportChunkRecord[];
}

export interface ImportTaskRecord {
  id: string;
  source: string;
  input_mode: string;
  strategy: string;
  status: string;
  current_step: string;
  progress: number;
  total_files: number;
  completed_files: number;
  failed_files: number;
  total_chunks: number;
  completed_chunks: number;
  failed_chunks: number;
  message: string | null;
  error: string | null;
  params: Record<string, unknown>;
  failure_stage: string | null;
  step_durations: Record<string, number>;
  retry_of: string | null;
  stats: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  files: ImportFileRecord[];
}

export interface KnowledgeGraphNodeRecord {
  id: string;
  type: string;
  label: string;
  size: number;
  score: number | null;
  display_label?: string | null;
  kind_label?: string | null;
  source_name?: string | null;
  evidence_count?: number | null;
  family?: GraphDataView | null;
  metadata: Record<string, unknown>;
}

export interface KnowledgeGraphEdgeRecord {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  weight: number;
  display_label?: string | null;
  relation_kind_label?: string | null;
  source_name?: string | null;
  evidence_paragraph_id?: string | null;
  is_structural?: boolean | null;
  family?: GraphDataView | null;
  metadata: Record<string, unknown>;
}

export interface KnowledgeGraphRecord {
  view?: GraphDataView;
  nodes: KnowledgeGraphNodeRecord[];
  edges: KnowledgeGraphEdgeRecord[];
}

export interface GraphNodeDetailRecord {
  node: KnowledgeGraphNodeRecord;
  source: Record<string, unknown> | null;
  paragraphs: Record<string, unknown>[];
  relations: Record<string, unknown>[];
}

export interface GraphEdgeDetailRecord {
  edge: KnowledgeGraphEdgeRecord;
  source: Record<string, unknown> | null;
  paragraph: Record<string, unknown> | null;
}

export interface ManualRelationRecord {
  id: string;
  subject_node_id: string;
  predicate: string;
  object_node_id: string;
  weight: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ParagraphRenderKind = 'text' | 'row_record' | 'sheet_summary' | 'worksheet_preview';

export type KBScopeMode = 'all' | 'single' | 'subset';
export type KBVersionMode = 'latest' | 'specific';

export interface KBScopeRecord {
  mode: KBScopeMode;
  source_ids: string[];
  version_mode: KBVersionMode;
  version_id?: string | null;
  excluded_source_ids: string[];
}

export interface AnswerSourceRecord {
  source_id: string;
  version_id: string;
  source_name: string;
  file_path?: string | null;
  citation_count: number;
  snippet?: string | null;
}

export interface AnswerCitationRecord {
  paragraph_id: string;
  chunk_id?: string | null;
  source_id: string;
  version_id?: string | null;
  source_name: string;
  file_path?: string | null;
  excerpt: string;
  snippet?: string | null;
  score: number;
  match_reason?: string | null;
  matched_fields?: string[];
  source_kind?: string | null;
  worksheet_name?: string | null;
  worksheet_key?: string | null;
  row_index?: number | null;
  anchor_row_index?: number | null;
  page_number?: number | null;
  paragraph_position?: number | null;
  winning_lane?: string | null;
  start_offset?: number | null;
  end_offset?: number | null;
  anchor_node_ids?: string[];
  preferred_anchor_node_id?: string | null;
  render_kind: ParagraphRenderKind;
  rendered_html: string | null;
  render_metadata: Record<string, unknown>;
}

export interface AnswerExecutionRecord {
  status: string;
  retrieval_mode: string;
  model_invoked: boolean;
  matched_paragraph_count: number;
  message: string;
}

export interface RetrievalTraceLaneRecord {
  executed: boolean;
  skipped_reason: string | null;
  hit_count: number;
  latency_ms: number;
  top_paragraph_ids: string[];
}

export interface RetrievalTraceRecord {
  structured: RetrievalTraceLaneRecord;
  vector: RetrievalTraceLaneRecord;
  fusion: RetrievalTraceLaneRecord;
  ppr: RetrievalTraceLaneRecord;
  total_ms: number;
}

export interface ChatSessionRecord {
  id: string;
  title: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface ChatMessageRecord {
  id: string;
  session_id: string;
  role: string;
  content: string;
  turn_index: number;
  citations: AnswerCitationRecord[];
  scope: KBScopeRecord | null;
  sources: AnswerSourceRecord[];
  execution: AnswerExecutionRecord | null;
  retrieval_trace: RetrievalTraceRecord | null;
  highlighted_node_ids: string[];
  highlighted_edge_ids: string[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionDetailRecord {
  session: ChatSessionRecord;
  messages: ChatMessageRecord[];
}

export interface RecordSearchItemRecord {
  paragraph_id: string;
  source_id: string;
  source_name: string;
  worksheet_name: string;
  row_index: number;
  content: string;
  matched_cells: string[];
  score: number;
  metadata: Record<string, unknown>;
}

export interface EntitySearchItemRecord {
  id: string;
  display_name: string;
  description: string | null;
  appearance_count: number;
  metadata: Record<string, unknown>;
  paragraph_ids: string[];
}

export interface RelationSearchItemRecord {
  id: string;
  subject_id: string;
  subject_name: string;
  predicate: string;
  object_id: string;
  object_name: string;
  confidence: number;
  source_paragraph_id: string | null;
  metadata: Record<string, unknown>;
}

export interface SourceSearchItemRecord {
  id: string;
  name: string;
  source_kind: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  paragraph_count: number;
}

export interface SourceRecord {
  id: string;
  name: string;
  source_kind: string;
  input_mode: string;
  file_type: string | null;
  storage_path: string | null;
  strategy: string;
  status: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  active_version_id?: string | null;
  active_version_number?: number | null;
  version_count?: number;
}

export interface SourceVersionRecord {
  id: string;
  source_id: string;
  version_number: number;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  activated_at?: string | null;
  updated_at: string;
}

export interface SourceDetailRecord {
  source: SourceRecord;
  paragraph_count: number;
  entity_count: number;
  relation_count: number;
  selected_version?: SourceVersionRecord | null;
  versions: SourceVersionRecord[];
}

export interface WorksheetSummaryRecord {
  worksheet_key: string;
  worksheet_name: string;
  row_count: number;
  headers: string[];
  column_keys: string[];
}

export interface WorksheetPreviewPageItemRecord {
  paragraph_id: string | null;
  row_index: number;
  record_key: string | null;
  cells: Record<string, string>;
}

export interface WorksheetPreviewRecord {
  source_id: string;
  version_id: string | null;
  worksheet_key: string;
  worksheet_name: string;
  headers: string[];
  column_keys: string[];
  items: WorksheetPreviewPageItemRecord[];
  render_kind: 'worksheet_preview';
  rendered_html: string | null;
  render_metadata: Record<string, unknown>;
  page: number;
  page_size: number;
  total_rows: number;
  has_prev: boolean;
  has_next: boolean;
  row_range_start: number;
  row_range_end: number;
  anchor_row_index: number | null;
  highlighted_row_indexes: number[];
  highlighted_columns: string[];
}

export type ModelProvider = 'openai' | 'openrouter' | 'siliconflow' | 'custom';

export interface ModelConfigurationRecord {
  provider: ModelProvider | string;
  base_url: string;
  llm_model: string;
  embedding_model: string;
  has_api_key: boolean;
  api_key_preview: string | null;
  api_key_source: string;
  reindex_required: boolean;
  notice: string | null;
}

export interface ModelConfigurationDraft {
  provider: ModelProvider | string;
  base_url: string;
  llm_model: string;
  embedding_model: string;
  api_key: string;
  clear_api_key: boolean;
}

export interface ModelConfigurationTestRecord {
  provider: ModelProvider | string;
  base_url: string;
  llm_model: string;
  embedding_model: string;
  llm_ok: boolean;
  embedding_ok: boolean;
  message: string;
}

export interface ParagraphRecord {
  id: string;
  source_id: string;
  version_id: string;
  position: number;
  content: string;
  knowledge_type: string;
  token_count: number;
  vector_state: string;
  metadata: Record<string, unknown>;
  render_kind: ParagraphRenderKind;
  rendered_html: string | null;
  render_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type WorkspaceTab = 'chat' | 'import' | 'graph';
export type ImportMode = 'upload' | 'paste' | 'scan' | 'openie' | 'convert';
export type QueryMode = 'answer' | 'record' | 'entity' | 'relation' | 'source';
export type GraphViewportMode = 'fit-all' | 'focus-selection';
export type GraphViewportAction =
  | 'fit-all'
  | 'focus-selection'
  | 'zoom-in'
  | 'zoom-out'
  | 'relayout';
export type GraphDrawerMode = 'filters' | 'create-node' | 'relation' | 'inspector' | null;
export type GraphDataView = 'semantic' | 'evidence' | 'structure';
export type GraphLayerMode = GraphDataView;
export type GraphViewMode = 'global' | 'local';
export type GraphFocusReason = 'entity' | 'relation' | 'source' | 'paragraph' | 'citation';
export type GraphViewIntent = 'overview' | 'reading';

export interface LocalGraphState {
  anchor_node_id: string | null;
  depth: number;
}

export interface GraphViewportRequest {
  id: number;
  type: GraphViewportAction;
  mode: GraphViewportMode;
  reason: 'initial-load' | 'user' | 'mode-change' | 'focus-command' | 'refresh';
}

export interface GraphProjectionSummary {
  scope_node_count: number;
  scope_edge_count: number;
  visible_node_count: number;
  visible_edge_count: number;
  visible_entity_count: number;
  visible_semantic_edge_count: number;
  visible_source_anchor_count: number;
  visible_provenance_edge_count: number;
  focus_component_count: number;
  hidden_component_count: number;
}

export interface GraphReadingLens {
  mode: GraphViewIntent;
  anchor_node_ids: string[];
  anchor_edge_ids: string[];
  context_node_ids: string[];
  context_edge_ids: string[];
}

export interface GraphFocusCommand {
  id: number;
  target: 'graph' | 'source-browser';
  reason: GraphFocusReason;
  graph_data_view: GraphDataView;
  view_intent: GraphViewIntent;
  graph_view_mode: GraphViewMode;
  selected_node_id: string | null;
  selected_edge_id: string | null;
  highlighted_node_ids: string[];
  highlighted_edge_ids: string[];
  source_ids: string[];
  layer_modes: GraphLayerMode[];
  viewport_action: GraphViewportAction;
}
