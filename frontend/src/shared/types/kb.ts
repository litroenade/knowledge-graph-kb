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
  metadata: Record<string, unknown>;
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
  metadata: Record<string, unknown>;
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
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  active_version_id: string | null;
  active_version_number: number | null;
  version_count: number;
}

export interface GraphNodeDetail {
  node: KnowledgeGraphNode;
  source: Record<string, unknown> | null;
  paragraphs: Record<string, unknown>[];
  relations: Record<string, unknown>[];
}

export interface GraphEdgeDetail {
  edge: KnowledgeGraphEdge;
  source: Record<string, unknown> | null;
  paragraph: Record<string, unknown> | null;
}

export interface SystemReadyCheck {
  name: string;
  ok: boolean;
  message: string;
  details: Record<string, unknown>;
}

export interface SystemReady {
  status: string;
  checks: SystemReadyCheck[];
}
