import { describe, expect, it } from 'vitest';

import { DEFAULT_SCOPE } from '../../../shared/api/kb';
import { EMPTY_GRAPH, build_graph_query_plan } from './graphQueryPlan';

describe('graph query planning', () => {
  it('does not call the graph API for evidence view without an anchor', () => {
    const plan = build_graph_query_plan({
      density: 80,
      scope: DEFAULT_SCOPE,
      selected: null,
      view: 'evidence',
    });

    expect(plan.kind).toBe('local-empty');
    if (plan.kind !== 'local-empty') {
      throw new Error('Expected a local-empty graph query plan.');
    }
    expect(plan.graph).toEqual({ ...EMPTY_GRAPH, view: 'evidence' });
    expect(plan.message).toBe('证据图需要先选择一个节点或关系。');
  });

  it('passes selected nodes and edges as evidence anchors', () => {
    const node_plan = build_graph_query_plan({
      density: 80,
      scope: DEFAULT_SCOPE,
      selected: { type: 'node', id: 'entity:1' },
      view: 'evidence',
    });
    const edge_plan = build_graph_query_plan({
      density: 80,
      scope: DEFAULT_SCOPE,
      selected: { type: 'edge', id: 'relation:9' },
      view: 'evidence',
    });

    expect(node_plan.kind).toBe('remote');
    expect(edge_plan.kind).toBe('remote');
    if (node_plan.kind !== 'remote' || edge_plan.kind !== 'remote') {
      throw new Error('Expected selected evidence anchors to produce remote graph query plans.');
    }
    expect(node_plan.options.anchor_node_ids).toEqual(['entity:1']);
    expect(node_plan.options.anchor_edge_ids).toEqual([]);
    expect(edge_plan.options.anchor_node_ids).toEqual([]);
    expect(edge_plan.options.anchor_edge_ids).toEqual(['relation:9']);
  });
});
