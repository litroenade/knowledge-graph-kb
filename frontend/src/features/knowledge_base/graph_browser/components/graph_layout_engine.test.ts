import { describe, expect, it } from 'vitest';

import type {
  KnowledgeGraphEdgeRecord,
  KnowledgeGraphNodeRecord,
  KnowledgeGraphRecord,
  LocalGraphState,
} from '../../shared/types/knowledge_base_types';
import { build_graph_layout } from './graph_layout_engine';
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

describe('build_graph_layout source anchors', () => {
  it('places source anchors outside the semantic cluster in global overview', () => {
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
        create_edge('relation:r2', 'entity:e2', 'entity:e3', 'relation', '关联'),
        create_edge('provenance:p1', 'source:s1', 'entity:e1', 'provenance', '来源'),
        create_edge('provenance:p2', 'source:s1', 'entity:e2', 'provenance', '来源'),
        create_edge('provenance:p3', 'source:s1', 'entity:e3', 'provenance', '来源'),
      ],
    };

    const projected = project_graph(graph, {
      active_layer_modes: ['semantic'],
      reading_mode: 'overview',
      selected_node_id: null,
      selected_edge_id: null,
      highlighted_node_ids: [],
      highlighted_edge_ids: [],
      graph_view_mode: 'global',
      local_graph_state: DEFAULT_LOCAL_GRAPH_STATE,
    });
    const positions = build_graph_layout(projected.nodes, projected.edges, undefined, {
      reading_lens: projected.reading_lens,
      graph_view_mode: 'global',
    });

    const semantic_points = projected.nodes
      .filter((node) => node.type === 'entity')
      .map((node) => positions.get(node.id))
      .filter(Boolean) as Array<{ x: number; y: number }>;
    const source_point = positions.get('source:s1');

    expect(source_point).toBeDefined();

    const semantic_center = semantic_points.reduce(
      (result, point) => ({
        x: result.x + point.x / semantic_points.length,
        y: result.y + point.y / semantic_points.length,
      }),
      { x: 0, y: 0 },
    );
    const source_distance = Math.hypot(source_point!.x - semantic_center.x, source_point!.y - semantic_center.y);
    const max_semantic_distance = Math.max(
      ...semantic_points.map((point) => Math.hypot(point.x - semantic_center.x, point.y - semantic_center.y)),
    );

    expect(source_distance).toBeGreaterThan(max_semantic_distance + 40);
  });
});
