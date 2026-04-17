import {
  Application,
  CanvasTextMetrics,
  Container,
  Graphics,
  Rectangle,
  Text,
  TextStyle,
  type FederatedPointerEvent,
} from 'pixi.js';
import { Viewport } from 'pixi-viewport';

import type { ResolvedTheme } from '../../../../theme';
import type {
  GraphReadingLens,
  GraphViewMode,
  GraphViewportMode,
} from '../../shared/types/knowledge_base_types';
import { build_graph_layout } from './graph_layout_engine';
import {
  build_edge_hover_card_at,
  build_node_hover_card_at,
  type HoverCardState,
} from './graph_canvas_tooltip';
import {
  resolve_component_size_map,
  resolve_label_priority_node_ids,
  resolve_node_degree_map,
  resolve_edge_alpha,
  resolve_edge_width,
  resolve_node_fill_alpha,
  resolve_node_halo_width,
  resolve_node_label_alpha,
  resolve_node_radius,
  should_show_edge_label,
  should_show_node_label,
} from './graph_readability';
import type { GraphLayoutMap, RenderEdge, RenderNode } from './graph_render_types';
import { GRAPH_EDGE_RENDER_COLORS, GRAPH_SIDECAR_TOKENS } from './graph_visual_tokens';

interface GraphRuntimeSceneState {
  graph_view_mode: GraphViewMode;
  reading_lens: GraphReadingLens;
  nodes: RenderNode[];
  edges: RenderEdge[];
  selected_node_id: string | null;
  selected_edge_id: string | null;
  highlighted_node_ids: string[];
  highlighted_edge_ids: string[];
}

type HoverTarget =
  | { type: 'node'; node: RenderNode; x: number; y: number }
  | { type: 'edge'; edge: RenderEdge; source_label: string; target_label: string; x: number; y: number }
  | null;

interface GraphRuntimeOptions {
  container: HTMLDivElement;
  resolved_theme: ResolvedTheme;
  on_select_node: (node_id: string) => void;
  on_select_edge: (edge_id: string) => void;
  on_clear_selection: () => void;
  on_hover_change: (hover_card: HoverCardState | null) => void;
}

interface SourceSidecarGroupRecord {
  node: RenderNode;
  point: { x: number; y: number };
  related_count: number;
}

interface SourceSidecarGeometryRecord {
  subtitle_text: string;
  card_x: number;
  card_y: number;
  card_width: number;
  card_height: number;
  title_x: number;
  title_y: number;
  subtitle_x: number;
  subtitle_y: number;
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

interface RectBoundsRecord {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

interface MeasuredTextRecord {
  width: number;
  height: number;
}

interface EdgeRenderPointsRecord {
  source_point: { x: number; y: number };
  target_point: { x: number; y: number };
}

interface LabelPlacementRecord {
  x: number;
  y: number;
  bounds: RectBoundsRecord;
}

const GRAPH_FONT_FAMILY = 'Microsoft YaHei UI, PingFang SC, Noto Sans SC, sans-serif';

const NODE_LABEL_METRIC_STYLE = new TextStyle({
  fontFamily: GRAPH_FONT_FAMILY,
  fontSize: 11,
  fontWeight: '600',
  fill: 0x000000,
});

const EDGE_LABEL_METRIC_STYLE = new TextStyle({
  fontFamily: GRAPH_FONT_FAMILY,
  fontSize: 11,
  fontWeight: '600',
  fill: 0x000000,
});

const SIDECAR_TITLE_METRIC_STYLE = new TextStyle({
  fontFamily: GRAPH_FONT_FAMILY,
  fontSize: 11,
  fontWeight: '700',
  fill: 0x000000,
});

const SIDECAR_SUBTITLE_METRIC_STYLE = new TextStyle({
  fontFamily: GRAPH_FONT_FAMILY,
  fontSize: 10,
  fontWeight: '600',
  fill: 0x000000,
});

function clamp(value: number, min_value: number, max_value: number): number {
  return Math.min(max_value, Math.max(min_value, value));
}

function rects_overlap(
  left: RectBoundsRecord,
  right: RectBoundsRecord,
  padding = 0,
): boolean {
  return !(
    left.max_x + padding < right.min_x ||
    right.max_x + padding < left.min_x ||
    left.max_y + padding < right.min_y ||
    right.max_y + padding < left.min_y
  );
}

function to_alpha(value: number): number {
  return clamp(value, 0.08, 1);
}

function resolve_theme_palette(resolved_theme: ResolvedTheme) {
  const is_dark = resolved_theme === 'dark';
  return {
    background_label_fill: is_dark ? 0x0f1720 : 0xffffff,
    background_label_alpha: is_dark ? 0.76 : 0.84,
    node_text: is_dark ? 0xf8fafc : 0x163447,
    edge_text: is_dark ? 0xe2edf4 : 0x315061,
    halo: is_dark ? 0xf8fafc : 0x173f56,
    sidecar_fill: is_dark ? GRAPH_SIDECAR_TOKENS.fill_dark : GRAPH_SIDECAR_TOKENS.fill_light,
    sidecar_fill_alpha: is_dark ? 0.34 : 0.52,
    sidecar_stroke: is_dark ? GRAPH_SIDECAR_TOKENS.stroke_dark : GRAPH_SIDECAR_TOKENS.stroke_light,
    sidecar_stroke_alpha: is_dark ? 0.68 : 0.58,
    sidecar_title: is_dark ? GRAPH_SIDECAR_TOKENS.title_dark : GRAPH_SIDECAR_TOKENS.title_light,
  };
}

function make_text_style(color: number): TextStyle {
  return new TextStyle({
    fontFamily: GRAPH_FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    fill: color,
  });
}

function is_source_context_node(node: RenderNode): boolean {
  return node.type === 'source' || node.type === 'workbook';
}

function is_compact_context_node(node: RenderNode): boolean {
  return is_source_context_node(node) || node.type === 'paragraph' || node.type === 'record';
}

function is_source_bundle_edge(edge: RenderEdge): boolean {
  return edge.aggregate_kind === 'source_bundle';
}

function is_sidecar_mode(scene_state: GraphRuntimeSceneState): boolean {
  return scene_state.reading_lens.mode === 'reading' || scene_state.graph_view_mode === 'local';
}

function build_source_sidecar_groups(
  scene_state: GraphRuntimeSceneState,
  layout_positions: GraphLayoutMap,
): SourceSidecarGroupRecord[] {
  const node_map = new Map(scene_state.nodes.map((node) => [node.id, node]));
  const related_node_ids_by_source = new Map<string, Set<string>>();

  scene_state.edges.forEach((edge) => {
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
    const semantic_node_id = source_like_node?.id === edge.source ? edge.target : edge.source;
    if (!source_like_node || !layout_positions.has(source_like_node.id) || !layout_positions.has(semantic_node_id)) {
      return;
    }
    const related_node_ids = related_node_ids_by_source.get(source_like_node.id) ?? new Set<string>();
    related_node_ids.add(semantic_node_id);
    related_node_ids_by_source.set(source_like_node.id, related_node_ids);
  });

  return [...related_node_ids_by_source.entries()]
    .map(([node_id, related_node_ids]) => {
      const node = node_map.get(node_id);
      const point = layout_positions.get(node_id);
      if (!node || !point) {
        return null;
      }
      return {
        node,
        point,
        related_count: related_node_ids.size,
      };
    })
    .filter(Boolean) as SourceSidecarGroupRecord[];
}

function measure_text(value: string, style: TextStyle): MeasuredTextRecord {
  const metrics = CanvasTextMetrics.measureText(value || ' ', style);
  return {
    width: Math.max(metrics.width, 1),
    height: Math.max(metrics.height, 1),
  };
}

function resolve_source_sidecar_geometry(
  node: RenderNode,
  point: { x: number; y: number },
  related_count: number,
  readability_context: ReturnType<typeof build_readability_context>,
  measured?: { title_width?: number; subtitle_width?: number },
): SourceSidecarGeometryRecord {
  const radius = resolve_node_radius(node, readability_context);
  const subtitle_text = `来源 · ${related_count} 个关联`;
  const title_width = measured?.title_width ?? measure_text(node.display_label, SIDECAR_TITLE_METRIC_STYLE).width;
  const subtitle_width = measured?.subtitle_width ?? measure_text(subtitle_text, SIDECAR_SUBTITLE_METRIC_STYLE).width;
  const card_width = Math.max(title_width + 30, subtitle_width + 30, 152);
  const card_height = 70;
  const card_x = point.x + radius + 28;
  const card_y = point.y - card_height / 2;
  const title_x = card_x + 14;
  const title_y = card_y + 12;
  const subtitle_x = card_x + 14;
  const subtitle_y = title_y + 21;

  return {
    subtitle_text,
    card_x,
    card_y,
    card_width,
    card_height,
    title_x,
    title_y,
    subtitle_x,
    subtitle_y,
    min_x: Math.min(point.x - radius, card_x),
    min_y: Math.min(point.y - radius, card_y),
    max_x: Math.max(point.x + radius, card_x + card_width),
    max_y: Math.max(point.y + radius, card_y + card_height),
  };
}

function resolve_text_bounds(
  x: number,
  y: number,
  width: number,
  height: number,
  padding_x = 6,
  padding_y = 4,
): RectBoundsRecord {
  return {
    min_x: x - padding_x,
    min_y: y - padding_y,
    max_x: x + width + padding_x,
    max_y: y + height + padding_y,
  };
}

function create_label_placement(
  x: number,
  y: number,
  width: number,
  height: number,
): LabelPlacementRecord {
  return {
    x,
    y,
    bounds: resolve_text_bounds(x, y, width, height),
  };
}

function should_force_node_label(
  node: RenderNode,
  readability_context: ReturnType<typeof build_readability_context>,
): boolean {
  return (
    node.id === readability_context.selected_node_id ||
    readability_context.anchor_node_ids.has(node.id) ||
    readability_context.highlighted_node_ids.has(node.id) ||
    readability_context.selected_related_node_ids.has(node.id)
  );
}

function resolve_node_bounds(
  node: RenderNode,
  point: { x: number; y: number },
  readability_context: ReturnType<typeof build_readability_context>,
): RectBoundsRecord {
  const radius = resolve_node_radius(node, readability_context);
  const halo_padding = node.id === readability_context.selected_node_id ? 10 : 4;
  return {
    min_x: point.x - radius - halo_padding,
    min_y: point.y - radius - halo_padding,
    max_x: point.x + radius + halo_padding,
    max_y: point.y + radius + halo_padding,
  };
}

function resolve_node_label_bounds(
  node: RenderNode,
  point: { x: number; y: number },
  readability_context: ReturnType<typeof build_readability_context>,
  sidecar_mode: boolean,
): RectBoundsRecord | null {
  return resolve_node_label_placements(node, point, readability_context, sidecar_mode)?.[0]?.bounds ?? null;
}

function resolve_node_label_placements(
  node: RenderNode,
  point: { x: number; y: number },
  readability_context: ReturnType<typeof build_readability_context>,
  sidecar_mode: boolean,
): LabelPlacementRecord[] | null {
  if (!should_show_node_label(node, readability_context)) {
    return null;
  }
  if (sidecar_mode && is_compact_context_node(node)) {
    return null;
  }
  const label_text =
    node.id === readability_context.selected_node_id ? node.display_label : node.short_label;
  const radius = resolve_node_radius(node, readability_context);
  const label_metrics = measure_text(label_text, NODE_LABEL_METRIC_STYLE);
  const label_width = label_metrics.width;
  const label_height = label_metrics.height;
  const vertical_gap = 8;
  const horizontal_gap = 10;

  return [
    create_label_placement(
      point.x - label_width / 2,
      point.y + radius + vertical_gap,
      label_width,
      label_height,
    ),
    create_label_placement(
      point.x + radius + horizontal_gap,
      point.y - label_height / 2,
      label_width,
      label_height,
    ),
    create_label_placement(
      point.x - label_width / 2,
      point.y - radius - label_height - vertical_gap,
      label_width,
      label_height,
    ),
    create_label_placement(
      point.x - radius - horizontal_gap - label_width,
      point.y - label_height / 2,
      label_width,
      label_height,
    ),
  ];
}

function resolve_edge_render_points(
  edge: RenderEdge,
  layout_positions: GraphLayoutMap,
  scene_state: GraphRuntimeSceneState,
  source_sidecar_group_by_node_id: Map<string, SourceSidecarGroupRecord>,
): EdgeRenderPointsRecord | null {
  const source = layout_positions.get(edge.source);
  const target = layout_positions.get(edge.target);
  if (!source || !target) {
    return null;
  }

  if (!(edge.type === 'provenance' && is_sidecar_mode(scene_state))) {
    return {
      source_point: source,
      target_point: target,
    };
  }

  const node_map = new Map(scene_state.nodes.map((node) => [node.id, node]));
  const source_node = node_map.get(edge.source) ?? null;
  const target_node = node_map.get(edge.target) ?? null;
  const source_like_node = source_node && is_source_context_node(source_node)
    ? source_node
    : target_node && is_source_context_node(target_node)
      ? target_node
      : null;
  const semantic_point = source_like_node?.id === edge.source ? target : source;
  const source_point = source_like_node
    ? source_sidecar_group_by_node_id.get(source_like_node.id)?.point
    : undefined;

  if (source_like_node && source_point) {
    return {
      source_point: semantic_point,
      target_point: source_point,
    };
  }

  return {
    source_point: source,
    target_point: target,
  };
}

function resolve_edge_label_bounds(
  edge: RenderEdge,
  edge_points: EdgeRenderPointsRecord,
  readability_context: ReturnType<typeof build_readability_context>,
): RectBoundsRecord | null {
  return resolve_edge_label_placements(edge, edge_points, readability_context)?.[0]?.bounds ?? null;
}

function resolve_edge_label_placements(
  edge: RenderEdge,
  edge_points: EdgeRenderPointsRecord,
  readability_context: ReturnType<typeof build_readability_context>,
): LabelPlacementRecord[] | null {
  if (!should_show_edge_label(edge, readability_context)) {
    return null;
  }
  const label_metrics = measure_text(edge.short_label, EDGE_LABEL_METRIC_STYLE);
  const midpoint_x = (edge_points.source_point.x + edge_points.target_point.x) / 2;
  const midpoint_y = (edge_points.source_point.y + edge_points.target_point.y) / 2;
  const dx = edge_points.target_point.x - edge_points.source_point.x;
  const dy = edge_points.target_point.y - edge_points.source_point.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const normal_x = -dy / length;
  const normal_y = dx / length;

  return [16, -16, 0].map((offset) =>
    create_label_placement(
      midpoint_x + normal_x * offset - label_metrics.width / 2,
      midpoint_y + normal_y * offset - label_metrics.height / 2,
      label_metrics.width,
      label_metrics.height,
    ),
  );
}

function resolve_edge_stroke(
  edge: RenderEdge,
  readability_context: ReturnType<typeof build_readability_context>,
): { color: number; width: number; alpha: number } {
  const width = resolve_edge_width(edge, readability_context);
  const alpha = to_alpha(resolve_edge_alpha(edge, readability_context));

  if (edge.layer_mode === 'structure') {
    return {
      color: GRAPH_EDGE_RENDER_COLORS.structure,
      width,
      alpha,
    };
  }

  if (edge.layer_mode === 'evidence') {
    return {
      color: GRAPH_EDGE_RENDER_COLORS.evidence,
      width,
      alpha,
    };
  }

  if (edge.type === 'provenance') {
    return {
      color: GRAPH_EDGE_RENDER_COLORS.provenance,
      width: is_source_bundle_edge(edge) ? Math.max(1.1, width * 0.82) : Math.max(1.4, width * 0.9),
      alpha: is_source_bundle_edge(edge) ? Math.min(0.56, alpha) : Math.min(0.72, alpha),
    };
  }

  if (edge.type === 'manual') {
    return {
      color: GRAPH_EDGE_RENDER_COLORS.manual,
      width: width + 0.25,
      alpha: Math.min(1, alpha + 0.04),
    };
  }

  if (edge.type === 'relation') {
    return {
      color: GRAPH_EDGE_RENDER_COLORS.relation,
      width: width + 0.3,
      alpha: Math.min(1, alpha + 0.08),
    };
  }

  return { color: edge.color, width, alpha };
}

function distance_to_segment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function create_signature(
  nodes: RenderNode[],
  edges: RenderEdge[],
  reading_lens: GraphReadingLens,
): string {
  return [
    nodes.map((node) => node.id).join('|'),
    edges.map((edge) => edge.id).join('|'),
    reading_lens.mode,
    reading_lens.anchor_node_ids.join('|'),
    reading_lens.anchor_edge_ids.join('|'),
  ].join('::');
}

function is_interactive_edge(edge: RenderEdge): boolean {
  if (is_source_bundle_edge(edge)) {
    return false;
  }
  return edge.layer_mode !== 'structure' || edge.type.startsWith('contains');
}

function resolve_selection_context(scene_state: GraphRuntimeSceneState): {
  selected_related_edge_ids: Set<string>;
  selected_related_node_ids: Set<string>;
} {
  const selected_related_edge_ids = new Set<string>();
  const selected_related_node_ids = new Set<string>();

  if (scene_state.selected_node_id) {
    for (const edge of scene_state.edges) {
      if (edge.source === scene_state.selected_node_id || edge.target === scene_state.selected_node_id) {
        selected_related_edge_ids.add(edge.id);
        selected_related_node_ids.add(edge.source);
        selected_related_node_ids.add(edge.target);
      }
    }
  }

  if (scene_state.selected_edge_id) {
    const selected_edge = scene_state.edges.find((edge) => edge.id === scene_state.selected_edge_id);
    if (selected_edge) {
      selected_related_node_ids.add(selected_edge.source);
      selected_related_node_ids.add(selected_edge.target);
    }
  }

  return { selected_related_edge_ids, selected_related_node_ids };
}

function build_readability_context(scene_state: GraphRuntimeSceneState) {
  const { selected_related_edge_ids, selected_related_node_ids } = resolve_selection_context(scene_state);
  const highlighted_node_ids = new Set([...scene_state.highlighted_node_ids]);
  const highlighted_edge_ids = new Set([
    ...scene_state.highlighted_edge_ids,
    ...selected_related_edge_ids,
  ]);
  const node_degree_by_id = resolve_node_degree_map(scene_state.edges);
  const component_size_by_node_id = resolve_component_size_map(
    scene_state.nodes,
    scene_state.edges,
  );
  const label_priority_node_ids = resolve_label_priority_node_ids(
    scene_state.nodes,
    scene_state.edges,
  );
  const has_context =
    Boolean(scene_state.selected_node_id || scene_state.selected_edge_id) ||
    highlighted_node_ids.size > 0 ||
    highlighted_edge_ids.size > 0;

  return {
    graph_view_mode: scene_state.graph_view_mode,
    reading_mode: scene_state.reading_lens.mode,
    total_node_count: scene_state.nodes.length,
    has_context,
    selected_node_id: scene_state.selected_node_id,
    selected_edge_id: scene_state.selected_edge_id,
    selected_related_node_ids,
    highlighted_node_ids,
    highlighted_edge_ids,
    highlighted_edge_count: highlighted_edge_ids.size,
    label_priority_node_ids,
    anchor_node_ids: new Set(scene_state.reading_lens.anchor_node_ids),
    anchor_edge_ids: new Set(scene_state.reading_lens.anchor_edge_ids),
    node_degree_by_id,
    component_size_by_node_id,
  };
}

function resolve_focus_node_ids(scene_state: GraphRuntimeSceneState): string[] {
  const focus_node_ids = new Set<string>();

  if (scene_state.selected_node_id) {
    focus_node_ids.add(scene_state.selected_node_id);
    scene_state.edges.forEach((edge) => {
      if (edge.source === scene_state.selected_node_id || edge.target === scene_state.selected_node_id) {
        focus_node_ids.add(edge.source);
        focus_node_ids.add(edge.target);
      }
    });
  }

  if (scene_state.selected_edge_id) {
    const selected_edge = scene_state.edges.find((edge) => edge.id === scene_state.selected_edge_id);
    if (selected_edge) {
      focus_node_ids.add(selected_edge.source);
      focus_node_ids.add(selected_edge.target);
    }
  }

  scene_state.highlighted_node_ids.forEach((node_id) => focus_node_ids.add(node_id));
  scene_state.highlighted_edge_ids.forEach((edge_id) => {
    const highlighted_edge = scene_state.edges.find((edge) => edge.id === edge_id);
    if (!highlighted_edge) {
      return;
    }
    focus_node_ids.add(highlighted_edge.source);
    focus_node_ids.add(highlighted_edge.target);
  });

  return [...focus_node_ids];
}

export class GraphRuntime {
  private readonly container: HTMLDivElement;
  private readonly on_select_node: (node_id: string) => void;
  private readonly on_select_edge: (edge_id: string) => void;
  private readonly on_clear_selection: () => void;
  private readonly on_hover_change: (hover_card: HoverCardState | null) => void;

  private app: Application | null = null;
  private viewport: Viewport | null = null;
  private edge_layer = new Graphics();
  private node_layer = new Graphics();
  private overlay_layer = new Graphics();
  private label_layer = new Container();
  private scene_state: GraphRuntimeSceneState = {
    graph_view_mode: 'global',
    reading_lens: {
      mode: 'overview',
      anchor_node_ids: [],
      anchor_edge_ids: [],
      context_node_ids: [],
      context_edge_ids: [],
    },
    nodes: [],
    edges: [],
    selected_node_id: null,
    selected_edge_id: null,
    highlighted_node_ids: [],
    highlighted_edge_ids: [],
  };
  private layout_positions: GraphLayoutMap = new Map();
  private scene_signature = '';
  private layout_revision = 0;
  private resolved_theme: ResolvedTheme;
  private hover_target: HoverTarget = null;
  private last_viewport_mode: GraphViewportMode = 'fit-all';
  private destroyed = false;

  constructor(options: GraphRuntimeOptions) {
    this.container = options.container;
    this.resolved_theme = options.resolved_theme;
    this.on_select_node = options.on_select_node;
    this.on_select_edge = options.on_select_edge;
    this.on_clear_selection = options.on_clear_selection;
    this.on_hover_change = options.on_hover_change;
  }

  async init(): Promise<void> {
    if (this.app || this.destroyed) {
      return;
    }

    const width = Math.max(1, this.container.clientWidth || 1);
    const height = Math.max(1, this.container.clientHeight || 1);
    const app = new Application();
    await app.init({
      width,
      height,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      backgroundAlpha: 0,
      preference: 'webgl',
    });

    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }

    app.canvas.style.width = '100%';
    app.canvas.style.height = '100%';
    app.canvas.style.display = 'block';
    this.container.replaceChildren(app.canvas);

    const viewport = new Viewport({
      screenWidth: width,
      screenHeight: height,
      worldWidth: width,
      worldHeight: height,
      events: app.renderer.events,
      ticker: app.ticker,
      disableOnContextMenu: true,
    });
    viewport.eventMode = 'static';
    viewport.forceHitArea = new Rectangle(-50000, -50000, 100000, 100000);
    viewport.drag().pinch().wheel({ smooth: 3 }).decelerate().clampZoom({ minScale: 0.08, maxScale: 3.2 });

    viewport.addChild(this.edge_layer);
    viewport.addChild(this.overlay_layer);
    viewport.addChild(this.node_layer);
    viewport.addChild(this.label_layer);
    app.stage.addChild(viewport);

    viewport.on('pointermove', (event: FederatedPointerEvent) => this.handle_pointer_move(event));
    viewport.on('pointerleave', () => this.set_hover_target(null));
    viewport.on('pointertap', (event: FederatedPointerEvent) => this.handle_pointer_tap(event));

    this.app = app;
    this.viewport = viewport;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.on_hover_change(null);
    this.hover_target = null;
    if (this.viewport) {
      this.viewport.removeAllListeners();
      this.viewport.parent?.removeChild(this.viewport);
      this.viewport.destroy({ children: true });
    }
    this.app?.destroy({ removeView: true }, false);
    this.app = null;
    this.viewport = null;
    this.layout_positions = new Map();
    this.scene_signature = '';
  }

  resize(next_mode?: GraphViewportMode): void {
    if (!this.app || !this.viewport) {
      return;
    }
    const width = Math.max(1, this.container.clientWidth || 1);
    const height = Math.max(1, this.container.clientHeight || 1);
    this.app.renderer.resize(width, height);
    this.viewport.resize(width, height);
    this.restore_view(next_mode ?? this.last_viewport_mode);
  }

  set_theme(resolved_theme: ResolvedTheme): void {
    this.resolved_theme = resolved_theme;
    this.render_scene();
  }

  set_scene(scene_state: GraphRuntimeSceneState, layout_revision: number): void {
    this.scene_state = scene_state;
    const signature = create_signature(scene_state.nodes, scene_state.edges, scene_state.reading_lens);
    if (signature !== this.scene_signature || layout_revision !== this.layout_revision) {
      this.layout_positions = build_graph_layout(
        scene_state.nodes,
        scene_state.edges,
        this.layout_positions,
        {
          reading_lens: scene_state.reading_lens,
          graph_view_mode: scene_state.graph_view_mode,
        },
      );
      this.scene_signature = signature;
      this.layout_revision = layout_revision;
    }
    this.render_scene();
  }

  run_viewport_command(command_type: 'fit-all' | 'focus-selection' | 'zoom-in' | 'zoom-out' | 'relayout'): void {
    if (!this.viewport) {
      return;
    }

    if (command_type === 'fit-all') {
      this.last_viewport_mode = 'fit-all';
      this.fit_all();
      return;
    }

    if (command_type === 'focus-selection') {
      if (!this.has_focus_targets()) {
        return;
      }
      this.last_viewport_mode = 'focus-selection';
      this.focus_selection();
      return;
    }

    if (command_type === 'zoom-in') {
      this.viewport.setZoom(clamp(this.viewport.scaled * 1.14, 0.08, 3.2), true);
      return;
    }

    if (command_type === 'zoom-out') {
      this.viewport.setZoom(clamp(this.viewport.scaled / 1.14, 0.08, 3.2), true);
      return;
    }

    if (command_type === 'relayout') {
      this.layout_positions = build_graph_layout(this.scene_state.nodes, this.scene_state.edges, undefined, {
        reading_lens: this.scene_state.reading_lens,
        graph_view_mode: this.scene_state.graph_view_mode,
      });
      this.render_scene();
      this.last_viewport_mode = 'fit-all';
      this.fit_all();
    }
  }

  restore_view(mode: GraphViewportMode): void {
    if (!this.viewport) {
      return;
    }
    this.last_viewport_mode = mode;
    if (mode === 'focus-selection' && this.has_focus_targets()) {
      this.focus_selection();
      return;
    }
    this.fit_all();
  }

  private handle_pointer_move(event: FederatedPointerEvent): void {
    if (!this.viewport || !this.app) {
      return;
    }
    const point = this.viewport.toWorld(event.global);
    const next_hover_target = this.find_hover_target(point.x, point.y);
    if (!next_hover_target) {
      this.app.canvas.style.cursor = 'grab';
      this.set_hover_target(null);
      return;
    }

    this.app.canvas.style.cursor = 'pointer';
    this.set_hover_target(next_hover_target);
  }

  private handle_pointer_tap(event: FederatedPointerEvent): void {
    if (!this.viewport) {
      return;
    }
    const point = this.viewport.toWorld(event.global);
    const target = this.find_hover_target(point.x, point.y);
    if (!target) {
      this.on_clear_selection();
      return;
    }
    if (target.type === 'node') {
      this.on_select_node(target.node.id);
      return;
    }
    this.on_select_edge(target.edge.id);
  }

  private set_hover_target(target: HoverTarget): void {
    if (
      this.hover_target?.type === target?.type &&
      ((target?.type === 'node' && this.hover_target?.type === 'node' && this.hover_target.node.id === target.node.id) ||
        (target?.type === 'edge' && this.hover_target?.type === 'edge' && this.hover_target.edge.id === target.edge.id))
    ) {
      return;
    }

    this.hover_target = target;
    if (!target) {
      this.on_hover_change(null);
      return;
    }

    if (target.type === 'node') {
      this.on_hover_change(build_node_hover_card_at(target.node, target.x, target.y));
      return;
    }

    this.on_hover_change(
      build_edge_hover_card_at(target.edge, target.source_label, target.target_label, target.x, target.y),
    );
  }

  private render_scene(): void {
    if (!this.viewport) {
      return;
    }

    const palette = resolve_theme_palette(this.resolved_theme);
    const node_style = make_text_style(palette.node_text);
    const edge_style = make_text_style(palette.edge_text);
    const readability_context = build_readability_context(this.scene_state);
    const sidecar_mode = is_sidecar_mode(this.scene_state);
    const source_sidecar_groups = build_source_sidecar_groups(this.scene_state, this.layout_positions);
    const source_sidecar_group_by_node_id = new Map(source_sidecar_groups.map((group) => [group.node.id, group]));
    const occupied_bounds: RectBoundsRecord[] = source_sidecar_groups.map((group) =>
      resolve_source_sidecar_geometry(group.node, group.point, group.related_count, readability_context),
    );

    this.edge_layer.clear();
    this.node_layer.clear();
    this.overlay_layer.clear();
    const children = this.label_layer.removeChildren();
    children.forEach((child) => child.destroy());

    this.render_source_sidecars(readability_context, palette, source_sidecar_groups);

    const ordered_edges = [...this.scene_state.edges].sort((left, right) => {
      const priority = (edge: RenderEdge): number => {
        if (edge.layer_mode === 'structure') {
          return 0;
        }
        if (edge.layer_mode === 'evidence') {
          return 1;
        }
        if (edge.type === 'relation') {
          return 2;
        }
        if (edge.type === 'manual') {
          return 3;
        }
        return 1;
      };
      return priority(left) - priority(right);
    });

    const label_candidates: Array<{
      label: Text;
      placements: LabelPlacementRecord[];
      force: boolean;
      priority: number;
      sort_size: number;
      sort_label: string;
    }> = [];

    for (const edge of ordered_edges) {
      const edge_points = resolve_edge_render_points(
        edge,
        this.layout_positions,
        this.scene_state,
        source_sidecar_group_by_node_id,
      );
      if (!edge_points) {
        continue;
      }
      const stroke = resolve_edge_stroke(edge, readability_context);
      this.edge_layer.setStrokeStyle({
        width: stroke.width,
        color: stroke.color,
        alpha: stroke.alpha,
      });
      this.edge_layer.beginPath();
      this.edge_layer.moveTo(edge_points.source_point.x, edge_points.source_point.y);
      this.edge_layer.lineTo(edge_points.target_point.x, edge_points.target_point.y);
      this.edge_layer.stroke();

      const edge_label_placements = resolve_edge_label_placements(edge, edge_points, readability_context);
      if (edge_label_placements?.length) {
        const label = new Text({ text: edge.short_label, style: edge_style });
        label.alpha = 0.92;
        label_candidates.push({
          label,
          placements: edge_label_placements,
          force:
            edge.id === readability_context.selected_edge_id ||
            readability_context.highlighted_edge_ids.has(edge.id) ||
            readability_context.anchor_edge_ids.has(edge.id),
          priority:
            edge.layer_mode === 'evidence' ? 2 : edge.type === 'relation' ? 1 : 0,
          sort_size: stroke.width,
          sort_label: edge.short_label,
        });
      }
    }

    for (const node of this.scene_state.nodes) {
      const point = this.layout_positions.get(node.id);
      if (!point) {
        continue;
      }
      const radius = resolve_node_radius(node, readability_context);
      this.node_layer
        .circle(point.x, point.y, radius)
        .fill({
          color: node.color,
          alpha: resolve_node_fill_alpha(node, readability_context),
        })
        .stroke({
          width: resolve_node_halo_width(node, readability_context),
          color: palette.halo,
          alpha: 0.95,
        });

      if (node.id === this.scene_state.selected_node_id) {
        this.overlay_layer.circle(point.x, point.y, radius + 9).stroke({
          width: 1.5,
          color: palette.halo,
          alpha: 0.28,
        });
      }
      occupied_bounds.push(resolve_node_bounds(node, point, readability_context));

      if (!should_show_node_label(node, readability_context)) {
        continue;
      }
      if (is_compact_context_node(node) && sidecar_mode) {
        continue;
      }

      const label = new Text({
        text: node.id === this.scene_state.selected_node_id ? node.display_label : node.short_label,
        style: node_style,
      });
      label.alpha = resolve_node_label_alpha(node, readability_context);
      const label_placements = resolve_node_label_placements(node, point, readability_context, sidecar_mode);
      if (!label_placements?.length) {
        continue;
      }
      label_candidates.push({
        label,
        placements: label_placements,
        force: should_force_node_label(node, readability_context),
        priority: readability_context.label_priority_node_ids.has(node.id) ? 4 : 3,
        sort_size: node.radius,
        sort_label: node.display_label,
      });
    }

    const placed_label_bounds: RectBoundsRecord[] = [];
    label_candidates
      .sort((left, right) => {
        if (left.force !== right.force) {
          return left.force ? -1 : 1;
        }
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        if (left.sort_size !== right.sort_size) {
          return right.sort_size - left.sort_size;
        }
        return left.sort_label.localeCompare(right.sort_label, 'zh-CN');
      })
      .forEach((candidate) => {
        const chosen_placement =
          candidate.placements.find(
            (placement) =>
              !occupied_bounds.some((existing) => rects_overlap(existing, placement.bounds, 5)) &&
              !placed_label_bounds.some((existing) => rects_overlap(existing, placement.bounds, 7)),
          ) ?? (candidate.force ? candidate.placements[0] : null);
        if (!chosen_placement) {
          return;
        }
        candidate.label.x = chosen_placement.x;
        candidate.label.y = chosen_placement.y;
        const background = new Graphics();
        background
          .roundRect(
            chosen_placement.bounds.min_x,
            chosen_placement.bounds.min_y,
            chosen_placement.bounds.max_x - chosen_placement.bounds.min_x,
            chosen_placement.bounds.max_y - chosen_placement.bounds.min_y,
            10,
          )
          .fill({ color: palette.background_label_fill, alpha: palette.background_label_alpha });
        this.label_layer.addChild(background);
        this.label_layer.addChild(candidate.label);
        placed_label_bounds.push(chosen_placement.bounds);
      });
  }

  private render_source_sidecars(
    readability_context: ReturnType<typeof build_readability_context>,
    palette: ReturnType<typeof resolve_theme_palette>,
    source_sidecar_groups: SourceSidecarGroupRecord[],
  ): void {
    if (!is_sidecar_mode(this.scene_state)) {
      return;
    }
    if (!source_sidecar_groups.length) {
      return;
    }

    const title_style = new TextStyle({
      fontFamily: 'Microsoft YaHei UI, PingFang SC, Noto Sans SC, sans-serif',
      fontSize: 11,
      fontWeight: '700',
      fill: palette.sidecar_title,
    });
    const subtitle_style = new TextStyle({
      fontFamily: 'Microsoft YaHei UI, PingFang SC, Noto Sans SC, sans-serif',
      fontSize: 10,
      fontWeight: '600',
      fill: palette.edge_text,
    });

    source_sidecar_groups.forEach((group) => {
      const node = group.node;
      const point = group.point;
      if (!should_show_node_label(node, readability_context)) {
        return;
      }
      const title = new Text({ text: node.display_label, style: title_style });
      const geometry = resolve_source_sidecar_geometry(node, point, group.related_count, readability_context, {
        title_width: title.width,
      });
      const subtitle = new Text({ text: geometry.subtitle_text, style: subtitle_style });

      this.overlay_layer
        .setStrokeStyle({
          width: 1.2,
          color: palette.sidecar_stroke,
          alpha: palette.sidecar_stroke_alpha,
        })
        .roundRect(geometry.card_x, geometry.card_y, geometry.card_width, geometry.card_height, 18)
        .fill({ color: palette.sidecar_fill, alpha: palette.sidecar_fill_alpha })
        .stroke();

      title.alpha = 0.92;
      title.x = geometry.title_x;
      title.y = geometry.title_y;
      subtitle.alpha = 0.84;
      subtitle.x = geometry.subtitle_x;
      subtitle.y = geometry.subtitle_y;
      this.label_layer.addChild(title);
      this.label_layer.addChild(subtitle);
    });
  }
  private has_focus_targets(): boolean {
    return Boolean(
      this.scene_state.selected_node_id ||
        this.scene_state.selected_edge_id ||
        this.scene_state.highlighted_node_ids.length ||
        this.scene_state.highlighted_edge_ids.length,
    );
  }

  private fit_all(): void {
    const readability_context = build_readability_context(this.scene_state);
    const bounds = this.resolve_bounds(
      this.scene_state.nodes.map((node) => node.id),
      readability_context,
    );
    if (!bounds || !this.viewport) {
      return;
    }
    this.apply_bounds(bounds, {
      x: clamp(this.viewport.screenWidth * 0.06, 44, 84),
      y: clamp(this.viewport.screenHeight * 0.1, 72, 132),
    });
  }

  private focus_selection(): void {
    if (!this.viewport) {
      return;
    }

    const readability_context = build_readability_context(this.scene_state);
    const bounds = this.resolve_bounds(
      resolve_focus_node_ids(this.scene_state),
      readability_context,
    );
    if (!bounds) {
      this.fit_all();
      return;
    }
    this.apply_bounds(bounds, {
      x: clamp(this.viewport.screenWidth * 0.09, 64, 108),
      y: clamp(this.viewport.screenHeight * 0.12, 84, 152),
    });
  }

  private resolve_bounds(
    node_ids: string[],
    readability_context = build_readability_context(this.scene_state),
  ): { min_x: number; min_y: number; max_x: number; max_y: number } | null {
    const sidecar_mode = is_sidecar_mode(this.scene_state);
    const node_id_set = new Set(node_ids);
    const source_sidecar_group_by_node_id = new Map(
      build_source_sidecar_groups(this.scene_state, this.layout_positions).map((group) => [
        group.node.id,
        group,
      ]),
    );
    const points = node_ids
      .map((node_id) => {
        const node = this.scene_state.nodes.find((current_node) => current_node.id === node_id);
        const point = this.layout_positions.get(node_id);
        if (!node || !point) {
          return null;
        }
        const source_sidecar_group =
          is_sidecar_mode(this.scene_state) && is_source_context_node(node)
            ? source_sidecar_group_by_node_id.get(node.id)
            : undefined;
        if (source_sidecar_group) {
          return resolve_source_sidecar_geometry(
            node,
            point,
            source_sidecar_group.related_count,
            readability_context,
          );
        }
        const node_bounds = resolve_node_bounds(node, point, readability_context);
        const label_bounds = resolve_node_label_bounds(node, point, readability_context, sidecar_mode);
        return {
          min_x: label_bounds ? Math.min(node_bounds.min_x, label_bounds.min_x) : node_bounds.min_x,
          min_y: label_bounds ? Math.min(node_bounds.min_y, label_bounds.min_y) : node_bounds.min_y,
          max_x: label_bounds ? Math.max(node_bounds.max_x, label_bounds.max_x) : node_bounds.max_x,
          max_y: label_bounds ? Math.max(node_bounds.max_y, label_bounds.max_y) : node_bounds.max_y,
        };
      })
      .filter(Boolean) as Array<{ min_x: number; min_y: number; max_x: number; max_y: number }>;
    const edge_label_bounds = this.scene_state.edges
      .map((edge) => {
        if (!node_id_set.has(edge.source) || !node_id_set.has(edge.target)) {
          return null;
        }
        const edge_points = resolve_edge_render_points(
          edge,
          this.layout_positions,
          this.scene_state,
          source_sidecar_group_by_node_id,
        );
        if (!edge_points) {
          return null;
        }
        return resolve_edge_label_bounds(edge, edge_points, readability_context);
      })
      .filter(Boolean) as Array<{ min_x: number; min_y: number; max_x: number; max_y: number }>;

    if (!points.length && !edge_label_bounds.length) {
      return null;
    }

    const all_bounds = [...points, ...edge_label_bounds];

    return {
      min_x: Math.min(...all_bounds.map((point) => point.min_x)),
      min_y: Math.min(...all_bounds.map((point) => point.min_y)),
      max_x: Math.max(...all_bounds.map((point) => point.max_x)),
      max_y: Math.max(...all_bounds.map((point) => point.max_y)),
    };
  }
  private apply_bounds(
    bounds: { min_x: number; min_y: number; max_x: number; max_y: number },
    padding: number | { x: number; y: number },
  ): void {
    if (!this.viewport) {
      return;
    }
    const width = Math.max(bounds.max_x - bounds.min_x, 1);
    const height = Math.max(bounds.max_y - bounds.min_y, 1);
    const padding_x = typeof padding === 'number' ? padding : padding.x;
    const padding_y = typeof padding === 'number' ? padding : padding.y;
    const scale = clamp(
      Math.min(
        this.viewport.screenWidth / (width + padding_x * 2),
        this.viewport.screenHeight / (height + padding_y * 2),
      ),
      0.08,
      3.2,
    );
    this.viewport.setZoom(scale, false);
    this.viewport.moveCenter((bounds.min_x + bounds.max_x) / 2, (bounds.min_y + bounds.max_y) / 2);
  }

  private find_hover_target(x: number, y: number): HoverTarget {
    const node_hit = this.find_hovered_node(x, y);
    if (node_hit) {
      return node_hit;
    }
    return this.find_hovered_edge(x, y);
  }

  private find_hovered_node(x: number, y: number): HoverTarget {
    const readability_context = build_readability_context(this.scene_state);
    let best: { node: RenderNode; distance: number } | null = null;
    for (const node of this.scene_state.nodes) {
      const point = this.layout_positions.get(node.id);
      if (!point) {
        continue;
      }
      const distance = Math.hypot(point.x - x, point.y - y);
      const radius = resolve_node_radius(node, readability_context);
      if (distance > radius + 8) {
        continue;
      }
      if (!best || distance < best.distance) {
        best = { node, distance };
      }
    }
    if (!best || !this.viewport) {
      return null;
    }
    const screen_point = this.viewport.toScreen({ x, y });
    return { type: 'node', node: best.node, x: screen_point.x + 16, y: screen_point.y + 16 };
  }

  private find_hovered_edge(x: number, y: number): HoverTarget {
    const source_sidecar_group_by_node_id = new Map(
      build_source_sidecar_groups(this.scene_state, this.layout_positions).map((group) => [
        group.node.id,
        group,
      ]),
    );
    let best: { edge: RenderEdge; distance: number } | null = null;
    for (const edge of this.scene_state.edges) {
      if (!is_interactive_edge(edge)) {
        continue;
      }
      const edge_points = resolve_edge_render_points(
        edge,
        this.layout_positions,
        this.scene_state,
        source_sidecar_group_by_node_id,
      );
      if (!edge_points) {
        continue;
      }
      const distance = distance_to_segment(
        x,
        y,
        edge_points.source_point.x,
        edge_points.source_point.y,
        edge_points.target_point.x,
        edge_points.target_point.y,
      );
      const threshold = edge.is_structural ? 8 : 10;
      if (distance > threshold) {
        continue;
      }
      if (!best || distance < best.distance) {
        best = { edge, distance };
      }
    }
    if (!best || !this.viewport) {
      return null;
    }
    const screen_point = this.viewport.toScreen({ x, y });
    const source_label = this.scene_state.nodes.find((node) => node.id === best.edge.source)?.display_label ?? best.edge.source;
    const target_label = this.scene_state.nodes.find((node) => node.id === best.edge.target)?.display_label ?? best.edge.target;
    return {
      type: 'edge',
      edge: best.edge,
      source_label,
      target_label,
      x: screen_point.x + 16,
      y: screen_point.y + 16,
    };
  }
}

