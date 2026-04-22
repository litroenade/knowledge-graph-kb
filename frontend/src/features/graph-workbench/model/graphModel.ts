import type { GraphDataView, KnowledgeGraph, KnowledgeGraphEdge, KnowledgeGraphNode } from '../../../shared/types/kb';

export type GraphMode = 'global' | 'local';
export type RuntimeMode = 'standard' | 'balanced' | 'static';
export type Selection =
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }
  | null;

export interface GraphViewSettings {
  graph_mode: GraphMode;
  local_depth: number;
  density: number;
  view: GraphDataView;
  search: string;
  selected_source_ids: string[];
  selected: Selection;
}

export interface RenderNode extends KnowledgeGraphNode {
  display_name: string;
  short_name: string;
  degree: number;
  radius: number;
  color: number;
  source_label: string | null;
}

export interface RenderEdge extends KnowledgeGraphEdge {
  display_name: string;
  source_name_resolved: string;
  target_name_resolved: string;
  color: number;
}

export interface ProjectedGraph {
  nodes: RenderNode[];
  edges: RenderEdge[];
  visible_node_count: number;
  visible_edge_count: number;
  total_node_count: number;
  total_edge_count: number;
}

export interface Neighborhood {
  primary_node_ids: Set<string>;
  secondary_node_ids: Set<string>;
  edge_ids: Set<string>;
}

export interface RuntimeProfile {
  mode: RuntimeMode;
  complexity: number;
  physics_enabled: boolean;
  passive_labels_hidden: boolean;
}

const NODE_COLORS: Record<string, number> = {
  entity: 0x7dd3fc,
  source: 0xfbbf24,
  workbook: 0xf59e0b,
  paragraph: 0x34d399,
  worksheet: 0xa3e635,
  record: 0x818cf8,
};

const EDGE_COLORS: Record<string, number> = {
  relation: 0x38bdf8,
  manual: 0xf472b6,
  provenance: 0xfbbf24,
  mentions: 0x2dd4bf,
  contains: 0x94a3b8,
  contains_sheet: 0x94a3b8,
  contains_record: 0x94a3b8,
};

export function resolve_runtime_profile(node_count: number, edge_count: number): RuntimeProfile {
  const complexity = node_count + edge_count * 0.2;
  const mode: RuntimeMode = complexity > 600 ? 'static' : complexity > 300 ? 'balanced' : 'standard';
  return {
    mode,
    complexity,
    physics_enabled: mode !== 'static',
    passive_labels_hidden: mode === 'static',
  };
}

export function build_scope_source_ids(selected_source_ids: string[]): string[] {
  return Array.from(new Set(selected_source_ids.filter(Boolean)));
}

export function normalize_search(value: string): string {
  return value.trim().toLowerCase();
}

export function project_graph(graph: KnowledgeGraph, settings: GraphViewSettings): ProjectedGraph {
  const selected_source_id_set = new Set(settings.selected_source_ids);
  const search = normalize_search(settings.search);
  const visible_node_ids = new Set<string>();
  const node_by_id = new Map(graph.nodes.map((node) => [node.id, node]));

  graph.nodes.forEach((node) => {
    const source_match =
      selected_source_id_set.size === 0 ||
      selected_source_id_set.has(String(node.metadata.source_id ?? '')) ||
      selected_source_id_set.has(node.id.replace(/^source:/, ''));
    const text = [
      node.display_label,
      node.label,
      node.kind_label,
      node.source_name,
      node.id,
    ].join(' ').toLowerCase();
    if (source_match && (!search || text.includes(search))) {
      visible_node_ids.add(node.id);
    }
  });

  if (settings.graph_mode === 'local' && settings.selected?.type === 'node') {
    const local_ids = resolve_local_node_ids(graph.edges, settings.selected.id, settings.local_depth);
    for (const node_id of [...visible_node_ids]) {
      if (!local_ids.has(node_id)) {
        visible_node_ids.delete(node_id);
      }
    }
    local_ids.forEach((node_id) => {
      if (node_by_id.has(node_id)) {
        visible_node_ids.add(node_id);
      }
    });
  }

  const edges = graph.edges.filter((edge) => visible_node_ids.has(edge.source) && visible_node_ids.has(edge.target));
  const degree = build_degree_map(edges);
  const nodes = graph.nodes
    .filter((node) => visible_node_ids.has(node.id))
    .map((node) => to_render_node(node, degree.get(node.id) ?? 0));
  const render_node_by_id = new Map(nodes.map((node) => [node.id, node]));

  return {
    nodes,
    edges: edges.map((edge) => to_render_edge(edge, render_node_by_id)),
    visible_node_count: nodes.length,
    visible_edge_count: edges.length,
    total_node_count: graph.nodes.length,
    total_edge_count: graph.edges.length,
  };
}

export function resolve_neighborhood(edges: RenderEdge[], selection: Selection): Neighborhood {
  const primary_node_ids = new Set<string>();
  const secondary_node_ids = new Set<string>();
  const edge_ids = new Set<string>();
  if (!selection) {
    return { primary_node_ids, secondary_node_ids, edge_ids };
  }

  if (selection.type === 'edge') {
    const edge = edges.find((item) => item.id === selection.id);
    if (edge) {
      primary_node_ids.add(edge.source);
      primary_node_ids.add(edge.target);
      edge_ids.add(edge.id);
    }
    return { primary_node_ids, secondary_node_ids, edge_ids };
  }

  primary_node_ids.add(selection.id);
  for (const edge of edges) {
    if (edge.source === selection.id || edge.target === selection.id) {
      edge_ids.add(edge.id);
      primary_node_ids.add(edge.source);
      primary_node_ids.add(edge.target);
    }
  }
  for (const edge of edges) {
    if (primary_node_ids.has(edge.source) || primary_node_ids.has(edge.target)) {
      edge_ids.add(edge.id);
      if (!primary_node_ids.has(edge.source)) {
        secondary_node_ids.add(edge.source);
      }
      if (!primary_node_ids.has(edge.target)) {
        secondary_node_ids.add(edge.target);
      }
    }
  }
  return { primary_node_ids, secondary_node_ids, edge_ids };
}

function resolve_local_node_ids(edges: KnowledgeGraphEdge[], anchor_node_id: string, depth: number): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), edge.source]);
  }
  const visited = new Set([anchor_node_id]);
  let frontier = [anchor_node_id];
  for (let level = 0; level < Math.max(1, depth); level += 1) {
    const next: string[] = [];
    frontier.forEach((node_id) => {
      (adjacency.get(node_id) ?? []).forEach((candidate) => {
        if (!visited.has(candidate)) {
          visited.add(candidate);
          next.push(candidate);
        }
      });
    });
    frontier = next;
  }
  return visited;
}

function build_degree_map(edges: KnowledgeGraphEdge[]): Map<string, number> {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

function to_render_node(node: KnowledgeGraphNode, degree: number): RenderNode {
  const display_name = node.display_label?.trim() || node.label;
  const base_size = Number.isFinite(node.size) ? node.size : 8;
  return {
    ...node,
    display_name,
    short_name: truncate_label(display_name, 18),
    degree,
    radius: Math.max(7, Math.min(28, 7 + base_size * 1.12 + Math.sqrt(degree) * 1.5)),
    color: NODE_COLORS[node.type] ?? 0x94a3b8,
    source_label: node.source_name,
  };
}

function to_render_edge(edge: KnowledgeGraphEdge, nodes: Map<string, RenderNode>): RenderEdge {
  return {
    ...edge,
    display_name: edge.display_label?.trim() || edge.label,
    source_name_resolved: nodes.get(edge.source)?.display_name ?? edge.source,
    target_name_resolved: nodes.get(edge.target)?.display_name ?? edge.target,
    color: EDGE_COLORS[edge.type] ?? 0x64748b,
  };
}

function truncate_label(value: string, max_length: number): string {
  const compact = value.trim();
  if (compact.length <= max_length) {
    return compact;
  }
  return `${compact.slice(0, max_length - 1)}…`;
}
