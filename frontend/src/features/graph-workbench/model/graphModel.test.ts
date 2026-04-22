import { describe, expect, it } from 'vitest';

import type { KnowledgeGraph } from '../../../shared/types/kb';
import { project_graph, resolve_neighborhood } from './graphModel';

const graph: KnowledgeGraph = {
  view: 'semantic',
  nodes: [
    node('a', 'Alpha'),
    node('b', 'Beta'),
    node('c', 'Gamma'),
    node('d', 'Delta'),
  ],
  edges: [
    edge('ab', 'a', 'b'),
    edge('bc', 'b', 'c'),
    edge('cd', 'c', 'd'),
  ],
};

describe('graph model projection', () => {
  it('keeps first and second degree neighbors around a selected node', () => {
    const projected = project_graph(graph, {
      graph_mode: 'global',
      local_depth: 1,
      density: 100,
      view: 'semantic',
      search: '',
      selected_source_ids: [],
      selected: { type: 'node', id: 'b' },
    });

    const neighborhood = resolve_neighborhood(projected.edges, { type: 'node', id: 'b' });

    expect([...neighborhood.primary_node_ids].sort()).toEqual(['a', 'b', 'c']);
    expect([...neighborhood.secondary_node_ids]).toEqual(['d']);
    expect([...neighborhood.edge_ids].sort()).toEqual(['ab', 'bc', 'cd']);
  });

  it('limits local graph depth to the selected focus', () => {
    const projected = project_graph(graph, {
      graph_mode: 'local',
      local_depth: 1,
      density: 100,
      view: 'semantic',
      search: '',
      selected_source_ids: [],
      selected: { type: 'node', id: 'b' },
    });

    expect(projected.nodes.map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
    expect(projected.edges.map((item) => item.id).sort()).toEqual(['ab', 'bc']);
  });
});

function node(id: string, label: string) {
  return {
    id,
    type: 'entity',
    label,
    size: 8,
    score: 1,
    display_label: label,
    kind_label: '实体',
    source_name: null,
    evidence_count: 1,
    family: 'semantic' as const,
    metadata: {},
  };
}

function edge(id: string, source: string, target: string) {
  return {
    id,
    source,
    target,
    type: 'relation',
    label: '关联',
    weight: 1,
    display_label: '关联',
    relation_kind_label: '关系',
    source_name: null,
    evidence_paragraph_id: null,
    is_structural: false,
    family: 'semantic' as const,
    metadata: {},
  };
}
