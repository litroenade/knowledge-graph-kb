import type { FetchGraphOptions } from '../../../shared/api/kb';
import type { GraphDataView, KBScope, KnowledgeGraph } from '../../../shared/types/kb';
import type { Selection } from './graphModel';

export const EMPTY_GRAPH: KnowledgeGraph = {
  view: 'semantic',
  nodes: [],
  edges: [],
};

export type GraphQueryPlan =
  | {
      kind: 'remote';
      options: FetchGraphOptions;
      message: null;
    }
  | {
      kind: 'local-empty';
      graph: KnowledgeGraph;
      message: string;
    };

export interface GraphQueryPlanInput {
  density: number;
  scope: KBScope;
  selected: Selection;
  view: GraphDataView;
}

export function build_graph_query_plan(input: GraphQueryPlanInput): GraphQueryPlan {
  const anchor_node_ids = input.selected?.type === 'node' ? [input.selected.id] : [];
  const anchor_edge_ids = input.selected?.type === 'edge' ? [input.selected.id] : [];

  if (input.view === 'evidence' && !anchor_node_ids.length && !anchor_edge_ids.length) {
    return {
      kind: 'local-empty',
      graph: { ...EMPTY_GRAPH, view: input.view },
      message: '证据图需要先选择一个节点或关系。',
    };
  }

  return {
    kind: 'remote',
    options: {
      scope: input.scope,
      view: input.view,
      density: normalize_graph_density(input.density),
      anchor_node_ids,
      anchor_edge_ids,
    },
    message: null,
  };
}

function normalize_graph_density(density: number): number {
  if (!Number.isFinite(density)) {
    throw new TypeError('Graph density must be finite.');
  }
  return Math.max(1, Math.min(100, Math.round(density)));
}
