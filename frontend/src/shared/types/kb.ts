export type JsonRecord = Record<string, unknown>;

export type GraphDataView = 'semantic' | 'structure' | 'evidence';
export type GraphNodeFamily = GraphDataView | null;
export type ScopeMode = 'all' | 'single' | 'subset';
export type VersionMode = 'latest' | 'specific';

export interface KBScope {
  mode: ScopeMode;
  source_ids: string[];
  version_mode: VersionMode;
  version_id: string | null;
  excluded_source_ids: string[];
}

export interface KnowledgeGraphNode {
  id: string;
  type: string;
  label: string;
  size: number;
  score: number | null;
  display_label: string | null;
  kind_label: string | null;
  source_name: string | null;
  evidence_count: number | null;
  family: GraphNodeFamily;
  metadata: JsonRecord;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  weight: number;
  display_label: string | null;
  relation_kind_label: string | null;
  source_name: string | null;
  evidence_paragraph_id: string | null;
  is_structural: boolean | null;
  family: GraphNodeFamily;
  metadata: JsonRecord;
}

export interface KnowledgeGraph {
  view: GraphDataView;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface SourceItem {
  id: string;
  name: string;
  source_kind: string;
  input_mode: string;
  file_type: string | null;
  storage_path: string | null;
  strategy: string;
  status: string;
  summary: string | null;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
  active_version_id: string | null;
  active_version_number: number | null;
  version_count: number;
}

export interface SourceVersionItem {
  id: string;
  source_id: string;
  version_number: number;
  status: string;
  metadata: JsonRecord;
  created_at: string;
  activated_at: string | null;
  updated_at: string;
}

export interface SourceDetail {
  source: SourceItem;
  paragraph_count: number;
  entity_count: number;
  relation_count: number;
  selected_version: SourceVersionItem | null;
  versions: SourceVersionItem[];
}

export type ParagraphRenderKind = 'text' | 'row_record' | 'sheet_summary' | 'worksheet_preview';

export interface ParagraphItem {
  id: string;
  source_id: string;
  version_id: string;
  position: number;
  content: string;
  knowledge_type: string;
  token_count: number;
  vector_state: string;
  metadata: JsonRecord;
  render_kind: ParagraphRenderKind;
  rendered_html: string | null;
  render_metadata: JsonRecord;
  created_at: string;
  updated_at: string;
}

export interface SourceParagraphsResponse {
  items: ParagraphItem[];
}

export interface WorksheetItem {
  worksheet_key: string;
  worksheet_name: string;
  row_count: number;
  headers: string[];
  column_keys: string[];
}

export interface WorksheetListResponse {
  items: WorksheetItem[];
}

export interface WorksheetPreviewPageItem {
  paragraph_id: string | null;
  row_index: number;
  record_key: string | null;
  cells: Record<string, string>;
}

export interface WorksheetPreviewResponse {
  source_id: string;
  version_id: string | null;
  worksheet_key: string;
  worksheet_name: string;
  headers: string[];
  column_keys: string[];
  items: WorksheetPreviewPageItem[];
  render_kind: 'worksheet_preview';
  rendered_html: string | null;
  render_metadata: JsonRecord;
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

export interface GraphNodeDetail {
  node: KnowledgeGraphNode;
  source: JsonRecord | null;
  paragraphs: JsonRecord[];
  relations: JsonRecord[];
}

export interface GraphEdgeDetail {
  edge: KnowledgeGraphEdge;
  source: JsonRecord | null;
  paragraph: JsonRecord | null;
}

export interface ManualRelationItem {
  id: string;
  subject_node_id: string;
  predicate: string;
  object_node_id: string;
  weight: number;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
}

export interface StatusResponse {
  status: string;
}

export interface SystemReadyCheck {
  name: string;
  ok: boolean;
  message: string;
  details: JsonRecord;
}

export interface SystemReady {
  status: string;
  checks: SystemReadyCheck[];
}

export interface ModelConfigResponse {
  llm_provider: string;
  llm_base_url: string;
  llm_model: string;
  llm_has_api_key: boolean;
  llm_api_key_preview: string | null;
  llm_api_key_source: string;
  embedding_provider: string;
  embedding_base_url: string;
  embedding_model: string;
  embedding_has_api_key: boolean;
  embedding_api_key_preview: string | null;
  embedding_api_key_source: string;
  reindex_required: boolean;
  notice: string | null;
}

export interface ModelConfigTestResponse {
  llm_provider: string;
  llm_base_url: string;
  llm_model: string;
  embedding_provider: string;
  embedding_base_url: string;
  embedding_model: string;
  llm_ok: boolean;
  embedding_ok: boolean;
  message: string;
}

export interface ImportJobChunkItem {
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
  metadata: JsonRecord;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportJobFileItem {
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
  metadata: JsonRecord;
  error: string | null;
  failure_stage: string | null;
  step_durations: Record<string, number>;
  stats: JsonRecord;
  created_at: string;
  updated_at: string;
  chunks: ImportJobChunkItem[];
}

export interface ImportJobItem {
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
  params: JsonRecord;
  failure_stage: string | null;
  step_durations: Record<string, number>;
  retry_of: string | null;
  stats: JsonRecord;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  files: ImportJobFileItem[];
}

export interface ImportJobResponse {
  job: ImportJobItem;
}

export interface AnswerSourceItem {
  source_id: string;
  version_id: string;
  source_name: string;
  file_path: string | null;
  citation_count: number;
  snippet: string | null;
}

export interface CitationItem {
  paragraph_id: string;
  chunk_id: string | null;
  source_id: string;
  version_id: string | null;
  source_name: string;
  file_path: string | null;
  excerpt: string;
  snippet: string | null;
  score: number;
  match_reason: string | null;
  matched_fields: string[];
  source_kind: string | null;
  worksheet_name: string | null;
  worksheet_key: string | null;
  row_index: number | null;
  anchor_row_index: number | null;
  page_number: number | null;
  paragraph_position: number | null;
  winning_lane: string | null;
  start_offset: number | null;
  end_offset: number | null;
  anchor_node_ids: string[];
  preferred_anchor_node_id: string | null;
  render_kind: ParagraphRenderKind;
  rendered_html: string | null;
  render_metadata: JsonRecord;
}

export interface AnswerExecutionItem {
  status: string;
  retrieval_mode: string;
  model_invoked: boolean;
  matched_paragraph_count: number;
  message: string;
}

export interface RetrievalTraceLaneItem {
  executed: boolean;
  skipped_reason: string | null;
  hit_count: number;
  latency_ms: number;
  top_paragraph_ids: string[];
}

export interface RetrievalTraceItem {
  structured: RetrievalTraceLaneItem;
  vector: RetrievalTraceLaneItem;
  fusion: RetrievalTraceLaneItem;
  ppr: RetrievalTraceLaneItem;
  total_ms: number;
}

export interface ChatSessionItem {
  id: string;
  title: string;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface ChatMessageItem {
  id: string;
  session_id: string;
  role: string;
  content: string;
  turn_index: number;
  citations: CitationItem[];
  scope: KBScope | null;
  sources: AnswerSourceItem[];
  execution: AnswerExecutionItem | null;
  retrieval_trace: RetrievalTraceItem | null;
  highlighted_node_ids: string[];
  highlighted_edge_ids: string[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionDetailResponse {
  session: ChatSessionItem;
  messages: ChatMessageItem[];
}

export interface RecordSearchItem {
  paragraph_id: string;
  source_id: string;
  source_name: string;
  worksheet_name: string;
  row_index: number;
  content: string;
  matched_cells: string[];
  score: number;
  metadata: JsonRecord;
}

export interface EntitySearchItem {
  id: string;
  display_name: string;
  description: string | null;
  appearance_count: number;
  metadata: JsonRecord;
  paragraph_ids: string[];
}

export interface RelationSearchItem {
  id: string;
  subject_id: string;
  subject_name: string;
  predicate: string;
  object_id: string;
  object_name: string;
  confidence: number;
  source_paragraph_id: string | null;
  metadata: JsonRecord;
}

export interface SourceSearchItem {
  id: string;
  name: string;
  source_kind: string;
  summary: string | null;
  metadata: JsonRecord;
  paragraph_count: number;
}
