import type {
  GraphProjectionSummary,
  GraphReadingLens,
  GraphLayerMode,
  KnowledgeGraphEdgeRecord,
  KnowledgeGraphNodeRecord,
} from '../../shared/types/knowledge_base_types';

export type GraphEdgeAggregateKind = 'none' | 'source_bundle';

export interface RenderNode extends KnowledgeGraphNodeRecord {
  display_label: string;
  short_label: string;
  kind_label: string;
  source_name: string | null;
  evidence_count: number | null;
  layer_mode: GraphLayerMode;
  is_structural: boolean;
  radius: number;
  color: number;
  searchable_text: string;
}

export interface RenderEdge extends KnowledgeGraphEdgeRecord {
  display_label: string;
  short_label: string;
  relation_kind_label: string;
  source_name: string | null;
  evidence_paragraph_id: string | null;
  layer_mode: GraphLayerMode;
  is_structural: boolean;
  color: number;
  aggregate_kind: GraphEdgeAggregateKind;
  related_node_ids: string[];
  related_edge_ids: string[];
  related_count: number;
}

export interface ProjectedGraphRecord {
  nodes: RenderNode[];
  edges: RenderEdge[];
  summary: GraphProjectionSummary;
  reading_lens: GraphReadingLens;
}

export interface GraphLayoutPoint {
  x: number;
  y: number;
}

export type GraphLayoutMap = Map<string, GraphLayoutPoint>;
