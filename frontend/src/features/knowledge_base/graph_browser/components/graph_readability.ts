import type { GraphViewIntent, GraphViewMode } from '../../shared/types/knowledge_base_types';
import type { RenderEdge, RenderNode } from './graph_render_types';

interface GraphReadabilityContext {
  graph_view_mode: GraphViewMode;
  reading_mode: GraphViewIntent;
  total_node_count: number;
  has_context: boolean;
  selected_node_id: string | null;
  selected_edge_id: string | null;
  selected_related_node_ids: Set<string>;
  highlighted_node_ids: Set<string>;
  highlighted_edge_ids: Set<string>;
  highlighted_edge_count: number;
  label_priority_node_ids: Set<string>;
  anchor_node_ids: Set<string>;
  anchor_edge_ids: Set<string>;
  node_degree_by_id?: Map<string, number>;
  component_size_by_node_id?: Map<string, number>;
}

function is_semantic_relation_edge(edge: RenderEdge): boolean {
  return edge.layer_mode === 'semantic';
}

function is_provenance_edge(edge: RenderEdge): boolean {
  return edge.type === 'provenance';
}

function is_source_bundle_edge(edge: RenderEdge): boolean {
  return edge.aggregate_kind === 'source_bundle';
}

function is_source_context_node(node: RenderNode): boolean {
  return node.type === 'source' || node.type === 'workbook';
}

function is_priority_node(node: RenderNode, context: GraphReadabilityContext): boolean {
  return context.label_priority_node_ids.has(node.id);
}

function is_emphasized_node(node: RenderNode, context: GraphReadabilityContext): boolean {
  return (
    node.id === context.selected_node_id ||
    context.anchor_node_ids.has(node.id) ||
    context.highlighted_node_ids.has(node.id) ||
    context.selected_related_node_ids.has(node.id)
  );
}

function node_degree(node: RenderNode, context: GraphReadabilityContext): number {
  return context.node_degree_by_id?.get(node.id) ?? 0;
}

function component_size(node: RenderNode, context: GraphReadabilityContext): number {
  return context.component_size_by_node_id?.get(node.id) ?? 1;
}

function is_isolated_node(node: RenderNode, context: GraphReadabilityContext): boolean {
  return node_degree(node, context) === 0;
}

export function should_show_node_label(
  node: RenderNode,
  context: GraphReadabilityContext,
): boolean {
  if (context.total_node_count <= 12) {
    return true;
  }
  const degree = node_degree(node, context);
  const current_component_size = component_size(node, context);
  const priority_node = is_priority_node(node, context);
  if (is_emphasized_node(node, context)) {
    return true;
  }
  if (context.reading_mode === 'reading' && context.graph_view_mode === 'global') {
    if (is_source_context_node(node)) {
      return degree > 0;
    }
    if (node.layer_mode === 'semantic') {
      return priority_node || degree >= 3 || (degree >= 2 && current_component_size <= 10);
    }
    return current_component_size <= 10 && degree > 0;
  }
  if (context.graph_view_mode === 'local') {
    if (is_source_context_node(node)) {
      return degree > 0;
    }
    if (node.layer_mode === 'semantic') {
      return priority_node || degree > 0 || current_component_size <= 8;
    }
    return degree > 0 || current_component_size <= 8;
  }
  if (context.graph_view_mode === 'global' && context.reading_mode === 'overview' && is_source_context_node(node)) {
    return degree > 0;
  }
  if (node.layer_mode !== 'semantic') {
    return !context.has_context && current_component_size <= 5;
  }
  if (context.has_context) {
    return priority_node || degree >= 3;
  }
  if (context.total_node_count >= 40) {
    return priority_node || degree >= 3 || (degree >= 2 && current_component_size <= 8);
  }
  return priority_node || degree >= 2 || (current_component_size <= 6 && degree > 0);
}

export function resolve_node_fill_alpha(
  node: RenderNode,
  context: GraphReadabilityContext,
): number {
  if (node.id === context.selected_node_id) {
    return 0.96;
  }
  if (context.highlighted_node_ids.has(node.id) || context.selected_related_node_ids.has(node.id)) {
    return 0.82;
  }
  if (context.reading_mode === 'reading' && context.graph_view_mode === 'global') {
    if (is_source_context_node(node)) {
      return node_degree(node, context) > 0 ? 0.34 : 0.16;
    }
    if (node.layer_mode !== 'semantic') {
      return context.anchor_node_ids.has(node.id) ? 0.3 : 0.16;
    }
    if (context.anchor_node_ids.has(node.id)) {
      return 0.9;
    }
    if (is_isolated_node(node, context)) {
      return 0.12;
    }
    return is_priority_node(node, context) ? 0.28 : 0.18;
  }
  if (context.graph_view_mode === 'local') {
    if (is_source_context_node(node)) {
      return node_degree(node, context) > 0 ? 0.28 : 0.16;
    }
    if (node.layer_mode !== 'semantic') {
      return context.has_context ? 0.08 : 0.16;
    }
    return context.has_context ? 0.24 : 0.52;
  }
  if (context.graph_view_mode === 'global' && context.reading_mode === 'overview' && is_source_context_node(node)) {
    return node_degree(node, context) > 0 ? (context.has_context ? 0.42 : 0.56) : 0.18;
  }
  if (node.layer_mode !== 'semantic') {
    return context.has_context ? 0.04 : 0.12;
  }
  if (is_isolated_node(node, context)) {
    return context.has_context ? 0.08 : 0.22;
  }
  if (context.has_context) {
    return 0.14;
  }
  return is_priority_node(node, context) ? 0.72 : 0.42;
}

export function resolve_node_halo_width(
  node: RenderNode,
  context: GraphReadabilityContext,
): number {
  if (node.id === context.selected_node_id) {
    return 3;
  }
  if (
    context.anchor_node_ids.has(node.id) ||
    context.highlighted_node_ids.has(node.id) ||
    context.selected_related_node_ids.has(node.id)
  ) {
    return 2;
  }
  if (
    is_source_context_node(node) &&
    (context.reading_mode === 'reading' || context.graph_view_mode === 'local') &&
    node_degree(node, context) > 0
  ) {
    return 1.5;
  }
  if (is_source_context_node(node) && context.graph_view_mode === 'global' && node_degree(node, context) > 0) {
    return 1.25;
  }
  return 0;
}

export function resolve_node_radius(
  node: RenderNode,
  context: GraphReadabilityContext,
): number {
  if (node.id === context.selected_node_id) {
    return node.radius * 1.18;
  }
  if (
    context.anchor_node_ids.has(node.id) ||
    context.highlighted_node_ids.has(node.id) ||
    context.selected_related_node_ids.has(node.id)
  ) {
    return node.radius * 1.08;
  }
  if (is_isolated_node(node, context)) {
    return node.radius * 0.88;
  }
  return node.radius;
}

export function resolve_node_label_alpha(
  node: RenderNode,
  context: GraphReadabilityContext,
): number {
  const degree = node_degree(node, context);
  if (node.id === context.selected_node_id) {
    return 0.98;
  }
  if (
    context.anchor_node_ids.has(node.id) ||
    context.highlighted_node_ids.has(node.id) ||
    context.selected_related_node_ids.has(node.id)
  ) {
    return 0.9;
  }
  if (context.reading_mode === 'reading' && context.graph_view_mode === 'global') {
    if (is_source_context_node(node)) {
      return node_degree(node, context) > 0 ? 0.82 : 0;
    }
    if (node.layer_mode !== 'semantic') {
      return 0;
    }
    return is_priority_node(node, context) ? 0.56 : degree >= 3 ? 0.44 : 0.3;
  }
  if (context.graph_view_mode === 'local') {
    if (is_source_context_node(node)) {
      return node_degree(node, context) > 0 ? 0.88 : 0;
    }
    if (node.layer_mode !== 'semantic') {
      return 0;
    }
    return is_priority_node(node, context) ? 0.9 : 0.74;
  }
  if (context.graph_view_mode === 'global' && context.reading_mode === 'overview' && is_source_context_node(node)) {
    return node_degree(node, context) > 0 ? 0.9 : 0;
  }
  if (node.layer_mode !== 'semantic') {
    return 0;
  }
  if (context.has_context) {
    return is_priority_node(node, context) ? 0.56 : degree >= 3 ? 0.34 : 0.2;
  }
  return is_priority_node(node, context) ? 0.92 : degree >= 3 ? 0.74 : 0.62;
}

export function should_show_edge_label(
  edge: RenderEdge,
  context: GraphReadabilityContext,
): boolean {
  if (is_provenance_edge(edge)) {
    return false;
  }
  if (edge.id === context.selected_edge_id) {
    return true;
  }
  if (context.reading_mode === 'reading' && context.graph_view_mode === 'global') {
    return (
      edge.layer_mode === 'semantic' &&
      (context.highlighted_edge_ids.has(edge.id) || context.anchor_edge_ids.has(edge.id)) &&
      context.highlighted_edge_count <= 6
    );
  }
  if (edge.layer_mode !== 'semantic') {
    return false;
  }
  if (context.graph_view_mode === 'local') {
    return context.highlighted_edge_ids.has(edge.id) && context.highlighted_edge_count <= 5;
  }
  return Boolean(
    context.selected_node_id &&
      context.highlighted_edge_ids.has(edge.id) &&
      context.highlighted_edge_count <= 5,
  );
}

export function resolve_edge_alpha(
  edge: RenderEdge,
  context: GraphReadabilityContext,
): number {
  if (edge.id === context.selected_edge_id) {
    return 0.98;
  }
  if (is_source_bundle_edge(edge)) {
    if (context.highlighted_edge_ids.has(edge.id) || context.anchor_edge_ids.has(edge.id)) {
      return 0.56;
    }
    if (context.has_context) {
      return 0.24;
    }
    return 0.3;
  }
  if (is_provenance_edge(edge)) {
    if (context.highlighted_edge_ids.has(edge.id) || context.anchor_edge_ids.has(edge.id)) {
      return 0.62;
    }
    if (context.has_context) {
      return 0.26;
    }
    return 0.34;
  }
  if (is_semantic_relation_edge(edge)) {
    if (context.highlighted_edge_ids.has(edge.id) || context.anchor_edge_ids.has(edge.id)) {
      return 0.84;
    }
    if (context.reading_mode === 'reading' && context.graph_view_mode === 'global') {
      return context.has_context ? 0.36 : 0.48;
    }
    if (context.graph_view_mode === 'local') {
      return context.has_context ? 0.46 : 0.54;
    }
    if (context.has_context) {
      return 0.28;
    }
    return edge.type === 'manual' ? 0.64 : 0.58;
  }
  if (context.reading_mode === 'reading' && context.graph_view_mode === 'global') {
    if (context.highlighted_edge_ids.has(edge.id)) {
      return 0.32;
    }
    return 0.14;
  }
  if (context.highlighted_edge_ids.has(edge.id)) {
    return context.graph_view_mode === 'local' ? 0.4 : 0.32;
  }
  if (context.graph_view_mode === 'local') {
    if (edge.layer_mode !== 'semantic') {
      return context.has_context ? 0.18 : 0.24;
    }
    if (context.highlighted_edge_ids.has(edge.id)) {
      return 0.68;
    }
    return context.has_context ? 0.28 : 0.34;
  }
  if (edge.layer_mode !== 'semantic') {
    return context.has_context ? 0.12 : 0.18;
  }
  if (context.has_context) {
    return edge.is_structural ? 0.05 : 0.14;
  }
  return edge.is_structural ? 0.08 : 0.38;
}

export function resolve_edge_width(
  edge: RenderEdge,
  context: GraphReadabilityContext,
): number {
  if (edge.id === context.selected_edge_id) {
    return 3.6;
  }
  if (is_source_bundle_edge(edge)) {
    return 1.3 + Math.min(edge.related_count, 6) * 0.12;
  }
  if (is_provenance_edge(edge)) {
    return context.anchor_edge_ids.has(edge.id) || context.highlighted_edge_ids.has(edge.id)
      ? 2
      : 1.45;
  }
  if (is_semantic_relation_edge(edge)) {
    if (context.anchor_edge_ids.has(edge.id) || context.highlighted_edge_ids.has(edge.id)) {
      return 3;
    }
    return edge.type === 'manual' ? 2.5 : 2.2;
  }
  if (context.anchor_edge_ids.has(edge.id) || context.highlighted_edge_ids.has(edge.id)) {
    return 1.8;
  }
  return edge.is_structural ? 1.15 : 1.4;
}

export function resolve_label_priority_node_ids(
  nodes: RenderNode[],
  edges: RenderEdge[],
): Set<string> {
  const degree_map = new Map<string, number>();
  for (const edge of edges) {
    if (edge.layer_mode !== 'semantic' || is_provenance_edge(edge)) {
      continue;
    }
    degree_map.set(edge.source, (degree_map.get(edge.source) ?? 0) + 1);
    degree_map.set(edge.target, (degree_map.get(edge.target) ?? 0) + 1);
  }

  const limit = Math.max(6, Math.min(18, Math.round(Math.sqrt(nodes.length) * 1.4)));
  const candidate_nodes = nodes.some((node) => node.layer_mode === 'semantic')
    ? nodes.filter((node) => node.layer_mode === 'semantic')
    : nodes;
  const ranked_node_ids = candidate_nodes
    .map((node) => ({
      id: node.id,
      evidence_count: node.evidence_count ?? 0,
      degree: degree_map.get(node.id) ?? 0,
      radius: node.radius,
      label: node.display_label,
    }))
    .filter((node) => node.evidence_count > 0 || node.degree > 0)
    .sort((left, right) => {
      if (right.evidence_count !== left.evidence_count) {
        return right.evidence_count - left.evidence_count;
      }
      if (right.degree !== left.degree) {
        return right.degree - left.degree;
      }
      if (right.radius !== left.radius) {
        return right.radius - left.radius;
      }
      return left.label.localeCompare(right.label, 'zh-CN');
    })
    .slice(0, limit)
    .map((node) => node.id);

  return new Set(ranked_node_ids);
}

export function resolve_node_degree_map(edges: RenderEdge[]): Map<string, number> {
  const degree_map = new Map<string, number>();
  for (const edge of edges) {
    degree_map.set(edge.source, (degree_map.get(edge.source) ?? 0) + 1);
    degree_map.set(edge.target, (degree_map.get(edge.target) ?? 0) + 1);
  }
  return degree_map;
}

export function resolve_component_size_map(
  nodes: RenderNode[],
  edges: RenderEdge[],
): Map<string, number> {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }
  const visited = new Set<string>();
  const component_size_by_node_id = new Map<string, number>();

  nodes.forEach((node) => {
    if (visited.has(node.id)) {
      return;
    }
    const queue = [node.id];
    const component_node_ids: string[] = [];
    visited.add(node.id);

    while (queue.length) {
      const current = queue.shift()!;
      component_node_ids.push(current);
      adjacency.get(current)?.forEach((next) => {
        if (visited.has(next)) {
          return;
        }
        visited.add(next);
        queue.push(next);
      });
    }

    component_node_ids.forEach((node_id) => {
      component_size_by_node_id.set(node_id, component_node_ids.length);
    });
  });

  return component_size_by_node_id;
}
