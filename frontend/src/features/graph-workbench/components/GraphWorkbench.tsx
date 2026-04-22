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
import { EMPTY_GRAPH, build_graph_query_plan, resolve_evidence_anchor_on_view_change } from '../model/graphQueryPlan';
import {
  build_layout_storage_key,
  create_layout_snapshot,
  delete_layout_snapshot,
  read_layout_snapshot,
  write_layout_snapshot,
  type GraphLayoutNodeSnapshot,
} from '../model/layoutPersistence';
import { resolve_floating_tooltip_position, type FloatingTooltipPosition } from '../model/tooltipPosition';
import { ChatPanel } from './panels/ChatPanel';
import { GraphEditorPanel } from './panels/GraphEditorPanel';
import { GraphSettingsPanel } from './panels/GraphSettingsPanel';
import { ImportPanel } from './panels/ImportPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { ModelConfigPanel } from './panels/ModelConfigPanel';
import { SourceDetailPanel } from './panels/SourceDetailPanel';
import { GraphCanvas, type LayoutCommand } from './GraphCanvas';

type ViewportCommand = { id: number; type: 'fit' | 'focus' | 'relayout' };
type LayoutCommandInput =
  | { type: 'save' }
  | { type: 'restore'; nodes: GraphLayoutNodeSnapshot[] }
  | { type: 'reset' }
  | { type: 'fix-selected' }
  | { type: 'release-selected' }
  | { type: 'fix-neighborhood' }
  | { type: 'release-all' };
type RightPanel = 'inspector' | 'edit' | 'source' | 'import' | 'chat' | 'model';
type FloatingTooltipState = FloatingTooltipPosition & { text: string };

const VIEW_LABELS: Record<GraphDataView, string> = {
  semantic: '语义图',
  evidence: '证据图',
  structure: '结构图',
};
const PROFILE_LABELS = {
  standard: '标准',
  balanced: '节能',
  static: '大图静态',
};
const PANEL_LABELS: Record<RightPanel, string> = {
  inspector: '检查',
  edit: '编辑',
  source: '来源',
  import: '导入',
  chat: '问答',
  model: '模型',
};
const PANEL_ICON_CLASS: Record<RightPanel, string> = {
  inspector: 'rail-symbol rail-symbol-inspector',
  edit: 'rail-symbol rail-symbol-edit',
  source: 'rail-symbol rail-symbol-source',
  import: 'rail-symbol rail-symbol-import',
  chat: 'rail-symbol rail-symbol-chat',
  model: 'rail-symbol rail-symbol-model',
};
const LEFT_RAIL_SHORTCUTS = [
  { id: 'search', icon_class: 'rail-symbol rail-symbol-search', tooltip: '展开左侧栏并使用节点搜索' },
  { id: 'source', icon_class: 'rail-symbol rail-symbol-source', tooltip: '展开左侧栏并调整来源范围' },
  { id: 'control', icon_class: 'rail-symbol rail-symbol-control', tooltip: '展开左侧栏并打开图谱控制' },
] as const;
const VIEW_TOOLTIPS: Record<GraphDataView, string> = {
  semantic: '查看实体与语义关系，适合探索概念连接和选择证据锚点。',
  evidence: '围绕已选节点或关系查看证据段落、来源和引用链。',
  structure: '查看来源、段落、表格等文档结构关系。',
};
const PANEL_TOOLTIPS: Record<RightPanel, string> = {
  inspector: '查看当前选中节点或关系的详情与关联证据。',
  edit: '新增、重命名、删除节点，并维护手工关系。',
  source: '查看来源详情、段落列表和表格预览。',
  import: '导入文本、扫描目录或上传文件。',
  chat: '基于当前来源范围进行检索问答。',
  model: '配置模型 Provider、Base URL、LLM 和 Embedding。',
};

function hover_description(text: string) {
  return {
    'data-tooltip': text,
    title: text,
  };
}

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
  const [right_panel, set_right_panel] = useState<RightPanel>('inspector');
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
        selected,
      }),
    [density, graph, graph_mode, local_depth, search, selected, selected_source_ids, view],
  );
  const neighborhood = useMemo(() => resolve_neighborhood(projected.edges, selected), [projected.edges, selected]);
  const profile = useMemo(
    () => resolve_runtime_profile(projected.nodes.length, projected.edges.length),
    [projected.edges.length, projected.nodes.length],
  );
  const selected_node = selected?.type === 'node'
    ? projected.nodes.find((node) => node.id === selected.id) ?? null
    : null;
  const selected_edge = selected?.type === 'edge'
    ? projected.edges.find((edge) => edge.id === selected.id) ?? null
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
    if (view !== 'evidence') {
      set_evidence_anchor(next_selection);
    }
    set_right_panel((current) => current === 'chat' ? current : 'inspector');
    set_viewport_command((current) => ({ id: (current?.id ?? 0) + 1, type: 'focus' }));
  }

  function select_edge(edge_id: string): void {
    const next_selection: Selection = { type: 'edge', id: edge_id };
    set_selected(next_selection);
    if (view !== 'evidence') {
      set_evidence_anchor(next_selection);
    }
    set_right_panel('inspector');
    set_viewport_command((current) => ({ id: (current?.id ?? 0) + 1, type: 'focus' }));
  }

  function clear_selection(): void {
    set_selected(null);
    if (view !== 'evidence') {
      set_evidence_anchor(null);
    }
    set_node_detail(null);
    set_edge_detail(null);
  }

  function open_left_rail(): void {
    set_left_collapsed(false);
  }

  function open_right_panel(next_panel: RightPanel): void {
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
    if (right_panel === 'import') {
      return <ImportPanel on_import_finished={load} />;
    }
    if (right_panel === 'chat') {
      return <ChatPanel on_focus_node={select_node} scope={graph_scope} />;
    }
    if (right_panel === 'model') {
      return <ModelConfigPanel on_saved={load} ready={ready} />;
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
  const workbench_class_name = [
    'workbench-shell',
    left_collapsed ? 'is-left-collapsed' : '',
    right_collapsed ? 'is-right-collapsed' : '',
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
      has_selected={Boolean(selected)}
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
      <aside aria-label='图谱导航与控制' className='left-rail'>
        <div aria-hidden={!left_collapsed} className='collapsed-rail-stack'>
          <button
            aria-label='展开左侧栏'
            className='rail-icon-button'
            {...hover_description('展开左侧栏')}
            onClick={open_left_rail}
            type='button'
          >
            <span aria-hidden='true' className='rail-symbol rail-symbol-menu' />
          </button>
          {LEFT_RAIL_SHORTCUTS.map((item) => (
            <button
              aria-label={item.tooltip}
              className='rail-icon-button'
              key={item.id}
              {...hover_description(item.tooltip)}
              onClick={open_left_rail}
              type='button'
            >
              <span aria-hidden='true' className={item.icon_class} />
            </button>
          ))}
        </div>
        <button
          aria-expanded={!left_collapsed}
          aria-label={left_collapsed ? '展开左侧栏' : '收起左侧栏'}
          className='rail-toggle rail-toggle-expanded'
          {...hover_description(left_collapsed ? '展开搜索、来源和图谱控制' : '收起左侧图谱导航与控制')}
          onClick={() => set_left_collapsed((current) => !current)}
          type='button'
        >
          {left_collapsed ? '展开' : '收起'}
        </button>
        <div aria-hidden={left_collapsed} className='rail-content'>
        <section className='brand-block'>
          <strong>知识图谱</strong>
        </section>

        <section className='control-section'>
          <label className='field'>
            <span>搜索节点</span>
            <input
              onChange={(event) => set_search(event.target.value)}
              placeholder='名称、类型、来源、ID'
              value={search}
            />
          </label>
          <div className='search-list'>
            {search_matches.map((node) => (
              <button
                className={selected?.type === 'node' && selected.id === node.id ? 'is-active' : ''}
                key={node.id}
                onClick={() => select_node(node.id)}
                type='button'
              >
                <strong>{node.display_name}</strong>
                <span>{node.kind_label ?? node.type} · {node.degree} 条连接</span>
              </button>
            ))}
          </div>
        </section>

        <section className='control-section'>
          <div className='section-heading'>
            <span>来源范围</span>
            <button {...hover_description('清空来源过滤，恢复全部来源范围')} onClick={() => set_selected_source_ids([])} type='button'>全部</button>
          </div>
          <div className='source-list'>
            {sources.slice(0, 80).map((source) => (
              <label key={source.id}>
                <input
                  checked={selected_source_ids.includes(source.id)}
                  onChange={() => toggle_source(source.id)}
                  type='checkbox'
                />
                <span>{source.name}</span>
              </label>
            ))}
          </div>
        </section>
        {graph_settings_panel}
        </div>
      </aside>

      <section className='graph-stage'>
        <header className='topbar'>
          <div className='segmented'>
            {(['semantic', 'evidence', 'structure'] as GraphDataView[]).map((item) => (
              <button
                {...hover_description(VIEW_TOOLTIPS[item])}
                aria-pressed={view === item}
                key={item}
                onClick={() => select_graph_view(item)}
                type='button'
              >
                {VIEW_LABELS[item]}
              </button>
            ))}
          </div>

          <div className='toolbar'>
            <button {...hover_description('显示当前范围内的完整图谱')} aria-pressed={graph_mode === 'global'} onClick={() => set_graph_mode('global')} type='button'>
              全局图
            </button>
            <button
              {...hover_description(selected?.type === 'node' ? '围绕当前节点按局部深度裁剪图谱' : '需要先选中一个节点才能进入局部图')}
              aria-pressed={graph_mode === 'local'}
              disabled={selected?.type !== 'node'}
              onClick={() => set_graph_mode('local')}
              type='button'
            >
              局部图
            </button>
            <button {...hover_description('缩放并移动视角，使当前图谱完整可见')} onClick={() => issue_viewport('fit')} type='button'>适配</button>
            <button {...hover_description(selected ? '聚焦当前选中节点、关系及其邻域' : '需要先选中节点或关系')} disabled={!selected} onClick={() => issue_viewport('focus')} type='button'>聚焦</button>
            <button {...hover_description('重新分配节点初始位置，并重启布局计算')} onClick={() => issue_viewport('relayout')} type='button'>重排</button>
            <button
              {...hover_description(profile.physics_enabled ? (active_physics ? '暂停 d3-force 物理模拟，冻结当前布局' : '继续运行物理模拟，自动整理节点') : '大图静态模式下物理模拟已禁用')}
              aria-pressed={active_physics}
              disabled={!profile.physics_enabled}
              onClick={() => set_physics_running((current) => !current)}
              type='button'
            >
              {profile.physics_enabled ? (active_physics ? '暂停物理' : '运行物理') : '静态大图'}
            </button>
          </div>
        </header>

        <section className='status-strip'>
          <span>{projected.visible_node_count}/{projected.total_node_count} 节点</span>
          <span>{projected.visible_edge_count}/{projected.total_edge_count} 关系</span>
          <span>{PROFILE_LABELS[profile.mode]} · {Math.round(profile.complexity)}</span>
          <span>{ready?.status ?? 'ready: unknown'}</span>
          <span className='is-note'>{view_hint}</span>
          {loading ? <span>同步中</span> : null}
          {graph_notice ? <span className='is-note'>{graph_notice}</span> : null}
          {error ? <span className='is-danger'>{error}</span> : null}
        </section>

        <GraphCanvas
          edges={projected.edges}
          layout_command={layout_command}
          link_distance={link_distance}
          neighborhood={neighborhood}
          nodes={projected.nodes}
          on_clear_selection={clear_selection}
          on_layout_change={handle_layout_change}
          on_layout_snapshot={handle_layout_snapshot}
          on_physics_auto_stop={handle_physics_auto_stop}
          on_select_edge={select_edge}
          on_select_node={select_node}
          physics_running={active_physics}
          profile={profile}
          repulsion={repulsion}
          selected={selected}
          show_labels={show_labels}
          viewport_command={viewport_command}
        />
      </section>

      <aside aria-label='工作台面板' className='right-panel'>
        <div aria-hidden={!right_collapsed} className='collapsed-rail-stack'>
          <button
            aria-label='展开右侧栏'
            className='rail-icon-button'
            {...hover_description('展开右侧栏')}
            onClick={() => set_right_collapsed(false)}
            type='button'
          >
            <span aria-hidden='true' className='rail-symbol rail-symbol-menu' />
          </button>
          {(Object.keys(PANEL_LABELS) as RightPanel[]).map((item) => (
            <button
              aria-label={`打开${PANEL_LABELS[item]}面板`}
              aria-pressed={right_panel === item}
              className={right_panel === item ? 'rail-icon-button is-active' : 'rail-icon-button'}
              key={item}
              {...hover_description(PANEL_TOOLTIPS[item])}
              onClick={() => open_right_panel(item)}
              type='button'
            >
              <span aria-hidden='true' className={PANEL_ICON_CLASS[item]} />
            </button>
          ))}
        </div>
        <button
          aria-expanded={!right_collapsed}
          aria-label={right_collapsed ? '展开右侧栏' : '收起右侧栏'}
          className='rail-toggle rail-toggle-expanded'
          {...hover_description(right_collapsed ? '展开检查、编辑、来源和模型面板' : '收起右侧工作面板')}
          onClick={() => set_right_collapsed((current) => !current)}
          type='button'
        >
          {right_collapsed ? '展开' : '收起'}
        </button>
        <div aria-hidden={right_collapsed} className='rail-content'>
        <nav className='panel-tabs' aria-label='工作台功能'>
          {(Object.keys(PANEL_LABELS) as RightPanel[]).map((item) => (
            <button
              {...hover_description(PANEL_TOOLTIPS[item])}
              aria-pressed={right_panel === item}
              key={item}
              onClick={() => set_right_panel(item)}
              type='button'
            >
              {PANEL_LABELS[item]}
            </button>
          ))}
        </nav>

        {render_panel()}
        </div>
      </aside>
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
