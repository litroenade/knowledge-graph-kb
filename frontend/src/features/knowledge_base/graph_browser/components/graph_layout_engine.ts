import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

import type { GraphReadingLens, GraphViewMode } from '../../shared/types/knowledge_base_types';
import type { GraphLayoutMap, RenderEdge, RenderNode } from './graph_render_types';
import { GRAPH_LAYOUT_TOKENS } from './graph_visual_tokens';

interface LayoutNodeDatum extends SimulationNodeDatum {
  id: string;
  radius: number;
}

interface LayoutEdgeDatum extends SimulationLinkDatum<LayoutNodeDatum> {
  id: string;
  kind: string;
}

interface GraphComponentRecord {
  node_ids: string[];
  edge_ids: string[];
}

interface BoundsRecord {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  width: number;
  height: number;
}

interface PackedComponentRecord {
  component: GraphComponentRecord;
  positions: GraphLayoutMap;
  bounds: BoundsRecord;
  weight: number;
}

interface GraphLayoutOptions {
  reading_lens?: GraphReadingLens;
  graph_view_mode?: GraphViewMode;
}

interface SidecarBoundsRecord {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
}

interface SourceAnchorGroupRecord {
  source_node: RenderNode;
  semantic_node_ids: string[];
}

function initial_position(index: number, total: number): { x: number; y: number } {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const ring = Math.ceil((index + 1) / 12);
  const radius = 80 + ring * 34;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function resolve_charge(node_count: number): number {
  return GRAPH_LAYOUT_TOKENS.charge_base - Math.sqrt(node_count) * GRAPH_LAYOUT_TOKENS.charge_scale;
}

function resolve_link_distance(edge: RenderEdge, node_count: number): number {
  const density_factor = 0.94 + 0.4 / Math.max(Math.sqrt(node_count), 1);
  if (edge.layer_mode === 'structure') {
    return GRAPH_LAYOUT_TOKENS.structure_link_distance * density_factor;
  }
  if (edge.layer_mode === 'evidence') {
    return GRAPH_LAYOUT_TOKENS.evidence_link_distance * density_factor;
  }
  if (edge.type === 'provenance') {
    return GRAPH_LAYOUT_TOKENS.semantic_link_distance * 1.42 * density_factor;
  }
  if (edge.type === 'manual') {
    return GRAPH_LAYOUT_TOKENS.manual_link_distance * density_factor;
  }
  return GRAPH_LAYOUT_TOKENS.semantic_link_distance * density_factor;
}

function is_source_context_node(node: RenderNode): boolean {
  return node.type === 'source' || node.type === 'workbook';
}

function resolve_provenance_semantic_node_id(
  edge: RenderEdge,
  node_map: Map<string, RenderNode>,
): string | null {
  const source_node = node_map.get(edge.source);
  const target_node = node_map.get(edge.target);
  const source_like_node = source_node && is_source_context_node(source_node)
    ? source_node
    : target_node && is_source_context_node(target_node)
      ? target_node
      : null;
  if (!source_like_node) {
    return null;
  }
  return source_like_node.id === edge.source ? edge.target : edge.source;
}

function estimate_text_width(value: string, font_size: number): number {
  const compact = value.trim();
  return Math.max(compact.length, 1) * font_size * 0.62;
}

function resolve_source_sidecar_bounds(
  source_node: RenderNode,
  x: number,
  y: number,
  related_count: number,
): SidecarBoundsRecord {
  const subtitle_text = `来源 · ${related_count} 个关联`;
  const title_width = estimate_text_width(source_node.display_label, 11);
  const subtitle_width = estimate_text_width(subtitle_text, 10);
  const card_width = Math.max(title_width + 30, subtitle_width + 30, 152);
  const card_height = 70;
  const card_x = x + source_node.radius + 28;
  const card_y = y - card_height / 2;

  return {
    min_x: card_x,
    max_x: card_x + card_width,
    min_y: card_y,
    max_y: card_y + card_height,
  };
}

function sidecar_bounds_overlap(
  left: SidecarBoundsRecord,
  right: SidecarBoundsRecord,
  padding = 14,
): boolean {
  return !(
    left.max_x + padding < right.min_x ||
    right.max_x + padding < left.min_x ||
    left.max_y + padding < right.min_y ||
    right.max_y + padding < left.min_y
  );
}

function resolve_bounds(positions: GraphLayoutMap, node_map: Map<string, RenderNode>): BoundsRecord {
  let min_x = Number.POSITIVE_INFINITY;
  let max_x = Number.NEGATIVE_INFINITY;
  let min_y = Number.POSITIVE_INFINITY;
  let max_y = Number.NEGATIVE_INFINITY;

  for (const [node_id, point] of positions.entries()) {
    const node = node_map.get(node_id);
    const radius = node?.radius ?? 0;
    min_x = Math.min(min_x, point.x - radius);
    max_x = Math.max(max_x, point.x + radius);
    min_y = Math.min(min_y, point.y - radius);
    max_y = Math.max(max_y, point.y + radius);
  }

  return {
    min_x,
    max_x,
    min_y,
    max_y,
    width: Math.max(max_x - min_x, 1),
    height: Math.max(max_y - min_y, 1),
  };
}

function translate_positions(
  positions: GraphLayoutMap,
  offset_x: number,
  offset_y: number,
): GraphLayoutMap {
  const translated = new Map<string, { x: number; y: number }>();
  for (const [node_id, point] of positions.entries()) {
    translated.set(node_id, {
      x: point.x + offset_x,
      y: point.y + offset_y,
    });
  }
  return translated;
}

function center_positions(positions: GraphLayoutMap): GraphLayoutMap {
  if (!positions.size) {
    return positions;
  }
  let min_x = Number.POSITIVE_INFINITY;
  let max_x = Number.NEGATIVE_INFINITY;
  let min_y = Number.POSITIVE_INFINITY;
  let max_y = Number.NEGATIVE_INFINITY;
  for (const point of positions.values()) {
    min_x = Math.min(min_x, point.x);
    max_x = Math.max(max_x, point.x);
    min_y = Math.min(min_y, point.y);
    max_y = Math.max(max_y, point.y);
  }
  return translate_positions(
    positions,
    -(min_x + max_x) / 2,
    -(min_y + max_y) / 2,
  );
}

function center_positions_on_node_set(
  positions: GraphLayoutMap,
  node_ids: string[],
): GraphLayoutMap {
  const selected_points = node_ids
    .map((node_id) => positions.get(node_id))
    .filter(Boolean) as Array<{ x: number; y: number }>;
  if (!selected_points.length) {
    return center_positions(positions);
  }

  let min_x = Number.POSITIVE_INFINITY;
  let max_x = Number.NEGATIVE_INFINITY;
  let min_y = Number.POSITIVE_INFINITY;
  let max_y = Number.NEGATIVE_INFINITY;
  selected_points.forEach((point) => {
    min_x = Math.min(min_x, point.x);
    max_x = Math.max(max_x, point.x);
    min_y = Math.min(min_y, point.y);
    max_y = Math.max(max_y, point.y);
  });

  return translate_positions(positions, -(min_x + max_x) / 2, -(min_y + max_y) / 2);
}

function average_points(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  const total = points.reduce(
    (result, point) => ({
      x: result.x + point.x,
      y: result.y + point.y,
    }),
    { x: 0, y: 0 },
  );
  return {
    x: total.x / Math.max(points.length, 1),
    y: total.y / Math.max(points.length, 1),
  };
}

function collect_source_anchor_groups(
  positions: GraphLayoutMap,
  nodes: RenderNode[],
  edges: RenderEdge[],
): SourceAnchorGroupRecord[] {
  const node_map = new Map(nodes.map((node) => [node.id, node]));
  const semantic_node_ids_by_source_id = new Map<string, Set<string>>();

  edges.forEach((edge) => {
    if (edge.type !== 'provenance') {
      return;
    }
    const source_node = node_map.get(edge.source);
    const target_node = node_map.get(edge.target);
    const source_like_node = source_node && is_source_context_node(source_node)
      ? source_node
      : target_node && is_source_context_node(target_node)
        ? target_node
        : null;
    const semantic_node_id = resolve_provenance_semantic_node_id(edge, node_map);
    if (!source_like_node || !semantic_node_id || !positions.has(semantic_node_id)) {
      return;
    }
    const semantic_node_ids = semantic_node_ids_by_source_id.get(source_like_node.id) ?? new Set<string>();
    semantic_node_ids.add(semantic_node_id);
    semantic_node_ids_by_source_id.set(source_like_node.id, semantic_node_ids);
  });

  return [...semantic_node_ids_by_source_id.entries()]
    .map(([source_node_id, semantic_node_ids]) => {
      const source_node = node_map.get(source_node_id);
      if (!source_node) {
        return null;
      }
      return {
        source_node,
        semantic_node_ids: [...semantic_node_ids],
      };
    })
    .filter(Boolean) as SourceAnchorGroupRecord[];
}

function source_anchor_overlaps(
  candidate: { x: number; y: number; radius: number },
  placed: Array<{ x: number; y: number; radius: number }>,
): boolean {
  return placed.some((current) => {
    const min_distance = candidate.radius + current.radius + 42;
    return Math.hypot(candidate.x - current.x, candidate.y - current.y) < min_distance;
  });
}

function place_source_anchors(
  positions: GraphLayoutMap,
  nodes: RenderNode[],
  edges: RenderEdge[],
): GraphLayoutMap {
  const source_anchor_groups = collect_source_anchor_groups(positions, nodes, edges);
  if (!source_anchor_groups.length) {
    return positions;
  }

  const translated = new Map(positions);
  const semantic_points = nodes
    .filter((node) => !is_source_context_node(node))
    .map((node) => translated.get(node.id))
    .filter(Boolean) as Array<{ x: number; y: number }>;
  if (!semantic_points.length) {
    return translated;
  }

  const graph_center = average_points(semantic_points);
  const ordered_groups = [...source_anchor_groups].sort((left, right) =>
    left.source_node.id.localeCompare(right.source_node.id, 'zh-CN'),
  );
  const placed_anchors: Array<{ x: number; y: number; radius: number }> = [];
  const angle_offsets = [0, 0.42, -0.42, 0.84, -0.84, 1.26, -1.26];

  ordered_groups.forEach((group, index) => {
    const related_points = group.semantic_node_ids
      .map((node_id) => translated.get(node_id))
      .filter(Boolean) as Array<{ x: number; y: number }>;
    if (!related_points.length) {
      return;
    }

    const cluster_center = average_points(related_points);
    const cluster_radius = Math.max(
      36,
      ...related_points.map((point) => Math.hypot(point.x - cluster_center.x, point.y - cluster_center.y)),
    );
    const base_angle =
      Math.hypot(cluster_center.x - graph_center.x, cluster_center.y - graph_center.y) <= 1
        ? (index / Math.max(ordered_groups.length, 1)) * Math.PI * 2
        : Math.atan2(cluster_center.y - graph_center.y, cluster_center.x - graph_center.x);
    const base_distance =
      cluster_radius + 118 + Math.min(group.semantic_node_ids.length, 6) * 12 + group.source_node.radius;
    let resolved_position: { x: number; y: number } | null = null;

    for (let ring = 0; ring < 3 && !resolved_position; ring += 1) {
      const distance = base_distance + ring * 52;
      for (const angle_offset of angle_offsets) {
        const angle = base_angle + angle_offset;
        const candidate = {
          x: cluster_center.x + Math.cos(angle) * distance,
          y: cluster_center.y + Math.sin(angle) * distance,
          radius: group.source_node.radius,
        };
        if (source_anchor_overlaps(candidate, placed_anchors)) {
          continue;
        }
        resolved_position = { x: candidate.x, y: candidate.y };
        placed_anchors.push(candidate);
        break;
      }
    }

    const fallback = resolved_position ?? {
      x: cluster_center.x + Math.cos(base_angle) * (base_distance + Math.min(index, 4) * 36),
      y: cluster_center.y + Math.sin(base_angle) * (base_distance + Math.min(index, 4) * 36),
    };

    translated.set(group.source_node.id, fallback);
  });

  return translated;
}

function place_source_sidecars(
  positions: GraphLayoutMap,
  nodes: RenderNode[],
  edges: RenderEdge[],
): GraphLayoutMap {
  const node_map = new Map(nodes.map((node) => [node.id, node]));
  const source_groups = new Map<string, string[]>();

  edges.forEach((edge) => {
    if (edge.type !== 'provenance') {
      return;
    }
    const source_node = node_map.get(edge.source);
    const target_node = node_map.get(edge.target);
    const source_like_node = source_node && is_source_context_node(source_node)
      ? source_node
      : target_node && is_source_context_node(target_node)
        ? target_node
        : null;
    const semantic_side_node_id =
      source_like_node?.id === edge.source ? edge.target : edge.source;
    if (!source_like_node || !positions.has(semantic_side_node_id)) {
      return;
    }
    const related_node_ids = source_groups.get(source_like_node.id) ?? [];
    related_node_ids.push(semantic_side_node_id);
    source_groups.set(source_like_node.id, related_node_ids);
  });

  if (!source_groups.size) {
    return positions;
  }

  const translated = new Map(positions);
  const ordered_source_ids = [...source_groups.keys()].sort((left, right) => left.localeCompare(right, 'zh-CN'));
  const placed_sidecar_bounds: SidecarBoundsRecord[] = [];

  ordered_source_ids.forEach((source_node_id, index) => {
    const source_node = node_map.get(source_node_id);
    const related_points = [...new Set(source_groups.get(source_node_id) ?? [])]
      .map((node_id) => translated.get(node_id))
      .filter(Boolean) as Array<{ x: number; y: number }>;
    if (!source_node || !related_points.length) {
      return;
    }
    let max_x = Number.NEGATIVE_INFINITY;
    let min_y = Number.POSITIVE_INFINITY;
    let max_y = Number.NEGATIVE_INFINITY;
    related_points.forEach((point) => {
      max_x = Math.max(max_x, point.x);
      min_y = Math.min(min_y, point.y);
      max_y = Math.max(max_y, point.y);
    });
    const cluster_center_y = (min_y + max_y) / 2;
    const base_x = max_x + 96 + Math.min(related_points.length, 4) * 18 + source_node.radius;
    const offset_steps = [0, 92, -92, 184, -184, 276, -276];
    let resolved_position: { x: number; y: number } | null = null;

    for (let column = 0; column < 4 && !resolved_position; column += 1) {
      const candidate_x = base_x + column * 54;
      for (const offset of offset_steps) {
        const candidate_y = cluster_center_y + offset + (index % 2 === 0 ? 0 : 18);
        const candidate_bounds = resolve_source_sidecar_bounds(
          source_node,
          candidate_x,
          candidate_y,
          related_points.length,
        );
        if (placed_sidecar_bounds.some((current) => sidecar_bounds_overlap(current, candidate_bounds))) {
          continue;
        }
        resolved_position = { x: candidate_x, y: candidate_y };
        placed_sidecar_bounds.push(candidate_bounds);
        break;
      }
    }

    const fallback_position =
      resolved_position ?? {
        x: base_x + Math.min(index, 3) * 54,
        y: cluster_center_y + (index - (ordered_source_ids.length - 1) / 2) * 84,
      };

    translated.set(source_node_id, fallback_position);
  });

  return translated;
}

export function build_connected_components(
  nodes: RenderNode[],
  edges: RenderEdge[],
): GraphComponentRecord[] {
  const adjacency = new Map<string, string[]>();
  const edge_ids_by_node_id = new Map<string, string[]>();
  const node_ids = nodes.map((node) => node.id);
  node_ids.forEach((node_id) => {
    adjacency.set(node_id, []);
    edge_ids_by_node_id.set(node_id, []);
  });

  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
    edge_ids_by_node_id.get(edge.source)?.push(edge.id);
    edge_ids_by_node_id.get(edge.target)?.push(edge.id);
  }

  const visited = new Set<string>();
  const components: GraphComponentRecord[] = [];

  for (const node_id of node_ids) {
    if (visited.has(node_id)) {
      continue;
    }
    const queue = [node_id];
    const component_node_ids: string[] = [];
    const component_edge_ids = new Set<string>();
    visited.add(node_id);

    while (queue.length) {
      const current = queue.shift()!;
      component_node_ids.push(current);
      edge_ids_by_node_id.get(current)?.forEach((edge_id) => component_edge_ids.add(edge_id));
      adjacency.get(current)?.forEach((next) => {
        if (visited.has(next)) {
          return;
        }
        visited.add(next);
        queue.push(next);
      });
    }

    components.push({
      node_ids: component_node_ids,
      edge_ids: [...component_edge_ids],
    });
  }

  return components;
}

function layout_component(
  nodes: RenderNode[],
  edges: RenderEdge[],
  previous_positions?: GraphLayoutMap,
): GraphLayoutMap {
  if (!nodes.length) {
    return new Map();
  }
  if (nodes.length === 1) {
    return new Map([[nodes[0].id, { x: 0, y: 0 }]]);
  }

  const layout_nodes: LayoutNodeDatum[] = nodes.map((node, index) => {
    const seed =
      previous_positions?.get(node.id) ??
      initial_position(index, nodes.length);
    return {
      id: node.id,
      radius: node.radius,
      x: seed.x,
      y: seed.y,
    };
  });

  const layout_edges: LayoutEdgeDatum[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind: edge.type,
  }));

  const simulation = forceSimulation(layout_nodes)
    .force('charge', forceManyBody<LayoutNodeDatum>().strength(resolve_charge(nodes.length)))
    .force(
      'link',
      forceLink<LayoutNodeDatum, LayoutEdgeDatum>(layout_edges)
        .id((node) => node.id)
        .distance((edge) => resolve_link_distance(edges.find((item) => item.id === edge.id) ?? edges[0], nodes.length))
        .strength((edge) =>
          edge.kind === 'manual' || edge.kind === 'relation'
            ? 0.34
            : edge.kind === 'provenance'
              ? 0.12
            : edges.find((item) => item.id === edge.id)?.layer_mode === 'semantic'
              ? 0.28
              : 0.16,
        ),
    )
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<LayoutNodeDatum>().radius((node) => node.radius + 10).iterations(2));

  simulation.stop();
  const total_ticks = Math.max(120, 80 + nodes.length * 4);
  for (let tick = 0; tick < total_ticks; tick += 1) {
    simulation.tick();
  }
  simulation.stop();

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of layout_nodes) {
    positions.set(node.id, { x: Number(node.x ?? 0), y: Number(node.y ?? 0) });
  }
  return positions;
}

export function build_graph_layout(
  nodes: RenderNode[],
  edges: RenderEdge[],
  previous_positions?: GraphLayoutMap,
  options?: GraphLayoutOptions,
): GraphLayoutMap {
  const reading_lens = options?.reading_lens;
  const node_map = new Map(nodes.map((node) => [node.id, node]));
  const connected_edges = edges.filter((edge) => node_map.has(edge.source) && node_map.has(edge.target));
  const should_use_source_anchor_layout =
    options?.graph_view_mode === 'global' &&
    reading_lens?.mode === 'overview' &&
    connected_edges.some((edge) => edge.type === 'provenance');
  const layout_nodes = should_use_source_anchor_layout
    ? nodes.filter((node) => !is_source_context_node(node))
    : nodes;
  const layout_node_map = new Map(layout_nodes.map((node) => [node.id, node]));
  const layout_edges = should_use_source_anchor_layout
    ? connected_edges.filter((edge) => layout_node_map.has(edge.source) && layout_node_map.has(edge.target))
    : connected_edges;
  const components = build_connected_components(layout_nodes, layout_edges);
  const packed_components: PackedComponentRecord[] = [];
  const isolated_components: GraphComponentRecord[] = [];

  for (const component of components) {
    if (component.node_ids.length === 1 && component.edge_ids.length === 0) {
      isolated_components.push(component);
      continue;
    }
    const component_nodes = component.node_ids.map((node_id) => layout_node_map.get(node_id)!);
    const component_edges = layout_edges.filter((edge) => component.edge_ids.includes(edge.id));
    const positions = layout_component(component_nodes, component_edges, previous_positions);
    const bounds = resolve_bounds(positions, layout_node_map);
    const contains_anchor = (reading_lens?.anchor_node_ids ?? []).some((node_id) =>
      component.node_ids.includes(node_id),
    );
    const semantic_edge_count = component_edges.filter((edge) => edge.layer_mode === 'semantic').length;
    const evidence_edge_count = component_edges.filter((edge) => edge.layer_mode === 'evidence').length;
    const structure_edge_count = component_edges.filter((edge) => edge.layer_mode === 'structure').length;
    const weight =
      semantic_edge_count * 4 +
      evidence_edge_count * 2 +
      structure_edge_count +
      component_nodes.length +
      (contains_anchor ? 999 : 0);
    packed_components.push({ component, positions, bounds, weight });
  }

  packed_components.sort((left, right) => right.weight - left.weight);
  const composed_positions = new Map<string, { x: number; y: number }>();
  const row_width_target = Math.max(
    420,
    Math.sqrt(
      packed_components.reduce((total, item) => total + item.bounds.width * item.bounds.height, 0) || 1,
    ) * 2.15,
  );

  let cursor_x = 0;
  let cursor_y = 0;
  let row_height = 0;
  for (const item of packed_components) {
    if (cursor_x > 0 && cursor_x + item.bounds.width > row_width_target) {
      cursor_x = 0;
      cursor_y += row_height + GRAPH_LAYOUT_TOKENS.component_gap;
      row_height = 0;
    }
    const offset_x = cursor_x - item.bounds.min_x;
    const offset_y = cursor_y - item.bounds.min_y;
    translate_positions(item.positions, offset_x, offset_y).forEach((point, node_id) => {
      composed_positions.set(node_id, point);
    });
    cursor_x += item.bounds.width + GRAPH_LAYOUT_TOKENS.component_gap;
    row_height = Math.max(row_height, item.bounds.height);
  }

  if (isolated_components.length) {
    const isolated_nodes = isolated_components
      .map((component) => layout_node_map.get(component.node_ids[0])!)
      .sort((left, right) => (right.evidence_count ?? 0) - (left.evidence_count ?? 0));
    const existing_bounds =
      composed_positions.size > 0
        ? resolve_bounds(composed_positions, node_map)
        : { min_x: 0, max_x: 0, min_y: 0, max_y: 0, width: 0, height: 0 };
    const columns = Math.max(4, Math.ceil(Math.sqrt(isolated_nodes.length * 1.8)));
    const spacing =
      isolated_nodes.reduce((total, node) => total + node.radius * 2.9, 0) / isolated_nodes.length;
    const grid_width = Math.max((columns - 1) * spacing, 0);
    const centered_start_x = existing_bounds.min_x + (existing_bounds.width - grid_width) / 2;
    isolated_nodes.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      composed_positions.set(node.id, {
        x: centered_start_x + column * spacing,
        y: existing_bounds.max_y + GRAPH_LAYOUT_TOKENS.isolated_row_offset + row * spacing,
      });
    });
  }

  const focus_node_ids =
    reading_lens?.mode === 'reading'
      ? reading_lens.anchor_node_ids.length
        ? reading_lens.anchor_node_ids
        : reading_lens.context_node_ids
      : [];
  const resolved_positions = should_use_source_anchor_layout
    ? place_source_anchors(composed_positions, nodes, connected_edges)
    : place_source_sidecars(composed_positions, nodes, connected_edges);
  return focus_node_ids.length
    ? center_positions_on_node_set(resolved_positions, focus_node_ids)
    : center_positions(resolved_positions);
}
