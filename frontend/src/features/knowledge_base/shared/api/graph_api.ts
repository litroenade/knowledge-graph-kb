/**
 * Graph-related API helpers.
 */

import type {
  GraphDataView,
  GraphEdgeDetailRecord,
  GraphNodeDetailRecord,
  KBScopeRecord,
  KnowledgeGraphNodeRecord,
  KnowledgeGraphRecord,
  ManualRelationRecord,
} from '../types/knowledge_base_types';
import { request_json } from './http_client';

interface GraphQueryOptions {
  scope: KBScopeRecord;
  view: GraphDataView;
  density?: number;
  anchor_node_ids?: string[];
  anchor_edge_ids?: string[];
}

export function fetch_graph(options: GraphQueryOptions): Promise<KnowledgeGraphRecord> {
  return request_json<KnowledgeGraphRecord>('/api/kb/graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: options.scope,
      view: options.view,
      density: options.density ?? 100,
      anchor_node_ids: options.anchor_node_ids ?? [],
      anchor_edge_ids: options.anchor_edge_ids ?? [],
    }),
  });
}

export function create_graph_node(payload: {
  label: string;
  description?: string;
  source_id?: string | null;
  version_id?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<KnowledgeGraphNodeRecord> {
  return request_json<KnowledgeGraphNodeRecord>('/api/kb/graph/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function get_graph_node_detail(
  node_id: string,
  version_id?: string | null,
): Promise<GraphNodeDetailRecord> {
  const suffix = version_id ? `?version_id=${encodeURIComponent(version_id)}` : '';
  return request_json<GraphNodeDetailRecord>(`/api/kb/graph/nodes/${encodeURIComponent(node_id)}${suffix}`);
}

export function get_graph_edge_detail(edge_id: string): Promise<GraphEdgeDetailRecord> {
  return request_json<GraphEdgeDetailRecord>(`/api/kb/graph/edges/${encodeURIComponent(edge_id)}`);
}

export function update_graph_node(node_id: string, payload: { label: string }): Promise<{ status: string }> {
  return request_json<{ status: string }>(`/api/kb/graph/nodes/${encodeURIComponent(node_id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function delete_graph_node(node_id: string): Promise<{ status: string }> {
  return request_json<{ status: string }>(`/api/kb/graph/nodes/${encodeURIComponent(node_id)}`, {
    method: 'DELETE',
  });
}

export function delete_graph_edge(edge_id: string): Promise<{ status: string }> {
  return request_json<{ status: string }>(`/api/kb/graph/edges/${encodeURIComponent(edge_id)}`, {
    method: 'DELETE',
  });
}

export function list_manual_relations(): Promise<ManualRelationRecord[]> {
  return request_json<ManualRelationRecord[]>('/api/kb/graph/manual-relations');
}

export function create_manual_relation(payload: {
  subject_node_id: string;
  predicate: string;
  object_node_id: string;
  weight: number;
  metadata?: Record<string, unknown>;
}): Promise<ManualRelationRecord> {
  return request_json<ManualRelationRecord>('/api/kb/graph/manual-relations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function delete_manual_relation(relation_id: string): Promise<{ status: string }> {
  return request_json<{ status: string }>(`/api/kb/graph/manual-relations/${relation_id}`, {
    method: 'DELETE',
  });
}
