import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { Application, Container, Graphics, Rectangle, Text, TextStyle, type FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';

import type { GraphLayoutNodeSnapshot } from '../model/layoutPersistence';
import type { Neighborhood, RenderEdge, RenderNode, RuntimeProfile, Selection } from '../model/graphModel';

export interface GraphRuntimeScene {
  nodes: RenderNode[];
  edges: RenderEdge[];
  selected: Selection;
  neighborhood: Neighborhood;
  profile: RuntimeProfile;
  show_labels: boolean;
  physics_running: boolean;
  link_distance: number;
  repulsion: number;
}

export interface HoverPayload {
  type: 'node' | 'edge';
  id: string;
  title: string;
  detail: string;
  x: number;
  y: number;
}

export interface GraphRuntimeCallbacks {
  on_select_node: (node_id: string) => void;
  on_select_edge: (edge_id: string) => void;
  on_clear_selection: () => void;
  on_hover_change: (payload: HoverPayload | null) => void;
  on_layout_change: (nodes: GraphLayoutNodeSnapshot[]) => void;
  on_physics_auto_stop: () => void;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  radius: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimEdge extends SimulationLinkDatum<SimNode> {
  id: string;
  weight: number;
}

type HitTarget =
  | { type: 'node'; node: RenderNode }
  | { type: 'edge'; edge: RenderEdge }
  | null;

interface DragState {
  node_id: string;
  pointer_id: number;
  start_x: number;
  start_y: number;
  moved: boolean;
}

const LABEL_STYLE = new TextStyle({
  fontFamily: 'Inter, Microsoft YaHei UI, PingFang SC, system-ui, sans-serif',
  fontSize: 12,
  fontWeight: '600',
  fill: 0xdbeafe,
});

export class GraphRuntime {
  private readonly container: HTMLDivElement;
  private callbacks: GraphRuntimeCallbacks;
  private app: Application | null = null;
  private viewport: Viewport | null = null;
  private edge_layer = new Graphics();
  private node_layer = new Graphics();
  private label_layer = new Container();
  private scene: GraphRuntimeScene | null = null;
  private positions = new Map<string, { x: number; y: number }>();
  private fixed_node_ids = new Set<string>();
  private sim_nodes = new Map<string, SimNode>();
  private simulation: Simulation<SimNode, SimEdge> | null = null;
  private hover: HitTarget = null;
  private render_timer: number | null = null;
  private dragging_node: DragState | null = null;
  private auto_freeze_timer: number | null = null;

  constructor(container: HTMLDivElement, callbacks: GraphRuntimeCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  set_callbacks(callbacks: GraphRuntimeCallbacks): void {
    this.callbacks = callbacks;
  }

  async init(): Promise<void> {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
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
    viewport.forceHitArea = new Rectangle(-80000, -80000, 160000, 160000);
    viewport.drag().pinch().wheel({ smooth: 4 }).decelerate().clampZoom({ minScale: 0.06, maxScale: 4 });
    viewport.addChild(this.edge_layer, this.node_layer, this.label_layer);
    viewport.on('pointerdown', (event: FederatedPointerEvent) => this.handle_pointer_down(event));
    viewport.on('pointermove', (event: FederatedPointerEvent) => this.handle_pointer_move(event));
    viewport.on('pointerup', (event: FederatedPointerEvent) => this.handle_pointer_up(event));
    viewport.on('pointerupoutside', (event: FederatedPointerEvent) => this.handle_pointer_up(event));
    viewport.on('pointerleave', () => this.set_hover(null, null));
    viewport.on('pointertap', (event: FederatedPointerEvent) => this.handle_pointer_tap(event));
    viewport.on('moved', () => this.schedule_render());
    viewport.on('zoomed', () => this.schedule_render());
    app.stage.addChild(viewport);

    this.app = app;
    this.viewport = viewport;
  }

  destroy(): void {
    this.stop_simulation();
    if (this.render_timer !== null) {
      window.clearTimeout(this.render_timer);
    }
    this.clear_auto_freeze_timer();
    this.callbacks.on_hover_change(null);
    this.viewport?.removeAllListeners();
    this.viewport?.destroy({ children: true });
    this.app?.destroy({ removeView: true }, false);
    this.app = null;
    this.viewport = null;
  }

  get_layout_snapshot(): GraphLayoutNodeSnapshot[] {
    return (this.scene?.nodes ?? []).map((node) => {
      const point = this.positions.get(node.id) ?? { x: 0, y: 0 };
      return {
        id: node.id,
        x: point.x,
        y: point.y,
        fixed: this.fixed_node_ids.has(node.id),
      };
    });
  }

  apply_layout_snapshot(nodes: GraphLayoutNodeSnapshot[]): void {
    if (!this.scene) {
      return;
    }
    const current_node_ids = new Set(this.scene.nodes.map((node) => node.id));
    this.fixed_node_ids.clear();
    nodes.forEach((node) => {
      if (!current_node_ids.has(node.id) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
        return;
      }
      this.positions.set(node.id, { x: node.x, y: node.y });
      if (node.fixed) {
        this.fixed_node_ids.add(node.id);
      }
    });
    this.sync_simulation(true);
    this.render();
    this.emit_layout_change();
  }

  reset_layout(): void {
    if (!this.scene) {
      return;
    }
    this.positions.clear();
    this.fixed_node_ids.clear();
    this.scene.nodes.forEach((node, index) => {
      this.positions.set(node.id, spiral_position(index, this.scene?.nodes.length ?? 1));
    });
    this.sync_simulation(true);
    this.render();
    this.fit_all();
    this.emit_layout_change();
  }

  fix_selection(): void {
    if (!this.scene?.selected) {
      return;
    }
    if (this.scene.selected.type === 'node') {
      this.fix_nodes([this.scene.selected.id]);
      return;
    }
    const edge = this.scene.edges.find((item) => item.id === this.scene?.selected?.id);
    if (edge) {
      this.fix_nodes([edge.source, edge.target]);
    }
  }

  release_selection(): void {
    if (!this.scene?.selected) {
      return;
    }
    if (this.scene.selected.type === 'node') {
      this.release_nodes([this.scene.selected.id]);
      return;
    }
    const edge = this.scene.edges.find((item) => item.id === this.scene?.selected?.id);
    if (edge) {
      this.release_nodes([edge.source, edge.target]);
    }
  }

  fix_neighborhood(): void {
    if (!this.scene?.selected) {
      return;
    }
    this.fix_nodes([
      ...this.scene.neighborhood.primary_node_ids,
      ...this.scene.neighborhood.secondary_node_ids,
    ]);
  }

  release_all_fixed(): void {
    this.release_nodes([...this.fixed_node_ids]);
  }

  resize(): void {
    if (!this.app || !this.viewport) {
      return;
    }
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.app.renderer.resize(width, height);
    this.viewport.resize(width, height);
    this.fit_all();
  }

  set_scene(scene: GraphRuntimeScene): void {
    const previous_ids = new Set(this.positions.keys());
    this.scene = scene;
    scene.nodes.forEach((node, index) => {
      if (!this.positions.has(node.id)) {
        this.positions.set(node.id, spiral_position(index, scene.nodes.length));
      }
      previous_ids.delete(node.id);
    });
    previous_ids.forEach((node_id) => {
      this.positions.delete(node_id);
      this.fixed_node_ids.delete(node_id);
    });
    this.sync_simulation();
    this.render();
    if (scene.profile.mode === 'static') {
      this.fit_all(0.12);
    }
  }

  fit_all(padding_ratio = 0.16): void {
    if (!this.viewport || !this.scene?.nodes.length) {
      return;
    }
    const bounds = this.resolve_bounds(this.scene.nodes.map((node) => node.id));
    if (!bounds) {
      return;
    }
    this.apply_bounds(bounds, padding_ratio);
  }

  focus_selection(): void {
    if (!this.scene) {
      return;
    }
    const ids =
      this.scene.selected?.type === 'node'
        ? [
            ...this.scene.neighborhood.primary_node_ids,
            ...this.scene.neighborhood.secondary_node_ids,
          ]
        : this.scene.selected?.type === 'edge'
          ? [...this.scene.neighborhood.primary_node_ids]
          : [];
    const bounds = this.resolve_bounds(ids);
    if (bounds) {
      this.apply_bounds(bounds, 0.22);
    }
  }

  relayout(): void {
    if (!this.scene) {
      return;
    }
    this.positions.clear();
    this.scene.nodes.forEach((node, index) => {
      this.positions.set(node.id, spiral_position(index, this.scene?.nodes.length ?? 1));
    });
    this.sync_simulation(true);
    this.render();
    this.fit_all();
    this.emit_layout_change();
  }

  private sync_simulation(force_restart = false): void {
    const scene = this.scene;
    if (!scene || !scene.physics_running || !scene.profile.physics_enabled || scene.nodes.length < 2) {
      this.stop_simulation();
      return;
    }
    this.stop_simulation();
    const sim_nodes = scene.nodes.map((node) => {
      const point = this.positions.get(node.id) ?? { x: 0, y: 0 };
      const fixed = this.fixed_node_ids.has(node.id);
      return {
        id: node.id,
        radius: node.radius,
        x: point.x,
        y: point.y,
        fx: fixed ? point.x : null,
        fy: fixed ? point.y : null,
      };
    });
    this.sim_nodes = new Map(sim_nodes.map((node) => [node.id, node]));
    const node_ids = new Set(scene.nodes.map((node) => node.id));
    const sim_edges = scene.edges
      .filter((edge) => node_ids.has(edge.source) && node_ids.has(edge.target))
      .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, weight: edge.weight }));

    this.simulation = forceSimulation<SimNode, SimEdge>(sim_nodes)
      .force('charge', forceManyBody<SimNode>().strength(-scene.repulsion))
      .force(
        'link',
        forceLink<SimNode, SimEdge>(sim_edges)
          .id((node) => node.id)
          .distance((edge) => scene.link_distance / Math.max(0.55, Math.min(1.8, edge.weight)))
          .strength(0.22),
      )
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<SimNode>().radius((node) => node.radius + 8).iterations(2))
      .alpha(0.62)
      .alphaDecay(scene.profile.mode === 'balanced' ? 0.055 : 0.035)
      .velocityDecay(0.42)
      .on('tick', () => {
        sim_nodes.forEach((node) => {
          this.positions.set(node.id, { x: Number(node.x ?? 0), y: Number(node.y ?? 0) });
        });
        this.render();
      })
      .on('end', () => this.render());
    this.schedule_auto_freeze();
  }

  private stop_simulation(): void {
    this.clear_auto_freeze_timer();
    this.simulation?.stop();
    this.simulation = null;
    this.sim_nodes.clear();
  }

  private render(): void {
    if (!this.scene || !this.viewport) {
      return;
    }
    const scene = this.scene;
    const hover_node_id = this.hover?.type === 'node' ? this.hover.node.id : null;
    const hover_edge_id = this.hover?.type === 'edge' ? this.hover.edge.id : null;
    const hover_neighbors = hover_node_id ? resolve_direct_neighbors(scene.edges, hover_node_id) : new Set<string>();
    const contextual = build_contextual_ids(scene, hover_node_id, hover_edge_id, hover_neighbors);

    this.edge_layer.clear();
    this.node_layer.clear();
    this.label_layer.removeChildren().forEach((child) => child.destroy());

    scene.edges.forEach((edge) => this.draw_edge(edge, contextual));
    scene.nodes.forEach((node) => this.draw_node(node, contextual));
    if (scene.show_labels || contextual.size > 0) {
      scene.nodes.forEach((node) => this.draw_label(node, contextual));
    }
  }

  private draw_edge(edge: RenderEdge, contextual: Set<string>): void {
    const source = this.positions.get(edge.source);
    const target = this.positions.get(edge.target);
    if (!source || !target) {
      return;
    }
    const active = contextual.size === 0 || contextual.has(edge.id) || contextual.has(edge.source) || contextual.has(edge.target);
    this.edge_layer
      .moveTo(source.x, source.y)
      .lineTo(target.x, target.y)
      .stroke({
        color: edge.color,
        width: active ? Math.max(1.1, Math.min(4, edge.weight * 1.4)) : 0.7,
        alpha: active ? 0.62 : 0.08,
      });
  }

  private draw_node(node: RenderNode, contextual: Set<string>): void {
    const point = this.positions.get(node.id);
    if (!point) {
      return;
    }
    const selected = this.scene?.selected?.type === 'node' && this.scene.selected.id === node.id;
    const active = contextual.size === 0 || contextual.has(node.id);
    const secondary = this.scene?.neighborhood.secondary_node_ids.has(node.id) ?? false;
    this.node_layer.circle(point.x, point.y, node.radius + (selected ? 5 : 0)).fill({
      color: selected ? 0xffffff : node.color,
      alpha: selected ? 0.98 : active ? (secondary ? 0.54 : 0.86) : 0.12,
    });
    if (selected || active) {
      this.node_layer.circle(point.x, point.y, node.radius + 6).stroke({
        color: selected ? 0xbae6fd : node.color,
        width: selected ? 2.4 : 1.2,
        alpha: selected ? 0.9 : 0.34,
      });
    }
  }

  private draw_label(node: RenderNode, contextual: Set<string>): void {
    if (!this.viewport || !this.scene) {
      return;
    }
    const point = this.positions.get(node.id);
    if (!point) {
      return;
    }
    const selected = this.scene.selected?.type === 'node' && this.scene.selected.id === node.id;
    const contextual_label = contextual.has(node.id);
    const zoomed_in = this.viewport.scaled > 0.82 && is_in_screen(this.viewport, point, 80);
    const important = node.degree >= 3 || selected || contextual_label || zoomed_in;
    if (!important || (this.scene.profile.passive_labels_hidden && !contextual_label && !selected)) {
      return;
    }
    const label = new Text({
      text: selected ? node.display_name : node.short_name,
      style: LABEL_STYLE,
    });
    label.alpha = selected ? 1 : contextual_label ? 0.88 : 0.62;
    label.x = point.x + node.radius + 8;
    label.y = point.y - 8;
    this.label_layer.addChild(label);
  }

  private handle_pointer_down(event: FederatedPointerEvent): void {
    if (!this.viewport) {
      return;
    }
    const point = this.viewport.toWorld(event.global);
    const target = this.find_target(point.x, point.y);
    if (target?.type !== 'node') {
      return;
    }
    event.stopPropagation();
    this.viewport.plugins.pause('drag');
    this.dragging_node = {
      node_id: target.node.id,
      pointer_id: event.pointerId,
      start_x: point.x,
      start_y: point.y,
      moved: false,
    };
    this.fixed_node_ids.add(target.node.id);
    this.set_sim_node_fixed_position(target.node.id, point.x, point.y);
    this.simulation?.alphaTarget(0.18).restart();
    this.set_hover(null, null);
  }

  private handle_pointer_move(event: FederatedPointerEvent): void {
    if (!this.viewport || !this.app) {
      return;
    }
    if (this.dragging_node) {
      this.handle_node_drag_move(event);
      return;
    }
    const point = this.viewport.toWorld(event.global);
    const target = this.find_target(point.x, point.y);
    this.app.canvas.style.cursor = target ? 'pointer' : 'grab';
    this.set_hover(target, event.global);
  }

  private handle_node_drag_move(event: FederatedPointerEvent): void {
    if (!this.viewport || !this.app || !this.dragging_node || event.pointerId !== this.dragging_node.pointer_id) {
      return;
    }
    event.stopPropagation();
    const point = this.viewport.toWorld(event.global);
    this.dragging_node.moved =
      this.dragging_node.moved ||
      Math.hypot(point.x - this.dragging_node.start_x, point.y - this.dragging_node.start_y) > 3;
    this.positions.set(this.dragging_node.node_id, { x: point.x, y: point.y });
    this.set_sim_node_fixed_position(this.dragging_node.node_id, point.x, point.y);
    this.app.canvas.style.cursor = 'grabbing';
    this.render();
  }

  private handle_pointer_up(event: FederatedPointerEvent): void {
    if (!this.dragging_node || event.pointerId !== this.dragging_node.pointer_id) {
      return;
    }
    event.stopPropagation();
    const dragged_node_id = this.dragging_node.node_id;
    this.viewport?.plugins.resume('drag');
    this.dragging_node = null;
    this.simulation?.alphaTarget(0);
    this.fixed_node_ids.add(dragged_node_id);
    this.emit_layout_change();
    this.render();
  }

  private handle_pointer_tap(event: FederatedPointerEvent): void {
    if (!this.viewport) {
      return;
    }
    const point = this.viewport.toWorld(event.global);
    const target = this.find_target(point.x, point.y);
    if (!target) {
      this.callbacks.on_clear_selection();
      return;
    }
    if (target.type === 'node') {
      this.callbacks.on_select_node(target.node.id);
      return;
    }
    this.callbacks.on_select_edge(target.edge.id);
  }

  private set_hover(target: HitTarget, screen_point: { x: number; y: number } | null): void {
    const same =
      this.hover?.type === target?.type &&
      ((target?.type === 'node' && this.hover?.type === 'node' && this.hover.node.id === target.node.id) ||
        (target?.type === 'edge' && this.hover?.type === 'edge' && this.hover.edge.id === target.edge.id));
    if (same) {
      return;
    }
    this.hover = target;
    if (!target || !screen_point) {
      this.callbacks.on_hover_change(null);
      this.render();
      return;
    }
    this.callbacks.on_hover_change({
      type: target.type,
      id: target.type === 'node' ? target.node.id : target.edge.id,
      title: target.type === 'node' ? target.node.display_name : target.edge.display_name,
      detail: target.type === 'node'
        ? `${target.node.kind_label ?? target.node.type} · ${target.node.degree} 条连接`
        : `${target.edge.source_name_resolved} → ${target.edge.target_name_resolved}`,
      x: screen_point.x + 14,
      y: screen_point.y + 14,
    });
    this.render();
  }

  private find_target(x: number, y: number): HitTarget {
    const node = find_node_hit(this.scene?.nodes ?? [], this.positions, x, y);
    if (node) {
      return { type: 'node', node };
    }
    const edge = find_edge_hit(this.scene?.edges ?? [], this.positions, x, y);
    return edge ? { type: 'edge', edge } : null;
  }

  private fix_nodes(node_ids: string[]): void {
    node_ids.forEach((node_id) => {
      const point = this.positions.get(node_id);
      if (!point) {
        return;
      }
      this.fixed_node_ids.add(node_id);
      this.set_sim_node_fixed_position(node_id, point.x, point.y);
    });
    this.simulation?.alpha(0.18).restart();
    this.render();
    this.emit_layout_change();
  }

  private release_nodes(node_ids: string[]): void {
    node_ids.forEach((node_id) => {
      this.fixed_node_ids.delete(node_id);
      const sim_node = this.sim_nodes.get(node_id);
      if (sim_node) {
        sim_node.fx = null;
        sim_node.fy = null;
      }
    });
    this.simulation?.alpha(0.24).restart();
    this.render();
    this.emit_layout_change();
  }

  private set_sim_node_fixed_position(node_id: string, x: number, y: number): void {
    const sim_node = this.sim_nodes.get(node_id);
    if (!sim_node) {
      return;
    }
    sim_node.x = x;
    sim_node.y = y;
    sim_node.fx = x;
    sim_node.fy = y;
  }

  private emit_layout_change(): void {
    this.callbacks.on_layout_change(this.get_layout_snapshot());
  }

  private schedule_auto_freeze(): void {
    this.clear_auto_freeze_timer();
    if (this.scene?.profile.mode !== 'balanced') {
      return;
    }
    this.auto_freeze_timer = window.setTimeout(() => {
      this.auto_freeze_timer = null;
      this.simulation?.stop();
      this.simulation = null;
      this.callbacks.on_physics_auto_stop();
      this.render();
    }, 8000);
  }

  private clear_auto_freeze_timer(): void {
    if (this.auto_freeze_timer !== null) {
      window.clearTimeout(this.auto_freeze_timer);
      this.auto_freeze_timer = null;
    }
  }

  private schedule_render(): void {
    if (this.render_timer !== null) {
      return;
    }
    this.render_timer = window.setTimeout(() => {
      this.render_timer = null;
      this.render();
    }, 100);
  }

  private resolve_bounds(node_ids: string[]): { min_x: number; max_x: number; min_y: number; max_y: number } | null {
    const points = node_ids
      .map((id) => this.positions.get(id))
      .filter((point): point is { x: number; y: number } => Boolean(point));
    if (!points.length) {
      return null;
    }
    return {
      min_x: Math.min(...points.map((point) => point.x)),
      max_x: Math.max(...points.map((point) => point.x)),
      min_y: Math.min(...points.map((point) => point.y)),
      max_y: Math.max(...points.map((point) => point.y)),
    };
  }

  private apply_bounds(bounds: { min_x: number; max_x: number; min_y: number; max_y: number }, padding_ratio: number): void {
    if (!this.viewport) {
      return;
    }
    const width = Math.max(1, bounds.max_x - bounds.min_x);
    const height = Math.max(1, bounds.max_y - bounds.min_y);
    const padding_x = this.viewport.screenWidth * padding_ratio;
    const padding_y = this.viewport.screenHeight * padding_ratio;
    const scale = Math.max(
      0.06,
      Math.min(3.6, Math.min(this.viewport.screenWidth / (width + padding_x), this.viewport.screenHeight / (height + padding_y))),
    );
    this.viewport.setZoom(scale, false);
    this.viewport.moveCenter((bounds.min_x + bounds.max_x) / 2, (bounds.min_y + bounds.max_y) / 2);
    this.render();
  }
}

function spiral_position(index: number, total: number): { x: number; y: number } {
  const theta = index * 0.62;
  const radius = 42 * Math.sqrt(index + 1) + Math.sqrt(total) * 3;
  return { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius };
}

function resolve_direct_neighbors(edges: RenderEdge[], node_id: string): Set<string> {
  const ids = new Set([node_id]);
  edges.forEach((edge) => {
    if (edge.source === node_id) {
      ids.add(edge.target);
    }
    if (edge.target === node_id) {
      ids.add(edge.source);
    }
  });
  return ids;
}

function build_contextual_ids(scene: GraphRuntimeScene, hover_node_id: string | null, hover_edge_id: string | null, hover_neighbors: Set<string>): Set<string> {
  const ids = new Set<string>();
  scene.neighborhood.primary_node_ids.forEach((id) => ids.add(id));
  scene.neighborhood.secondary_node_ids.forEach((id) => ids.add(id));
  scene.neighborhood.edge_ids.forEach((id) => ids.add(id));
  hover_neighbors.forEach((id) => ids.add(id));
  if (hover_node_id) {
    ids.add(hover_node_id);
  }
  if (hover_edge_id) {
    ids.add(hover_edge_id);
  }
  return ids;
}

function find_node_hit(nodes: RenderNode[], positions: Map<string, { x: number; y: number }>, x: number, y: number): RenderNode | null {
  let best: { node: RenderNode; distance: number } | null = null;
  for (const node of nodes) {
    const point = positions.get(node.id);
    if (!point) {
      continue;
    }
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance <= node.radius + 8 && (!best || distance < best.distance)) {
      best = { node, distance };
    }
  }
  return best?.node ?? null;
}

function find_edge_hit(edges: RenderEdge[], positions: Map<string, { x: number; y: number }>, x: number, y: number): RenderEdge | null {
  let best: { edge: RenderEdge; distance: number } | null = null;
  for (const edge of edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) {
      continue;
    }
    const distance = distance_to_segment(x, y, source.x, source.y, target.x, target.y);
    if (distance <= 9 && (!best || distance < best.distance)) {
      best = { edge, distance };
    }
  }
  return best?.edge ?? null;
}

function distance_to_segment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const ratio = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + ratio * dx), py - (y1 + ratio * dy));
}

function is_in_screen(viewport: Viewport, point: { x: number; y: number }, padding: number): boolean {
  const screen = viewport.toScreen(point);
  return screen.x >= -padding && screen.x <= viewport.screenWidth + padding && screen.y >= -padding && screen.y <= viewport.screenHeight + padding;
}
