import { useCallback, useEffect, useMemo, useState, type FocusEvent, type PointerEvent } from 'react';

import { DEFAULT_SCOPE, fetch_edge_detail, fetch_graph, fetch_node_detail, fetch_ready, fetch_sources } from '../../../shared/api/kb';
import { is_not_found_api_error, to_user_error_message } from '../../../shared/api/errorMessages';
import type {
  GraphDataView,
  GraphEdgeDetail,
  GraphNodeDetail,
  KBScope,
  KnowledgeGraph,
  SourceItem,
  SystemReady,
} from '../../../shared/types/kb';
import {
  build_scope_source_ids,
  project_graph,
  resolve_neighborhood,
  resolve_runtime_profile,
  type Selection,
} from '../model/graphModel';
import {
  EMPTY_GRAPH,
  build_graph_query_plan,
  resolve_evidence_anchor_on_selection_change,
  resolve_evidence_anchor_on_view_change,
  resolve_graph_focus_selection,
} from '../model/graphQueryPlan';
import {
  build_layout_storage_key,
  create_layout_snapshot,
  delete_layout_snapshot,
  read_layout_snapshot,
  write_layout_snapshot,
  type GraphLayoutNodeSnapshot,
} from '../model/layoutPersistence';
import { resolve_floating_tooltip_position, type FloatingTooltipPosition } from '../model/tooltipPosition';
import {
  resolve_workspace_chrome,
  type GraphContextPanel,
  type WorkspaceView,
} from '../model/workspaceLayout';
import { GraphEditorPanel } from './panels/GraphEditorPanel';
import { GraphSettingsPanel } from './panels/GraphSettingsPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { SourceDetailPanel } from './panels/SourceDetailPanel';
import type { LayoutCommand } from './GraphCanvas';
import { GraphContextAside } from './workspaces/GraphContextAside';
import { GraphWorkspace } from './workspaces/GraphWorkspace';
import { PrimaryWorkspace } from './workspaces/PrimaryWorkspace';
import { WorkspaceRail } from './workspaces/WorkspaceRail';

type ViewportCommand = { id: number; type: 'fit' | 'focus' | 'relayout' };
type LayoutCommandInput =
  | { type: 'save' }
  | { type: 'restore'; nodes: GraphLayoutNodeSnapshot[] }
  | { type: 'reset' }
  | { type: 'fix-selected' }
  | { type: 'release-selected' }
  | { type: 'fix-neighborhood' }
  | { type: 'release-all' };
type FloatingTooltipState = FloatingTooltipPosition & { text: string };

function resolve_tooltip_target(target: EventTarget | null, boundary: HTMLElement): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const tooltip_target = target.closest<HTMLElement>('[data-tooltip]');
  if (!tooltip_target || !boundary.contains(tooltip_target)) {
    return null;
  }
  return tooltip_target;
}

export function GraphWorkbench() {
  const [graph, set_graph] = useState<KnowledgeGraph>(EMPTY_GRAPH);
  const [sources, set_sources] = useState<SourceItem[]>([]);
  const [ready, set_ready] = useState<SystemReady | null>(null);
  const [view, set_view] = useState<GraphDataView>('semantic');
  const [density, set_density] = useState(100);
  const [graph_mode, set_graph_mode] = useState<'global' | 'local'>('global');
  const [local_depth, set_local_depth] = useState(1);
  const [selected_source_ids, set_selected_source_ids] = useState<string[]>([]);
  const [search, set_search] = useState('');
  const [selected, set_selected] = useState<Selection>(null);
  const [evidence_anchor, set_evidence_anchor] = useState<Selection>(null);
  const [node_detail, set_node_detail] = useState<GraphNodeDetail | null>(null);
  const [edge_detail, set_edge_detail] = useState<GraphEdgeDetail | null>(null);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [graph_notice, set_graph_notice] = useState<string | null>(null);
  const [detail_notice, set_detail_notice] = useState<string | null>(null);
  const [show_labels, set_show_labels] = useState(true);
  const [physics_running, set_physics_running] = useState(true);
  const [link_distance, set_link_distance] = useState(92);
  const [repulsion, set_repulsion] = useState(180);
  const [workspace_view, set_workspace_view] = useState<WorkspaceView>('graph');
  const [right_panel, set_right_panel] = useState<GraphContextPanel>('inspector');
  const [left_collapsed, set_left_collapsed] = useState(false);
  const [right_collapsed, set_right_collapsed] = useState(false);
  const [viewport_command, set_viewport_command] = useState<ViewportCommand | null>(null);
  const [layout_command, set_layout_command] = useState<LayoutCommand | null>(null);
  const [auto_save_layout, set_auto_save_layout] = useState(true);
  const [layout_status, set_layout_status] = useState('布局未保存');
  const [fixed_node_count, set_fixed_node_count] = useState(0);
  const [floating_tooltip, set_floating_tooltip] = useState<FloatingTooltipState | null>(null);

  const graph_scope = useMemo<KBScope>(() => {
    const source_ids = build_scope_source_ids(selected_source_ids);
    return {
      ...DEFAULT_SCOPE,
      mode: source_ids.length ? 'subset' : 'all',
      source_ids,
    };
  }, [selected_source_ids]);
  const graph_query_selection = view === 'evidence' ? evidence_anchor : null;
  const graph_focus_selection = useMemo(
    () =>
      resolve_graph_focus_selection({
        current_view: view,
        evidence_anchor,
        selected,
      }),
    [evidence_anchor, selected, view],
  );
  const layout_key = useMemo(
    () => build_layout_storage_key({ view, density, scope: graph_scope }),
    [density, graph_scope, view],
  );

  const load = useCallback(async () => {
    set_loading(true);
    set_error(null);
    set_graph_notice(null);
    try {
      const graph_query_plan = build_graph_query_plan({
        density,
        scope: graph_scope,
        selected: graph_query_selection,
        view,
      });

      if (graph_query_plan.kind === 'local-empty') {
        const [next_ready, next_sources] = await Promise.all([
          fetch_ready().catch(() => null),
          fetch_sources(),
        ]);
        set_ready(next_ready);
        set_sources(next_sources);
        set_graph(graph_query_plan.graph);
        set_graph_notice(graph_query_plan.message);
        return;
      }

      const [next_ready, next_sources, next_graph] = await Promise.all([
        fetch_ready().catch(() => null),
        fetch_sources(),
        fetch_graph(graph_query_plan.options),
      ]);
      set_ready(next_ready);
      set_sources(next_sources);
      set_graph(next_graph);
      if (view === 'evidence') {
        issue_viewport(graph_query_selection ? 'focus' : 'fit');
      }
    } catch (current_error) {
      set_error(to_user_error_message(current_error, 'graph'));
    } finally {
      set_loading(false);
    }
  }, [density, graph_query_selection, graph_scope, view]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!graph.nodes.length) {
      return;
    }
    const snapshot = read_layout_snapshot(window.localStorage, layout_key);
    if (!snapshot) {
      set_fixed_node_count(0);
      set_layout_status('没有已保存布局');
      return;
    }
    issue_layout_command({ type: 'restore', nodes: snapshot.nodes });
    set_fixed_node_count(snapshot.nodes.filter((node) => node.fixed).length);
    set_layout_status(`已恢复布局：${new Date(snapshot.saved_at).toLocaleString()}`);
  }, [graph.nodes.length, layout_key]);

  const projected = useMemo(
    () =>
      project_graph(graph, {
        graph_mode,
        local_depth,
        density,
        view,
        search,
        selected_source_ids,
        selected: graph_focus_selection,
      }),
    [density, graph, graph_focus_selection, graph_mode, local_depth, search, selected_source_ids, view],
  );
  const neighborhood = useMemo(() => resolve_neighborhood(projected.edges, graph_focus_selection), [graph_focus_selection, projected.edges]);
  const profile = useMemo(
    () => resolve_runtime_profile(projected.nodes.length, projected.edges.length),
    [projected.edges.length, projected.nodes.length],
  );
  const selected_node = graph_focus_selection?.type === 'node'
    ? projected.nodes.find((node) => node.id === graph_focus_selection.id) ?? null
    : null;
  const selected_edge = graph_focus_selection?.type === 'edge'
    ? projected.edges.find((edge) => edge.id === graph_focus_selection.id) ?? null
    : null;
  const search_matches = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return projected.nodes
        .slice()
        .sort((left, right) => right.degree - left.degree)
        .slice(0, 12);
    }
    return projected.nodes
      .filter((node) => [node.display_name, node.kind_label, node.source_label, node.id].join(' ').toLowerCase().includes(keyword))
      .slice(0, 18);
  }, [projected.nodes, search]);

  useEffect(() => {
    let cancelled = false;
    set_node_detail(null);
    set_edge_detail(null);
    set_detail_notice(null);
    if (!selected) {
      return;
    }
    const detail_request =
      selected.type === 'node'
        ? fetch_node_detail(selected.id).then((detail) => {
            if (!cancelled) {
              set_node_detail(detail);
            }
          })
        : fetch_edge_detail(selected.id).then((detail) => {
            if (!cancelled) {
              set_edge_detail(detail);
            }
          });
    detail_request.catch((current_error) => {
      if (!cancelled) {
        if (selected.type === 'edge' && is_not_found_api_error(current_error, 'graph_edge_not_found')) {
          set_detail_notice(to_user_error_message(current_error, 'edge-detail'));
          return;
        }
        set_error(to_user_error_message(current_error, selected.type === 'node' ? 'node-detail' : 'edge-detail'));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  function issue_viewport(type: ViewportCommand['type']): void {
    set_viewport_command((current) => ({ id: (current?.id ?? 0) + 1, type }));
  }

  const show_tooltip = useCallback((target: HTMLElement): void => {
    const text = target.dataset.tooltip;
    if (!text) {
      return;
    }
    const position = resolve_floating_tooltip_position({
      target_rect: target.getBoundingClientRect(),
      viewport_height: window.innerHeight,
      viewport_width: window.innerWidth,
    });
    set_floating_tooltip({ ...position, text });
  }, []);

  const hide_tooltip = useCallback((): void => {
    set_floating_tooltip(null);
  }, []);

  const handle_tooltip_pointer_over = useCallback((event: PointerEvent<HTMLElement>): void => {
    const target = resolve_tooltip_target(event.target, event.currentTarget);
    if (target) {
      show_tooltip(target);
    }
  }, [show_tooltip]);

  const handle_tooltip_pointer_out = useCallback((event: PointerEvent<HTMLElement>): void => {
    const target = resolve_tooltip_target(event.target, event.currentTarget);
    if (!target) {
      return;
    }
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) {
      return;
    }
    hide_tooltip();
  }, [hide_tooltip]);

  const handle_tooltip_focus = useCallback((event: FocusEvent<HTMLElement>): void => {
    const target = resolve_tooltip_target(event.target, event.currentTarget);
    if (target) {
      show_tooltip(target);
    }
  }, [show_tooltip]);

  const handle_tooltip_blur = useCallback((): void => {
    hide_tooltip();
  }, [hide_tooltip]);

  function select_graph_view(next_view: GraphDataView): void {
    set_evidence_anchor((current) =>
      resolve_evidence_anchor_on_view_change({
        current_anchor: current,
        next_view,
        selected,
      }),
    );
    set_view(next_view);
  }

  function toggle_source(source_id: string): void {
    set_selected_source_ids((current) =>
      current.includes(source_id)
        ? current.filter((item) => item !== source_id)
        : [...current, source_id],
    );
  }

  function select_node(node_id: string): void {
    const next_selection: Selection = { type: 'node', id: node_id };
    set_selected(next_selection);
    set_evidence_anchor((current) =>
      resolve_evidence_anchor_on_selection_change({
        current_anchor: current,
        current_view: view,
        selected: next_selection,
      }),
    );
    set_workspace_view('graph');
    set_right_panel('inspector');
    set_viewport_command((current) => ({ id: (current?.id ?? 0) + 1, type: 'focus' }));
  }

  function select_edge(edge_id: string): void {
    const next_selection: Selection = { type: 'edge', id: edge_id };
    set_selected(next_selection);
    set_evidence_anchor((current) =>
      resolve_evidence_anchor_on_selection_change({
        current_anchor: current,
        current_view: view,
        selected: next_selection,
      }),
    );
    set_workspace_view('graph');
    set_right_panel('inspector');
    set_viewport_command((current) => ({ id: (current?.id ?? 0) + 1, type: 'focus' }));
  }

  function clear_selection(): void {
    set_selected(null);
    set_evidence_anchor((current) =>
      resolve_evidence_anchor_on_selection_change({
        current_anchor: current,
        current_view: view,
        selected: null,
      }),
    );
    set_node_detail(null);
    set_edge_detail(null);
  }

  function open_left_rail(): void {
    set_left_collapsed(false);
  }

  function select_workspace(next_workspace: WorkspaceView): void {
    set_workspace_view(next_workspace);
  }

  function open_right_panel(next_panel: GraphContextPanel): void {
    set_right_panel(next_panel);
    set_right_collapsed(false);
  }

  function issue_layout_command(command: LayoutCommandInput): void {
    set_layout_command((current) => ({ id: (current?.id ?? 0) + 1, ...command } as LayoutCommand));
  }

  function persist_layout(nodes: GraphLayoutNodeSnapshot[], status: string): void {
    const snapshot = create_layout_snapshot(nodes);
    write_layout_snapshot(window.localStorage, layout_key, snapshot);
    set_fixed_node_count(nodes.filter((node) => node.fixed).length);
    set_layout_status(status);
  }

  function handle_layout_snapshot(nodes: GraphLayoutNodeSnapshot[]): void {
    persist_layout(nodes, '布局已保存');
  }

  function handle_layout_change(nodes: GraphLayoutNodeSnapshot[]): void {
    set_fixed_node_count(nodes.filter((node) => node.fixed).length);
    if (auto_save_layout) {
      persist_layout(nodes, '布局已自动保存');
    } else {
      set_layout_status('布局有未保存改动');
    }
  }

  function restore_layout(): void {
    const snapshot = read_layout_snapshot(window.localStorage, layout_key);
    if (!snapshot) {
      set_layout_status('当前范围没有已保存布局');
      return;
    }
    issue_layout_command({ type: 'restore', nodes: snapshot.nodes });
    set_fixed_node_count(snapshot.nodes.filter((node) => node.fixed).length);
    set_layout_status(`已恢复布局：${new Date(snapshot.saved_at).toLocaleString()}`);
  }

  function reset_layout(): void {
    delete_layout_snapshot(window.localStorage, layout_key);
    issue_layout_command({ type: 'reset' });
    set_fixed_node_count(0);
    set_layout_status('已重置当前布局');
  }

  function handle_physics_auto_stop(): void {
    set_physics_running(false);
    set_layout_status('中等规模图谱已自动冻结');
  }

  function render_panel() {
    if (right_panel === 'edit') {
      return (
        <GraphEditorPanel
          graph={graph}
          on_mutation={load}
          on_select_node={select_node}
          selected_edge={selected_edge}
          selected_node={selected_node}
          sources={sources}
        />
      );
    }
    if (right_panel === 'source') {
      return <SourceDetailPanel selected_source_ids={selected_source_ids} sources={sources} />;
    }
    return (
      <InspectorPanel
        detail_notice={detail_notice}
        edge_detail={edge_detail}
        node_detail={node_detail}
        on_clear_selection={clear_selection}
        selected={selected}
        selected_edge={selected_edge}
        selected_node={selected_node}
      />
    );
  }

  const active_physics = physics_running && profile.physics_enabled;
  const workspace_chrome = resolve_workspace_chrome(workspace_view);
  const is_page_workspace = workspace_view !== 'graph';
  const workbench_class_name = [
    'workbench-shell',
    left_collapsed ? 'is-left-collapsed' : '',
    workspace_chrome.show_graph_context_panel && right_collapsed ? 'is-right-collapsed' : '',
    workspace_chrome.show_graph_context_panel ? '' : 'is-main-workspace',
    is_page_workspace ? 'is-page-workspace' : '',
  ].filter(Boolean).join(' ');
  const view_hint = view === 'evidence'
    ? evidence_anchor
      ? '证据图已锁定证据锚点，点击段落或来源只更新检查器。'
      : '证据图需要先在语义图或结构图选中节点/关系。'
    : view === 'structure'
      ? '结构图选中节点用于高亮邻域、局部图、检查器和布局固定。'
      : '语义图选中节点用于高亮邻域、局部图、证据锚点和检查器。';
  const graph_settings_panel = (
    <GraphSettingsPanel
      auto_save_layout={auto_save_layout}
      density={density}
      fixed_node_count={fixed_node_count}
      has_selected={Boolean(graph_focus_selection)}
      link_distance={link_distance}
      layout_status={layout_status}
      local_depth={local_depth}
      on_auto_save_layout_change={set_auto_save_layout}
      on_density_change={set_density}
      on_fix_neighborhood={() => issue_layout_command({ type: 'fix-neighborhood' })}
      on_fix_selected={() => issue_layout_command({ type: 'fix-selected' })}
      on_link_distance_change={set_link_distance}
      on_local_depth_change={set_local_depth}
      on_release_all={() => issue_layout_command({ type: 'release-all' })}
      on_release_selected={() => issue_layout_command({ type: 'release-selected' })}
      on_repulsion_change={set_repulsion}
      on_reset_layout={reset_layout}
      on_restore_layout={restore_layout}
      on_save_layout={() => issue_layout_command({ type: 'save' })}
      on_show_labels_change={set_show_labels}
      repulsion={repulsion}
      show_labels={show_labels}
    />
  );

  return (
    <main
      className={workbench_class_name}
      onBlurCapture={handle_tooltip_blur}
      onFocusCapture={handle_tooltip_focus}
      onPointerOut={handle_tooltip_pointer_out}
      onPointerOver={handle_tooltip_pointer_over}
    >
      <WorkspaceRail
        graph_settings_panel={graph_settings_panel}
        left_collapsed={left_collapsed}
        search={search}
        search_matches={search_matches}
        selected_node_id={selected?.type === 'node' ? selected.id : null}
        selected_source_ids={selected_source_ids}
        show_graph_controls={workspace_chrome.show_graph_controls}
        show_source_filter={workspace_view !== 'import'}
        sources={sources}
        workspace_view={workspace_view}
        on_clear_sources={() => set_selected_source_ids([])}
        on_open_left_rail={open_left_rail}
        on_search_change={set_search}
        on_select_node={select_node}
        on_select_workspace={select_workspace}
        on_toggle_left_rail={() => set_left_collapsed((current) => !current)}
        on_toggle_source={toggle_source}
      />

      {workspace_view === 'graph' ? (
        <GraphWorkspace
          active_physics={active_physics}
          error={error}
          graph_mode={graph_mode}
          graph_notice={graph_notice}
          layout_command={layout_command}
          link_distance={link_distance}
          loading={loading}
          neighborhood={neighborhood}
          profile={profile}
          projected={projected}
          ready={ready}
          repulsion={repulsion}
          selected={graph_focus_selection}
          show_labels={show_labels}
          view={view}
          view_hint={view_hint}
          viewport_command={viewport_command}
          on_clear_selection={clear_selection}
          on_graph_mode_change={set_graph_mode}
          on_layout_change={handle_layout_change}
          on_layout_snapshot={handle_layout_snapshot}
          on_physics_auto_stop={handle_physics_auto_stop}
          on_physics_running_change={set_physics_running}
          on_select_edge={select_edge}
          on_select_graph_view={select_graph_view}
          on_select_node={select_node}
          on_viewport_command={issue_viewport}
        />
      ) : (
        <PrimaryWorkspace
          ready={ready}
          scope={graph_scope}
          workspace_view={workspace_view}
          on_focus_node={select_node}
          on_import_finished={load}
        />
      )}

      {workspace_chrome.show_graph_context_panel ? (
        <GraphContextAside
          right_collapsed={right_collapsed}
          right_panel={right_panel}
          on_open_panel={open_right_panel}
          on_select_panel={set_right_panel}
          on_toggle_right_panel={() => set_right_collapsed((current) => !current)}
        >
          {render_panel()}
        </GraphContextAside>
      ) : null}
      {floating_tooltip ? (
        <div
          className={`floating-tooltip is-${floating_tooltip.placement}`}
          role='tooltip'
          style={{
            left: floating_tooltip.left,
            top: floating_tooltip.top,
            width: floating_tooltip.width,
          }}
        >
          <span className='floating-tooltip-arrow' style={{ left: floating_tooltip.arrow_left }} />
          {floating_tooltip.text}
        </div>
      ) : null}
    </main>
  );
}
