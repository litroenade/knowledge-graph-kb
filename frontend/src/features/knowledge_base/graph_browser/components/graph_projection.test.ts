import { describe, expect, it } from 'vitest';

import type {
  KnowledgeGraphEdgeRecord,
  KnowledgeGraphNodeRecord,
  KnowledgeGraphRecord,
  LocalGraphState,
} from '../../shared/types/knowledge_base_types';
import { project_graph } from './graph_projection';

const DEFAULT_LOCAL_GRAPH_STATE: LocalGraphState = {
  anchor_node_id: null,
  depth: 1,
};

function create_entity_node(id: string, label: string): KnowledgeGraphNodeRecord {
  return {
    id,
    type: 'entity',
    label,
    display_label: label,
    kind_label: '实体',
    source_name: '孙子兵法.txt',
    evidence_count: 1,
    size: 10,
    score: 1,
    family: 'semantic',
    metadata: {},
  };
}

function create_source_node(id: string, label: string): KnowledgeGraphNodeRecord {
  return {
    id,
    type: 'source',
    label,
    display_label: label,
    kind_label: '来源',
    source_name: label,
    evidence_count: null,
    size: 10,
    score: null,
    family: 'semantic',
    metadata: {},
  };
}

function create_edge(
  id: string,
  source: string,
  target: string,
  type: string,
  label: string,
): KnowledgeGraphEdgeRecord {
  return {
    id,
    source,
    target,
    type,
    label,
    display_label: label,
    relation_kind_label: label,
    source_name: '孙子兵法.txt',
    evidence_paragraph_id: null,
    is_structural: false,
    family: 'semantic',
    weight: 1,
    metadata: {},
  };
}

function project_semantic_graph(
  graph: KnowledgeGraphRecord,
  overrides?: Partial<{
    selected_node_id: string | null;
    selected_edge_id: string | null;
    highlighted_node_ids: string[];
    highlighted_edge_ids: string[];
    reading_mode: 'overview' | 'reading';
  }>,
) {
  return project_graph(graph, {
    active_layer_modes: ['semantic'],
    reading_mode: overrides?.reading_mode ?? 'overview',
    selected_node_id: overrides?.selected_node_id ?? null,
    selected_edge_id: overrides?.selected_edge_id ?? null,
    highlighted_node_ids: overrides?.highlighted_node_ids ?? [],
    highlighted_edge_ids: overrides?.highlighted_edge_ids ?? [],
    graph_view_mode: 'global',
    local_graph_state: DEFAULT_LOCAL_GRAPH_STATE,
  });
}

describe('project_graph global semantic overview', () => {
  const graph: KnowledgeGraphRecord = {
    view: 'semantic',
    nodes: [
      create_entity_node('entity:e1', '九地第十一'),
      create_entity_node('entity:e2', '将军'),
      create_entity_node('entity:e3', '支形'),
      create_source_node('source:s1', '孙子兵法.txt'),
    ],
    edges: [
      create_edge('relation:r1', 'entity:e1', 'entity:e2', 'relation', '关联'),
      create_edge('provenance:p1', 'source:s1', 'entity:e1', 'provenance', '来源'),
      create_edge('provenance:p2', 'source:s1', 'entity:e2', 'provenance', '来源'),
      create_edge('provenance:p3', 'source:s1', 'entity:e3', 'provenance', '来源'),
    ],
  };

  it('aggregates raw provenance into bundles in overview', () => {
    const projected = project_semantic_graph(graph);

    expect(projected.edges.filter((edge) => edge.aggregate_kind === 'source_bundle')).toHaveLength(2);
    expect(
      projected.edges.filter((edge) => edge.type === 'provenance' && edge.aggregate_kind === 'none'),
    ).toHaveLength(0);
    expect(projected.summary.visible_source_anchor_count).toBe(1);
    expect(projected.summary.visible_provenance_edge_count).toBe(2);
    expect(projected.summary.visible_semantic_edge_count).toBe(1);
  });

  it('expands only the selected source raw provenance edges', () => {
    const projected = project_semantic_graph(graph, { selected_node_id: 'source:s1' });

    expect(projected.edges.filter((edge) => edge.aggregate_kind === 'source_bundle')).toHaveLength(0);
    expect(
      projected.edges.filter((edge) => edge.type === 'provenance' && edge.aggregate_kind === 'none'),
    ).toHaveLength(3);
    expect(projected.summary.visible_provenance_edge_count).toBe(3);
  });

  it('expands only the selected entity provenance and keeps the rest bundled', () => {
    const projected = project_semantic_graph(graph, { selected_node_id: 'entity:e1' });

    expect(
      projected.edges.filter((edge) => edge.type === 'provenance' && edge.aggregate_kind === 'none'),
    ).toHaveLength(1);
    expect(projected.edges.filter((edge) => edge.aggregate_kind === 'source_bundle')).toHaveLength(2);
    expect(projected.summary.visible_provenance_edge_count).toBe(3);
  });
});
