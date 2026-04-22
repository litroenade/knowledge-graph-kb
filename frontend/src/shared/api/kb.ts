import type {
  ChatSessionDetailResponse,
  ChatSessionItem,
  EntitySearchItem,
  GraphDataView,
  GraphEdgeDetail,
  GraphNodeDetail,
  ImportJobChunkItem,
  ImportJobItem,
  ImportJobResponse,
  JsonRecord,
  KBScope,
  KnowledgeGraph,
  KnowledgeGraphNode,
  ManualRelationItem,
  ModelConfigResponse,
  ModelConfigTestResponse,
  ParagraphItem,
  RecordSearchItem,
  RelationSearchItem,
  SourceDetail,
  SourceItem,
  SourceSearchItem,
  StatusResponse,
  SystemReady,
  WorksheetItem,
  WorksheetPreviewResponse,
} from '../types/kb';
import { request_json } from './http';

export const DEFAULT_SCOPE: KBScope = {
  mode: 'all',
  source_ids: [],
  version_mode: 'latest',
  version_id: null,
  excluded_source_ids: [],
};

export interface FetchSourcesOptions {
  keyword?: string;
  limit?: number;
  scope?: KBScope;
}

export interface FetchGraphOptions {
  scope: KBScope;
  view: GraphDataView;
  density: number;
  anchor_node_ids?: string[];
  anchor_edge_ids?: string[];
}

function json_request<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', payload?: unknown): Promise<T> {
  return request_json<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

function append_query(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function fetch_ready(): Promise<SystemReady> {
  return request_json<SystemReady>('/api/system/ready');
}

export function fetch_sources(options: FetchSourcesOptions = {}): Promise<SourceItem[]> {
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? 500));
  if (options.keyword?.trim()) {
    params.set('keyword', options.keyword.trim());
  }
  if (options.scope) {
    params.set('mode', options.scope.mode);
    params.set('version_mode', options.scope.version_mode);
    if (options.scope.version_id) {
      params.set('version_id', options.scope.version_id);
    }
    options.scope.source_ids.forEach((id) => params.append('source_ids', id));
    options.scope.excluded_source_ids.forEach((id) => params.append('excluded_source_ids', id));
  }
  return request_json<SourceItem[]>(append_query('/api/kb/sources', params));
}

export function fetch_graph(options: FetchGraphOptions): Promise<KnowledgeGraph> {
  return json_request<KnowledgeGraph>('/api/kb/graph', 'POST', {
    scope: options.scope,
    view: options.view,
    density: options.density,
    anchor_node_ids: options.anchor_node_ids ?? [],
    anchor_edge_ids: options.anchor_edge_ids ?? [],
  });
}

export function fetch_node_detail(node_id: string): Promise<GraphNodeDetail> {
  return request_json<GraphNodeDetail>(`/api/kb/graph/nodes/${encodeURIComponent(node_id)}`);
}

export function fetch_edge_detail(edge_id: string): Promise<GraphEdgeDetail> {
  return request_json<GraphEdgeDetail>(`/api/kb/graph/edges/${encodeURIComponent(edge_id)}`);
}

export function create_graph_node(payload: {
  label: string;
  description: string;
  source_id?: string | null;
  version_id?: string | null;
  metadata?: JsonRecord;
}): Promise<KnowledgeGraphNode> {
  return json_request<KnowledgeGraphNode>('/api/kb/graph/nodes', 'POST', payload);
}

export function rename_graph_node(node_id: string, label: string): Promise<StatusResponse> {
  return json_request<StatusResponse>(`/api/kb/graph/nodes/${encodeURIComponent(node_id)}`, 'PUT', { label });
}

export function delete_graph_node(node_id: string): Promise<StatusResponse> {
  return json_request<StatusResponse>(`/api/kb/graph/nodes/${encodeURIComponent(node_id)}`, 'DELETE');
}

export function delete_graph_edge(edge_id: string): Promise<StatusResponse> {
  return json_request<StatusResponse>(`/api/kb/graph/edges/${encodeURIComponent(edge_id)}`, 'DELETE');
}

export function fetch_manual_relations(): Promise<ManualRelationItem[]> {
  return request_json<ManualRelationItem[]>('/api/kb/graph/manual-relations');
}

export function create_manual_relation(payload: {
  subject_node_id: string;
  predicate: string;
  object_node_id: string;
  weight: number;
  metadata?: JsonRecord;
}): Promise<ManualRelationItem> {
  return json_request<ManualRelationItem>('/api/kb/graph/manual-relations', 'POST', payload);
}

export function delete_manual_relation(relation_id: string): Promise<StatusResponse> {
  return json_request<StatusResponse>(`/api/kb/graph/manual-relations/${encodeURIComponent(relation_id)}`, 'DELETE');
}

export function fetch_source_detail(source_id: string, version_id?: string | null): Promise<SourceDetail> {
  const params = new URLSearchParams();
  if (version_id) {
    params.set('version_id', version_id);
  }
  return request_json<SourceDetail>(append_query(`/api/kb/sources/${encodeURIComponent(source_id)}`, params));
}

export function fetch_source_paragraphs(source_id: string, version_id?: string | null): Promise<ParagraphItem[]> {
  const params = new URLSearchParams();
  if (version_id) {
    params.set('version_id', version_id);
  }
  return request_json<{ items: ParagraphItem[] }>(
    append_query(`/api/kb/sources/${encodeURIComponent(source_id)}/paragraphs`, params),
  ).then((response) => response.items);
}

export function fetch_source_worksheets(source_id: string, version_id?: string | null): Promise<WorksheetItem[]> {
  const params = new URLSearchParams();
  if (version_id) {
    params.set('version_id', version_id);
  }
  return request_json<{ items: WorksheetItem[] }>(
    append_query(`/api/kb/sources/${encodeURIComponent(source_id)}/worksheets`, params),
  ).then((response) => response.items);
}

export function fetch_worksheet_preview(options: {
  source_id: string;
  worksheet_key: string;
  version_id?: string | null;
  page: number;
  page_size: number;
}): Promise<WorksheetPreviewResponse> {
  const params = new URLSearchParams();
  params.set('page', String(options.page));
  params.set('page_size', String(options.page_size));
  if (options.version_id) {
    params.set('version_id', options.version_id);
  }
  return request_json<WorksheetPreviewResponse>(
    append_query(
      `/api/kb/sources/${encodeURIComponent(options.source_id)}/worksheets/${encodeURIComponent(options.worksheet_key)}/preview`,
      params,
    ),
  );
}

export function fetch_import_jobs(limit = 50): Promise<ImportJobItem[]> {
  return request_json<ImportJobItem[]>(`/api/kb/imports/jobs?limit=${encodeURIComponent(String(limit))}`);
}

export function fetch_import_job(job_id: string): Promise<ImportJobItem> {
  return request_json<ImportJobItem>(`/api/kb/imports/jobs/${encodeURIComponent(job_id)}`);
}

export function fetch_import_chunks(job_id: string, file_id: string): Promise<ImportJobChunkItem[]> {
  return request_json<ImportJobChunkItem[]>(
    `/api/kb/imports/jobs/${encodeURIComponent(job_id)}/files/${encodeURIComponent(file_id)}/chunks`,
  );
}

export function paste_import(payload: {
  title: string;
  content: string;
  strategy: string;
  metadata?: JsonRecord;
}): Promise<ImportJobResponse> {
  return json_request<ImportJobResponse>('/api/kb/imports/paste', 'POST', payload);
}

export function scan_import(payload: {
  root_path: string;
  glob_pattern: string;
  strategy: string;
}): Promise<ImportJobResponse> {
  return json_request<ImportJobResponse>('/api/kb/imports/scan', 'POST', payload);
}

export function upload_import_files(files: File[], strategy: string): Promise<ImportJobResponse> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  return request_json<ImportJobResponse>(`/api/kb/imports/uploads?strategy=${encodeURIComponent(strategy)}`, {
    method: 'POST',
    body: form,
  });
}

export function cancel_import_job(job_id: string): Promise<ImportJobItem> {
  return json_request<ImportJobItem>(`/api/kb/imports/jobs/${encodeURIComponent(job_id)}/cancel`, 'POST');
}

export function retry_import_job(job_id: string): Promise<ImportJobResponse> {
  return json_request<ImportJobResponse>(`/api/kb/imports/jobs/${encodeURIComponent(job_id)}/retry`, 'POST');
}

export function fetch_model_config(): Promise<ModelConfigResponse> {
  return request_json<ModelConfigResponse>('/api/kb/config/model');
}

export function update_model_config(payload: {
  provider: string;
  base_url: string;
  llm_model: string;
  embedding_model: string;
  api_key?: string | null;
  clear_api_key: boolean;
}): Promise<ModelConfigResponse> {
  return json_request<ModelConfigResponse>('/api/kb/config/model', 'PUT', payload);
}

export function test_model_config(payload: {
  provider: string;
  base_url: string;
  llm_model: string;
  embedding_model: string;
  api_key?: string | null;
  use_saved_api_key: boolean;
}): Promise<ModelConfigTestResponse> {
  return json_request<ModelConfigTestResponse>('/api/kb/config/model/test', 'POST', payload);
}

export function fetch_chat_sessions(limit = 50): Promise<ChatSessionItem[]> {
  return request_json<ChatSessionItem[]>(`/api/kb/chat/sessions?limit=${encodeURIComponent(String(limit))}`);
}

export function create_chat_session(title: string): Promise<ChatSessionItem> {
  return json_request<ChatSessionItem>('/api/kb/chat/sessions', 'POST', { title, metadata: {} });
}

export function fetch_chat_session(session_id: string): Promise<ChatSessionDetailResponse> {
  return request_json<ChatSessionDetailResponse>(`/api/kb/chat/sessions/${encodeURIComponent(session_id)}`);
}

export function send_chat_message(payload: {
  session_id: string;
  content: string;
  scope: KBScope;
  top_k?: number;
}): Promise<ChatSessionDetailResponse> {
  return json_request<ChatSessionDetailResponse>(
    `/api/kb/chat/sessions/${encodeURIComponent(payload.session_id)}/messages`,
    'POST',
    {
      content: payload.content,
      scope: payload.scope,
      top_k: payload.top_k,
    },
  );
}

export function search_records(query: string, scope: KBScope, limit = 20): Promise<RecordSearchItem[]> {
  return json_request<{ items: RecordSearchItem[] }>('/api/kb/search/records', 'POST', {
    query,
    scope,
    limit,
    worksheet_names: [],
    filters: {},
  }).then((response) => response.items);
}

export function search_entities(query: string, scope: KBScope, limit = 20): Promise<EntitySearchItem[]> {
  return json_request<{ items: EntitySearchItem[] }>('/api/kb/search/entities', 'POST', { query, scope, limit })
    .then((response) => response.items);
}

export function search_relations(query: string, scope: KBScope, limit = 20): Promise<RelationSearchItem[]> {
  return json_request<{ items: RelationSearchItem[] }>('/api/kb/search/relations', 'POST', { query, scope, limit })
    .then((response) => response.items);
}

export function search_sources(query: string, scope: KBScope, limit = 20): Promise<SourceSearchItem[]> {
  return json_request<{ items: SourceSearchItem[] }>('/api/kb/search/sources', 'POST', { query, scope, limit })
    .then((response) => response.items);
}
