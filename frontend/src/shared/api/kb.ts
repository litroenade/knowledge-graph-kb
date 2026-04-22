import type {
  GraphDataView,
  GraphEdgeDetail,
  GraphNodeDetail,
  KBScope,
  KnowledgeGraph,
  SourceItem,
  SystemReady,
} from '../types/kb';
import { request_json } from './http';

export const DEFAULT_SCOPE: KBScope = {
  mode: 'all',
  source_ids: [],
  version_mode: 'latest',
  version_id: null,
  excluded_source_ids: [],
};

export function fetch_ready(): Promise<SystemReady> {
  return request_json<SystemReady>('/api/ready');
}

export function fetch_sources(): Promise<SourceItem[]> {
  return request_json<SourceItem[]>('/api/kb/sources?limit=500');
}

export function fetch_graph(options: {
  scope: KBScope;
  view: GraphDataView;
  density: number;
  anchor_node_ids?: string[];
  anchor_edge_ids?: string[];
}): Promise<KnowledgeGraph> {
  return request_json<KnowledgeGraph>('/api/kb/graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: options.scope,
      view: options.view,
      density: options.density,
      anchor_node_ids: options.anchor_node_ids ?? [],
      anchor_edge_ids: options.anchor_edge_ids ?? [],
    }),
  });
}

export function fetch_node_detail(node_id: string): Promise<GraphNodeDetail> {
  return request_json<GraphNodeDetail>(`/api/kb/graph/nodes/${encodeURIComponent(node_id)}`);
}

export function fetch_edge_detail(edge_id: string): Promise<GraphEdgeDetail> {
  return request_json<GraphEdgeDetail>(`/api/kb/graph/edges/${encodeURIComponent(edge_id)}`);
}
