import { NODE_TYPE_LABELS } from '../../shared/config/ui_constants';
import type {
  GraphLayerMode,
  GraphProjectionSummary,
  GraphReadingLens,
  GraphViewIntent,
  GraphViewMode,
  KnowledgeGraphEdgeRecord,
  KnowledgeGraphNodeRecord,
  KnowledgeGraphRecord,
  LocalGraphState,
} from '../../shared/types/knowledge_base_types';
import type { ProjectedGraphRecord, RenderEdge, RenderNode } from './graph_render_types';
import { GRAPH_EDGE_COLORS, GRAPH_NODE_COLORS } from './graph_visual_tokens';

interface ProjectGraphOptions {
  active_layer_modes: GraphLayerMode[];
  reading_mode: GraphViewIntent;
  selected_node_id: string | null;
  selected_edge_id: string | null;
  highlighted_node_ids: string[];
  highlighted_edge_ids: string[];
  graph_view_mode: GraphViewMode;
  local_graph_state: LocalGraphState;
}

interface SemanticComponentRecord {
  node_ids: string[];
  edge_ids: string[];
  score: number;
}

interface ProjectionScopeRecord {
  scope_node_count: number;
  scope_edge_count: number;
  total_semantic_component_count: number;
}

interface ProvenanceEndpointsRecord {
  source_node_id: string;
  semantic_node_id: string;
}

interface ProvenanceBundleGroupRecord {
  source_node_id: string;
  component_id: string;
  raw_edges: RenderEdge[];
  semantic_node_ids: Set<string>;
}

function truncate_label(value: string, max_length = 24): string {
  const compact = value.trim();
  if (compact.length <= max_length) {
    return compact;
  }
  return `${compact.slice(0, max_length - 3)}...`;
}

function resolve_node_layer(node: KnowledgeGraphNodeRecord): GraphLayerMode {
  return node.family ?? 'semantic';
}

function resolve_edge_layer(edge: KnowledgeGraphEdgeRecord): GraphLayerMode {
  return edge.family ?? 'semantic';
}

function is_structural_edge(edge: KnowledgeGraphEdgeRecord): boolean {
  return edge.is_structural ?? ['contains', 'contains_sheet', 'contains_record'].includes(edge.type);
}

function is_semantic_edge(edge: RenderEdge): boolean {
  return edge.layer_mode === 'semantic';
}

function is_provenance_edge(edge: RenderEdge): boolean {
  return edge.type === 'provenance';
}

function is_entity_semantic_node(node: RenderNode): boolean {
  return node.layer_mode === 'semantic' && node.type === 'entity';
}

function is_projection_semantic_anchor_node(node: RenderNode | undefined): boolean {
  return Boolean(node && is_entity_semantic_node(node));
}

function is_source_context_node(node: RenderNode): boolean {
  return node.type === 'source' || node.type === 'workbook';
}

function normalize_source_name(node: KnowledgeGraphNodeRecord): string | null {
  if (node.source_name) {
    return node.source_name;
  }
  if (node.type === 'source' || node.type === 'workbook') {
    return node.display_label ?? node.label;
  }
  const metadata = node.metadata ?? {};
  const value = metadata.source_name ?? metadata.name ?? null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolve_evidence_count(node: KnowledgeGraphNodeRecord): number | null {
  if (typeof node.evidence_count === 'number') {
    return node.evidence_count;
  }
  const metadata = node.metadata ?? {};
  const appearance_count = metadata.appearance_count;
  return typeof appearance_count === 'number' ? appearance_count : null;
}

function resolve_node_radius(node: KnowledgeGraphNodeRecord): number {
  if (node.type === 'source' || node.type === 'workbook') {
    return 18;
  }
  if (node.type === 'worksheet') {
    return 12;
  }
  if (node.type === 'record' || node.type === 'paragraph') {
    return 9;
  }
  const base_size = typeof node.size === 'number' ? node.size : 8;
  return Math.max(9, Math.min(26, 8 + base_size * 1.15));
}

function to_render_node(node: KnowledgeGraphNodeRecord): RenderNode {
  const display_label = node.display_label?.trim() || node.label;
  const kind_label = node.kind_label?.trim() || NODE_TYPE_LABELS[node.type] || node.type;
  const source_name = normalize_source_name(node);
  const evidence_count = resolve_evidence_count(node);

  return {
    ...node,
    display_label,
    short_label: truncate_label(display_label, 16),
    kind_label,
    source_name,
    evidence_count,
    layer_mode: resolve_node_layer(node),
    is_structural: node.type === 'worksheet' || node.type === 'record',
    radius: resolve_node_radius(node),
    color: GRAPH_NODE_COLORS[node.type] ?? 0x6b7280,
    searchable_text: [display_label, kind_label, source_name ?? '', node.id].join(' ').toLowerCase(),
  };
}

function to_render_edge(edge: KnowledgeGraphEdgeRecord): RenderEdge {
  const display_label = edge.display_label?.trim() || edge.label;
  const relation_kind_label =
    edge.relation_kind_label?.trim() ||
    (edge.family === 'structure'
      ? 'Structure relation'
      : edge.family === 'evidence'
        ? 'Evidence relation'
        : edge.type === 'manual'
          ? 'Manual relation'
          : 'Semantic relation');

  return {
    ...edge,
    display_label,
    short_label: truncate_label(display_label, 18),
    relation_kind_label,
    source_name: edge.source_name ?? null,
    evidence_paragraph_id: edge.evidence_paragraph_id ?? null,
    layer_mode: resolve_edge_layer(edge),
    is_structural: is_structural_edge(edge),
    color: GRAPH_EDGE_COLORS[edge.type] ?? 0x9ca3af,
    aggregate_kind: 'none',
    related_node_ids: [],
    related_edge_ids: [],
    related_count: 0,
  };
}

function include_node_by_layers(node: RenderNode, active_layer_modes: Set<GraphLayerMode>): boolean {
  return active_layer_modes.has(node.layer_mode);
}

function include_edge_by_layers(edge: RenderEdge, active_layer_modes: Set<GraphLayerMode>): boolean {
  return active_layer_modes.has(edge.layer_mode);
}

function unique_ids(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function create_reading_lens(mode: GraphViewIntent, values?: Partial<GraphReadingLens>): GraphReadingLens {
  return {
    mode,
    anchor_node_ids: unique_ids(values?.anchor_node_ids ?? []),
    anchor_edge_ids: unique_ids(values?.anchor_edge_ids ?? []),
    context_node_ids: unique_ids(values?.context_node_ids ?? []),
    context_edge_ids: unique_ids(values?.context_edge_ids ?? []),
  };
}

function build_semantic_degree_map(edges: RenderEdge[]): Map<string, number> {
  const semantic_degree_map = new Map<string, number>();
  for (const edge of edges) {
    if (!is_semantic_edge(edge) || is_provenance_edge(edge)) {
      continue;
    }
    semantic_degree_map.set(edge.source, (semantic_degree_map.get(edge.source) ?? 0) + 1);
    semantic_degree_map.set(edge.target, (semantic_degree_map.get(edge.target) ?? 0) + 1);
  }
  return semantic_degree_map;
}

function build_semantic_components(nodes: RenderNode[], edges: RenderEdge[]): SemanticComponentRecord[] {
  const semantic_nodes = nodes.filter(is_entity_semantic_node);
  const semantic_node_ids = new Set(semantic_nodes.map((node) => node.id));
  const semantic_edges = edges.filter(
    (edge) => is_semantic_edge(edge) && semantic_node_ids.has(edge.source) && semantic_node_ids.has(edge.target),
  );
  const adjacency = new Map<string, string[]>();
  const edge_ids_by_node_id = new Map<string, string[]>();

  semantic_nodes.forEach((node) => {
    adjacency.set(node.id, []);
    edge_ids_by_node_id.set(node.id, []);
  });

  semantic_edges.forEach((edge) => {
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
    edge_ids_by_node_id.get(edge.source)?.push(edge.id);
    edge_ids_by_node_id.get(edge.target)?.push(edge.id);
  });

  const node_map = new Map(semantic_nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const components: SemanticComponentRecord[] = [];

  semantic_nodes.forEach((node) => {
    if (visited.has(node.id)) {
      return;
    }

    const queue = [node.id];
    const component_node_ids: string[] = [];
    const component_edge_ids = new Set<string>();
    visited.add(node.id);

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

    const evidence_score = component_node_ids.reduce(
      (total, node_id) => total + (node_map.get(node_id)?.evidence_count ?? 0),
      0,
    );
    components.push({
      node_ids: component_node_ids,
      edge_ids: [...component_edge_ids],
      score: component_edge_ids.size * 4 + component_node_ids.length * 1.5 + evidence_score * 0.35,
    });
  });

  return components;
}

function apply_projection_emphasis(nodes: RenderNode[], edges: RenderEdge[]): RenderNode[] {
  const semantic_degree_map = build_semantic_degree_map(edges);

  return nodes.map((node) => {
    if (is_entity_semantic_node(node)) {
      const semantic_degree = semantic_degree_map.get(node.id) ?? 0;
      const evidence_score = Math.min(node.evidence_count ?? 0, 8);
      const scale =
        semantic_degree > 0
          ? 1 + Math.min(0.42, semantic_degree * 0.08 + evidence_score * 0.03)
          : 0.82 + Math.min(0.1, evidence_score * 0.02);
      return {
        ...node,
        radius: Math.max(10, Math.min(32, node.radius * scale)),
      };
    }

    return {
      ...node,
      radius: Math.max(8, node.radius * 0.9),
    };
  });
}

function build_projection_summary(
  scope: ProjectionScopeRecord,
  nodes: RenderNode[],
  edges: RenderEdge[],
): GraphProjectionSummary {
  const visible_component_count = build_semantic_components(nodes, edges).length;
  return {
    scope_node_count: scope.scope_node_count,
    scope_edge_count: scope.scope_edge_count,
    visible_node_count: nodes.length,
    visible_edge_count: edges.length,
    visible_entity_count: nodes.filter(is_entity_semantic_node).length,
    visible_semantic_edge_count: edges.filter(
      (edge) => is_semantic_edge(edge) && !is_provenance_edge(edge),
    ).length,
    visible_source_anchor_count: nodes.filter(is_source_context_node).length,
    visible_provenance_edge_count: edges.filter(is_provenance_edge).length,
    focus_component_count: visible_component_count,
    hidden_component_count: Math.max(scope.total_semantic_component_count - visible_component_count, 0),
  };
}

function finalize_projection(
  scope: ProjectionScopeRecord,
  nodes: RenderNode[],
  edges: RenderEdge[],
  reading_lens: GraphReadingLens,
): ProjectedGraphRecord {
  const emphasized_nodes = apply_projection_emphasis(nodes, edges);
  return {
    nodes: emphasized_nodes,
    edges,
    summary: build_projection_summary(scope, emphasized_nodes, edges),
    reading_lens: create_reading_lens(reading_lens.mode, {
      anchor_node_ids: reading_lens.anchor_node_ids,
      anchor_edge_ids: reading_lens.anchor_edge_ids,
      context_node_ids: emphasized_nodes.map((node) => node.id),
      context_edge_ids: edges.map((edge) => edge.id),
    }),
  };
}

function build_semantic_component_lookup(
  components: SemanticComponentRecord[],
): Map<string, SemanticComponentRecord> {
  const component_by_node_id = new Map<string, SemanticComponentRecord>();
  components.forEach((component) => {
    component.node_ids.forEach((node_id) => {
      component_by_node_id.set(node_id, component);
    });
  });
  return component_by_node_id;
}

function resolve_provenance_edge_endpoints(
  edge: RenderEdge,
  node_map: Map<string, RenderNode>,
): ProvenanceEndpointsRecord | null {
  if (!is_provenance_edge(edge)) {
    return null;
  }
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
  return {
    source_node_id: source_like_node.id,
    semantic_node_id: source_like_node.id === edge.source ? edge.target : edge.source,
  };
}

function resolve_component_stable_id(component: SemanticComponentRecord): string {
  return [...component.node_ids].sort((left, right) => left.localeCompare(right, 'zh-CN'))[0] ?? 'component';
}

function resolve_bundle_representative_node_id(
  candidate_node_ids: string[],
  node_map: Map<string, RenderNode>,
  semantic_degree_map: Map<string, number>,
  pinned_node_ids: Set<string>,
): string | null {
  const ranked_candidates = candidate_node_ids
    .map((node_id) => node_map.get(node_id))
    .filter((node): node is RenderNode => Boolean(node && is_entity_semantic_node(node)))
    .sort((left, right) => {
      const left_pinned = pinned_node_ids.has(left.id) ? 1 : 0;
      const right_pinned = pinned_node_ids.has(right.id) ? 1 : 0;
      if (right_pinned !== left_pinned) {
        return right_pinned - left_pinned;
      }
      const left_degree = semantic_degree_map.get(left.id) ?? 0;
      const right_degree = semantic_degree_map.get(right.id) ?? 0;
      if (right_degree !== left_degree) {
        return right_degree - left_degree;
      }
      if (right.radius !== left.radius) {
        return right.radius - left.radius;
      }
      const left_score = left.score ?? 0;
      const right_score = right.score ?? 0;
      if (right_score !== left_score) {
        return right_score - left_score;
      }
      return left.id.localeCompare(right.id, 'zh-CN');
    });

  return ranked_candidates[0]?.id ?? null;
}

function collect_grouped_provenance_scope(
  nodes: RenderNode[],
  edges: RenderEdge[],
  semantic_node_ids: Set<string>,
  anchor_node_ids: Set<string>,
  max_edges_per_source: number,
): { node_ids: Set<string>; edge_ids: Set<string> } {
  const node_map = new Map(nodes.map((node) => [node.id, node]));
  const grouped_edges = new Map<string, RenderEdge[]>();

  edges.forEach((edge) => {
    if (!is_provenance_edge(edge)) {
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
    if (!source_like_node || !semantic_node_ids.has(semantic_side_node_id)) {
      return;
    }
    const edge_list = grouped_edges.get(source_like_node.id) ?? [];
    edge_list.push(edge);
    grouped_edges.set(source_like_node.id, edge_list);
  });

  const kept_node_ids = new Set<string>();
  const kept_edge_ids = new Set<string>();

  grouped_edges.forEach((source_edges, source_node_id) => {
    const ranked_edges = [...source_edges].sort((left, right) => {
      const left_entity_id = left.source === source_node_id ? left.target : left.source;
      const right_entity_id = right.source === source_node_id ? right.target : right.source;
      const left_anchor_score = anchor_node_ids.has(left_entity_id) ? 1 : 0;
      const right_anchor_score = anchor_node_ids.has(right_entity_id) ? 1 : 0;
      if (right_anchor_score !== left_anchor_score) {
        return right_anchor_score - left_anchor_score;
      }
      const left_evidence = node_map.get(left_entity_id)?.evidence_count ?? 0;
      const right_evidence = node_map.get(right_entity_id)?.evidence_count ?? 0;
      if (right_evidence !== left_evidence) {
        return right_evidence - left_evidence;
      }
      return left_entity_id.localeCompare(right_entity_id, 'zh-CN');
    });

    ranked_edges.slice(0, max_edges_per_source).forEach((edge) => {
      kept_edge_ids.add(edge.id);
      kept_node_ids.add(edge.source);
      kept_node_ids.add(edge.target);
    });
  });

  return { node_ids: kept_node_ids, edge_ids: kept_edge_ids };
}

function build_global_semantic_overview(
  scope: ProjectionScopeRecord,
  nodes: RenderNode[],
  edges: RenderEdge[],
  pinned_node_ids: Set<string>,
  pinned_edge_ids: Set<string>,
): ProjectedGraphRecord {
  const semantic_nodes = nodes.filter(is_entity_semantic_node);
  if (!semantic_nodes.length) {
    return finalize_projection(scope, nodes, edges, create_reading_lens('overview'));
  }
  const node_map = new Map(nodes.map((node) => [node.id, node]));
  const semantic_components = build_semantic_components(nodes, edges);
  const component_by_node_id = build_semantic_component_lookup(semantic_components);
  const semantic_degree_map = build_semantic_degree_map(edges);
  const expanded_source_node_ids = new Set(
    [...pinned_node_ids].filter((node_id) => {
      const node = node_map.get(node_id);
      return Boolean(node && is_source_context_node(node));
    }),
  );
  const expanded_semantic_node_ids = new Set(
    [...pinned_node_ids].filter((node_id) => {
      const node = node_map.get(node_id);
      return Boolean(node && is_entity_semantic_node(node));
    }),
  );
  const kept_edges: RenderEdge[] = [];
  const bundle_groups = new Map<string, ProvenanceBundleGroupRecord>();

  edges.forEach((edge) => {
    if (!is_provenance_edge(edge)) {
      kept_edges.push(edge);
      return;
    }

    const endpoints = resolve_provenance_edge_endpoints(edge, node_map);
    if (!endpoints) {
      kept_edges.push(edge);
      return;
    }

    const component = component_by_node_id.get(endpoints.semantic_node_id);
    if (!component) {
      kept_edges.push(edge);
      return;
    }

    const component_id = resolve_component_stable_id(component);
    const group_key = `${endpoints.source_node_id}::${component_id}`;
    const group = bundle_groups.get(group_key) ?? {
      source_node_id: endpoints.source_node_id,
      component_id,
      raw_edges: [],
      semantic_node_ids: new Set<string>(),
    };
    group.raw_edges.push(edge);
    group.semantic_node_ids.add(endpoints.semantic_node_id);
    bundle_groups.set(group_key, group);
  });

  bundle_groups.forEach((group) => {
    if (expanded_source_node_ids.has(group.source_node_id)) {
      kept_edges.push(...group.raw_edges);
      return;
    }

    const expanded_raw_edges = group.raw_edges.filter((edge) => {
      if (pinned_edge_ids.has(edge.id)) {
        return true;
      }
      const endpoints = resolve_provenance_edge_endpoints(edge, node_map);
      return Boolean(endpoints && expanded_semantic_node_ids.has(endpoints.semantic_node_id));
    });
    if (expanded_raw_edges.length) {
      kept_edges.push(...expanded_raw_edges);
    }

    const expanded_raw_edge_ids = new Set(expanded_raw_edges.map((edge) => edge.id));
    const remaining_edges = group.raw_edges.filter((edge) => !expanded_raw_edge_ids.has(edge.id));
    if (!remaining_edges.length) {
      return;
    }

    const remaining_semantic_node_ids = Array.from(
      new Set(
        remaining_edges
          .map((edge) => resolve_provenance_edge_endpoints(edge, node_map)?.semantic_node_id ?? null)
          .filter((node_id): node_id is string => Boolean(node_id)),
      ),
    );
    const representative_node_id = resolve_bundle_representative_node_id(
      remaining_semantic_node_ids,
      node_map,
      semantic_degree_map,
      pinned_node_ids,
    );
    if (!representative_node_id) {
      kept_edges.push(...remaining_edges);
      return;
    }

    kept_edges.push({
      id: `bundle:${group.source_node_id}:${group.component_id}`,
      source: group.source_node_id,
      target: representative_node_id,
      type: 'provenance',
      label: '来源锚点',
      display_label: '来源锚点',
      short_label: '来源锚点',
      relation_kind_label: '来源锚点',
      source_name: node_map.get(group.source_node_id)?.display_label ?? null,
      evidence_paragraph_id: null,
      layer_mode: 'semantic',
      is_structural: false,
      color: GRAPH_EDGE_COLORS.provenance ?? 0x9ca3af,
      weight: Math.max(
        0.75,
        remaining_edges.reduce((total, edge) => total + Math.max(edge.weight || 0, 0.5), 0) /
          remaining_edges.length,
      ),
      metadata: {
        aggregate_kind: 'source_bundle',
        related_node_ids: remaining_semantic_node_ids,
        related_edge_ids: remaining_edges.map((edge) => edge.id),
        related_count: remaining_semantic_node_ids.length,
        source_node_id: group.source_node_id,
      },
      aggregate_kind: 'source_bundle',
      related_node_ids: remaining_semantic_node_ids,
      related_edge_ids: remaining_edges.map((edge) => edge.id),
      related_count: remaining_semantic_node_ids.length,
    });
  });

  return finalize_projection(
    scope,
    nodes,
    kept_edges,
    create_reading_lens('overview', {
      anchor_node_ids: [...pinned_node_ids],
      anchor_edge_ids: [...pinned_edge_ids],
    }),
  );
}

function build_global_reading_scope(
  scope: ProjectionScopeRecord,
  nodes: RenderNode[],
  edges: RenderEdge[],
  pinned_node_ids: Set<string>,
  pinned_edge_ids: Set<string>,
): ProjectedGraphRecord {
  const node_map = new Map(nodes.map((node) => [node.id, node]));
  const edge_map = new Map(edges.map((edge) => [edge.id, edge]));
  const edges_by_node_id = new Map<string, RenderEdge[]>();

  nodes.forEach((node) => {
    edges_by_node_id.set(node.id, []);
  });
  edges.forEach((edge) => {
    edges_by_node_id.get(edge.source)?.push(edge);
    edges_by_node_id.get(edge.target)?.push(edge);
  });

  const anchor_node_ids = new Set<string>();
  const anchor_edge_ids = new Set<string>();
  pinned_node_ids.forEach((node_id) => {
    if (!node_map.has(node_id)) {
      return;
    }
    anchor_node_ids.add(node_id);
    edges_by_node_id.get(node_id)?.forEach((edge) => anchor_edge_ids.add(edge.id));
  });
  pinned_edge_ids.forEach((edge_id) => {
    const edge = edge_map.get(edge_id);
    if (!edge) {
      return;
    }
    anchor_edge_ids.add(edge.id);
    anchor_node_ids.add(edge.source);
    anchor_node_ids.add(edge.target);
  });

  const kept_node_ids = new Set<string>(anchor_node_ids);
  const kept_edge_ids = new Set<string>(anchor_edge_ids);
  const anchor_entity_node_ids = new Set<string>(
    [...anchor_node_ids].filter((node_id) => {
      const node = node_map.get(node_id);
      return Boolean(node && is_entity_semantic_node(node));
    }),
  );
  const component_by_node_id = build_semantic_component_lookup(build_semantic_components(nodes, edges));
  anchor_node_ids.forEach((node_id) => {
    const component = component_by_node_id.get(node_id);
    if (!component) {
      return;
    }
    component.node_ids.forEach((component_node_id) => kept_node_ids.add(component_node_id));
    component.edge_ids.forEach((component_edge_id) => kept_edge_ids.add(component_edge_id));
  });

  if (!kept_node_ids.size && !kept_edge_ids.size) {
    return build_global_semantic_overview(scope, nodes, edges, pinned_node_ids, pinned_edge_ids);
  }

  edges.forEach((edge) => {
    if (is_semantic_edge(edge) && kept_node_ids.has(edge.source) && kept_node_ids.has(edge.target)) {
      kept_edge_ids.add(edge.id);
    }
  });

  const kept_semantic_component_node_ids = new Set<string>(
    [...kept_node_ids].filter((node_id) => {
      const node = node_map.get(node_id);
      return Boolean(node && is_entity_semantic_node(node));
    }),
  );
  const grouped_provenance_scope = collect_grouped_provenance_scope(
    nodes,
    edges,
    kept_semantic_component_node_ids,
    anchor_entity_node_ids,
    3,
  );
  grouped_provenance_scope.node_ids.forEach((node_id) => kept_node_ids.add(node_id));
  grouped_provenance_scope.edge_ids.forEach((edge_id) => kept_edge_ids.add(edge_id));

  const projected_nodes = nodes.filter((node) => kept_node_ids.has(node.id));
  const projected_node_ids = new Set(projected_nodes.map((node) => node.id));
  const projected_edges = edges.filter(
    (edge) =>
      kept_edge_ids.has(edge.id) &&
      projected_node_ids.has(edge.source) &&
      projected_node_ids.has(edge.target),
  );

  return finalize_projection(
    scope,
    projected_nodes,
    projected_edges,
    create_reading_lens('reading', {
      anchor_node_ids: [...anchor_node_ids],
      anchor_edge_ids: [...anchor_edge_ids],
    }),
  );
}

function build_local_scope(
  nodes: RenderNode[],
  edges: RenderEdge[],
  local_graph_state: LocalGraphState,
): { node_ids: Set<string>; edge_ids: Set<string> } | null {
  const anchor_node_id = local_graph_state.anchor_node_id;
  if (!anchor_node_id) {
    return null;
  }

  const node_map = new Map(nodes.map((node) => [node.id, node]));
  const anchor_node = node_map.get(anchor_node_id) ?? null;
  if (!anchor_node || !is_entity_semantic_node(anchor_node)) {
    return null;
  }

  const scoped_node_ids = new Set<string>([anchor_node_id]);
  const scoped_edge_ids = new Set<string>();

  edges.forEach((edge) => {
    if (!is_semantic_edge(edge)) {
      return;
    }
    if (edge.source === anchor_node_id || edge.target === anchor_node_id) {
      scoped_edge_ids.add(edge.id);
      scoped_node_ids.add(edge.source);
      scoped_node_ids.add(edge.target);
    }
  });

  edges.forEach((edge) => {
    if (is_semantic_edge(edge) && scoped_node_ids.has(edge.source) && scoped_node_ids.has(edge.target)) {
      scoped_edge_ids.add(edge.id);
    }
  });

  edges.forEach((edge) => {
    if (!is_provenance_edge(edge)) {
      return;
    }
    if (!scoped_node_ids.has(edge.source) && !scoped_node_ids.has(edge.target)) {
      return;
    }
  });

  const grouped_provenance_scope = collect_grouped_provenance_scope(
    nodes,
    edges,
    new Set(
      [...scoped_node_ids].filter((node_id) => {
        const node = node_map.get(node_id);
        return Boolean(node && is_entity_semantic_node(node));
      }),
    ),
    new Set([anchor_node_id]),
    3,
  );
  grouped_provenance_scope.node_ids.forEach((node_id) => scoped_node_ids.add(node_id));
  grouped_provenance_scope.edge_ids.forEach((edge_id) => scoped_edge_ids.add(edge_id));

  return { node_ids: scoped_node_ids, edge_ids: scoped_edge_ids };
}

export function project_graph(graph: KnowledgeGraphRecord, options: ProjectGraphOptions): ProjectedGraphRecord {
  const active_layer_modes = new Set(options.active_layer_modes);
  const render_nodes = graph.nodes.map(to_render_node);
  const render_edges = graph.edges.map(to_render_edge);
  const render_node_map = new Map(render_nodes.map((node) => [node.id, node]));
  const render_edge_map = new Map(render_edges.map((edge) => [edge.id, edge]));

  const visible_node_ids = new Set(
    render_nodes.filter((node) => include_node_by_layers(node, active_layer_modes)).map((node) => node.id),
  );
  const visible_edge_ids = new Set(
    render_edges
      .filter((edge) => include_edge_by_layers(edge, active_layer_modes))
      .filter((edge) => visible_node_ids.has(edge.source) && visible_node_ids.has(edge.target))
      .map((edge) => edge.id),
  );

  const pinned_node_ids = new Set(
    [options.selected_node_id, ...options.highlighted_node_ids].filter(Boolean) as string[],
  );
  const pinned_edge_ids = new Set(
    [options.selected_edge_id, ...options.highlighted_edge_ids].filter(Boolean) as string[],
  );

  function include_visible_context(node_id: string): void {
    for (const edge of render_edges) {
      if (!visible_edge_ids.has(edge.id)) {
        continue;
      }
      if (edge.source !== node_id && edge.target !== node_id) {
        continue;
      }
      visible_node_ids.add(edge.source);
      visible_node_ids.add(edge.target);
    }
  }

  pinned_node_ids.forEach((node_id) => {
    if (visible_node_ids.has(node_id)) {
      include_visible_context(node_id);
      return;
    }

    const pinned_node = render_node_map.get(node_id);
    if (!pinned_node) {
      return;
    }

    visible_node_ids.add(node_id);
    render_edges.forEach((edge) => {
      if (edge.source !== node_id && edge.target !== node_id) {
        return;
      }
      visible_edge_ids.add(edge.id);
      visible_node_ids.add(edge.source);
      visible_node_ids.add(edge.target);
    });
  });

  pinned_edge_ids.forEach((edge_id) => {
    const edge = render_edge_map.get(edge_id);
    if (!edge) {
      return;
    }
    visible_edge_ids.add(edge_id);
    visible_node_ids.add(edge.source);
    visible_node_ids.add(edge.target);
  });

  let projected_edges = render_edges.filter(
    (edge) =>
      visible_edge_ids.has(edge.id) &&
      visible_node_ids.has(edge.source) &&
      visible_node_ids.has(edge.target),
  );
  let projected_nodes = render_nodes.filter((node) => visible_node_ids.has(node.id));

  const projection_scope: ProjectionScopeRecord = {
    scope_node_count: graph.nodes.length,
    scope_edge_count: graph.edges.length,
    total_semantic_component_count: build_semantic_components(projected_nodes, projected_edges).length,
  };
  const active_graph_view = graph.view ?? (options.active_layer_modes[0] ?? 'semantic');
  const is_semantic_view = active_graph_view === 'semantic';
  const semantic_projection_pinned_node_ids = new Set(
    [...pinned_node_ids].filter((node_id) =>
      is_projection_semantic_anchor_node(render_node_map.get(node_id)),
    ),
  );
  const semantic_projection_pinned_edge_ids = new Set(
    [...pinned_edge_ids].filter((edge_id) => {
      const edge = render_edge_map.get(edge_id);
      return Boolean(edge && edge.layer_mode === 'semantic' && edge.type !== 'provenance');
    }),
  );
  const base_reading_lens = create_reading_lens('reading', {
    anchor_node_ids: unique_ids(
      [options.selected_node_id, ...options.highlighted_node_ids].filter(Boolean) as string[],
    ),
    anchor_edge_ids: unique_ids(
      [options.selected_edge_id, ...options.highlighted_edge_ids].filter(Boolean) as string[],
    ),
  });

  if (options.graph_view_mode === 'local' && is_semantic_view) {
    const local_scope = build_local_scope(projected_nodes, projected_edges, options.local_graph_state);
    if (local_scope) {
      projected_nodes = projected_nodes.filter((node) => local_scope.node_ids.has(node.id));
      projected_edges = projected_edges.filter(
        (edge) =>
          local_scope.edge_ids.has(edge.id) &&
          local_scope.node_ids.has(edge.source) &&
          local_scope.node_ids.has(edge.target),
      );
    }
    return finalize_projection(projection_scope, projected_nodes, projected_edges, base_reading_lens);
  }

  if (options.graph_view_mode === 'local') {
    return finalize_projection(projection_scope, projected_nodes, projected_edges, base_reading_lens);
  }

  if (options.graph_view_mode === 'global' && options.reading_mode === 'reading' && is_semantic_view) {
    if (!semantic_projection_pinned_node_ids.size && !semantic_projection_pinned_edge_ids.size) {
      return build_global_semantic_overview(
        projection_scope,
        projected_nodes,
        projected_edges,
        pinned_node_ids,
        pinned_edge_ids,
      );
    }
    return build_global_reading_scope(
      projection_scope,
      projected_nodes,
      projected_edges,
      semantic_projection_pinned_node_ids,
      semantic_projection_pinned_edge_ids,
    );
  }

  if (options.graph_view_mode === 'global' && is_semantic_view) {
    return build_global_semantic_overview(
      projection_scope,
      projected_nodes,
      projected_edges,
      pinned_node_ids,
      pinned_edge_ids,
    );
  }

  return finalize_projection(
    projection_scope,
    projected_nodes,
    projected_edges,
    create_reading_lens(options.reading_mode, {
      anchor_node_ids: base_reading_lens.anchor_node_ids,
      anchor_edge_ids: base_reading_lens.anchor_edge_ids,
    }),
  );
}
