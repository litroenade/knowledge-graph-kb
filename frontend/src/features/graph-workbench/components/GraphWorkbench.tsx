import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_SCOPE, fetch_edge_detail, fetch_graph, fetch_node_detail, fetch_ready, fetch_sources } from '../../../shared/api/kb';
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
import { ChatPanel } from './panels/ChatPanel';
import { GraphEditorPanel } from './panels/GraphEditorPanel';
import { GraphSettingsPanel } from './panels/GraphSettingsPanel';
import { ImportPanel } from './panels/ImportPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { ModelConfigPanel } from './panels/ModelConfigPanel';
import { SourceDetailPanel } from './panels/SourceDetailPanel';
import { GraphCanvas } from './GraphCanvas';

type ViewportCommand = { id: number; type: 'fit' | 'focus' | 'relayout' };
type RightPanel = 'inspector' | 'edit' | 'source' | 'import' | 'chat' | 'model';

const EMPTY_GRAPH: KnowledgeGraph = { view: 'semantic', nodes: [], edges: [] };
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
  const [node_detail, set_node_detail] = useState<GraphNodeDetail | null>(null);
  const [edge_detail, set_edge_detail] = useState<GraphEdgeDetail | null>(null);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [show_labels, set_show_labels] = useState(true);
  const [physics_running, set_physics_running] = useState(true);
  const [link_distance, set_link_distance] = useState(92);
  const [repulsion, set_repulsion] = useState(180);
  const [right_panel, set_right_panel] = useState<RightPanel>('inspector');
  const [viewport_command, set_viewport_command] = useState<ViewportCommand | null>(null);

  const graph_scope = useMemo<KBScope>(() => {
    const source_ids = build_scope_source_ids(selected_source_ids);
    return {
      ...DEFAULT_SCOPE,
      mode: source_ids.length ? 'subset' : 'all',
      source_ids,
    };
  }, [selected_source_ids]);

  const load = useCallback(async () => {
    set_loading(true);
    set_error(null);
    try {
      const [next_ready, next_sources, next_graph] = await Promise.all([
        fetch_ready().catch(() => null),
        fetch_sources(),
        fetch_graph({ scope: graph_scope, view, density }),
      ]);
      set_ready(next_ready);
      set_sources(next_sources);
      set_graph(next_graph);
    } catch (current_error) {
      set_error((current_error as Error).message);
    } finally {
      set_loading(false);
    }
  }, [density, graph_scope, view]);

  useEffect(() => {
    void load();
  }, [load]);

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
        set_error((current_error as Error).message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  function issue_viewport(type: ViewportCommand['type']): void {
    set_viewport_command((current) => ({ id: (current?.id ?? 0) + 1, type }));
  }

  function toggle_source(source_id: string): void {
    set_selected_source_ids((current) =>
      current.includes(source_id)
        ? current.filter((item) => item !== source_id)
        : [...current, source_id],
    );
  }

  function select_node(node_id: string): void {
    set_selected({ type: 'node', id: node_id });
    set_right_panel((current) => current === 'chat' ? current : 'inspector');
    set_viewport_command((current) => ({ id: (current?.id ?? 0) + 1, type: 'focus' }));
  }

  function select_edge(edge_id: string): void {
    set_selected({ type: 'edge', id: edge_id });
    set_right_panel('inspector');
    set_viewport_command((current) => ({ id: (current?.id ?? 0) + 1, type: 'focus' }));
  }

  function clear_selection(): void {
    set_selected(null);
    set_node_detail(null);
    set_edge_detail(null);
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

  return (
    <main className='workbench-shell'>
      <aside className='left-rail'>
        <section className='brand-block'>
          <span>A_Memorix</span>
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
            <button onClick={() => set_selected_source_ids([])} type='button'>全部</button>
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
      </aside>

      <section className='graph-stage'>
        <header className='topbar'>
          <div className='segmented'>
            {(['semantic', 'evidence', 'structure'] as GraphDataView[]).map((item) => (
              <button
                aria-pressed={view === item}
                key={item}
                onClick={() => set_view(item)}
                type='button'
              >
                {VIEW_LABELS[item]}
              </button>
            ))}
          </div>

          <div className='toolbar'>
            <button aria-pressed={graph_mode === 'global'} onClick={() => set_graph_mode('global')} type='button'>
              全局图
            </button>
            <button
              aria-pressed={graph_mode === 'local'}
              disabled={selected?.type !== 'node'}
              onClick={() => set_graph_mode('local')}
              type='button'
            >
              局部图
            </button>
            <button onClick={() => issue_viewport('fit')} type='button'>适配</button>
            <button disabled={!selected} onClick={() => issue_viewport('focus')} type='button'>聚焦</button>
            <button onClick={() => issue_viewport('relayout')} type='button'>重排</button>
            <button
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
          {loading ? <span>同步中</span> : null}
          {error ? <span className='is-danger'>{error}</span> : null}
        </section>

        <GraphCanvas
          edges={projected.edges}
          link_distance={link_distance}
          neighborhood={neighborhood}
          nodes={projected.nodes}
          on_clear_selection={clear_selection}
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

      <aside className='right-panel'>
        <nav className='panel-tabs' aria-label='工作台功能'>
          {(Object.keys(PANEL_LABELS) as RightPanel[]).map((item) => (
            <button
              aria-pressed={right_panel === item}
              key={item}
              onClick={() => set_right_panel(item)}
              type='button'
            >
              {PANEL_LABELS[item]}
            </button>
          ))}
        </nav>

        <GraphSettingsPanel
          density={density}
          link_distance={link_distance}
          local_depth={local_depth}
          on_density_change={set_density}
          on_link_distance_change={set_link_distance}
          on_local_depth_change={set_local_depth}
          on_repulsion_change={set_repulsion}
          on_show_labels_change={set_show_labels}
          repulsion={repulsion}
          show_labels={show_labels}
        />

        {render_panel()}
      </aside>
    </main>
  );
}
