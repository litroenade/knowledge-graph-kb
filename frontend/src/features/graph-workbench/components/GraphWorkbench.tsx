import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_SCOPE, fetch_edge_detail, fetch_graph, fetch_node_detail, fetch_ready, fetch_sources } from '../../../shared/api/kb';
import type {
  GraphDataView,
  GraphEdgeDetail,
  GraphNodeDetail,
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
import { GraphCanvas } from './GraphCanvas';

type ViewportCommand = { id: number; type: 'fit' | 'focus' | 'relayout' };

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
  const [viewport_command, set_viewport_command] = useState<ViewportCommand | null>(null);

  const load = useCallback(async () => {
    set_loading(true);
    set_error(null);
    try {
      const scope_source_ids = build_scope_source_ids(selected_source_ids);
      const [next_ready, next_sources, next_graph] = await Promise.all([
        fetch_ready().catch(() => null),
        fetch_sources(),
        fetch_graph({
          scope: {
            ...DEFAULT_SCOPE,
            mode: scope_source_ids.length ? 'subset' : 'all',
            source_ids: scope_source_ids,
          },
          view,
          density,
        }),
      ]);
      set_ready(next_ready);
      set_sources(next_sources);
      set_graph(next_graph);
    } catch (current_error) {
      set_error((current_error as Error).message);
    } finally {
      set_loading(false);
    }
  }, [density, selected_source_ids, view]);

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
    set_viewport_command((current) => ({ id: (current?.id ?? 0) + 1, type: 'focus' }));
  }

  function select_edge(edge_id: string): void {
    set_selected({ type: 'edge', id: edge_id });
    set_viewport_command((current) => ({ id: (current?.id ?? 0) + 1, type: 'focus' }));
  }

  function clear_selection(): void {
    set_selected(null);
    set_node_detail(null);
    set_edge_detail(null);
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
        <section className='control-section'>
          <div className='section-heading'>
            <span>Obsidian 图谱控制</span>
          </div>
          <label className='field is-inline'>
            <span>标签</span>
            <input checked={show_labels} onChange={(event) => set_show_labels(event.target.checked)} type='checkbox' />
          </label>
          <label className='field'>
            <span>密度 {density}%</span>
            <input max='100' min='20' onChange={(event) => set_density(Number(event.target.value))} type='range' value={density} />
          </label>
          <label className='field'>
            <span>局部深度 {local_depth}</span>
            <input max='3' min='1' onChange={(event) => set_local_depth(Number(event.target.value))} type='range' value={local_depth} />
          </label>
          <label className='field'>
            <span>连接距离 {link_distance}</span>
            <input max='180' min='48' onChange={(event) => set_link_distance(Number(event.target.value))} type='range' value={link_distance} />
          </label>
          <label className='field'>
            <span>斥力 {repulsion}</span>
            <input max='360' min='60' onChange={(event) => set_repulsion(Number(event.target.value))} type='range' value={repulsion} />
          </label>
        </section>

        <section className='inspector'>
          <div className='section-heading'>
            <span>检查器</span>
            {selected ? <button onClick={clear_selection} type='button'>清除</button> : null}
          </div>
          {!selected ? <p className='muted'>点击节点或关系查看详情；空白点击会清理焦点。</p> : null}
          {selected_node ? (
            <DetailBlock
              title={selected_node.display_name}
              rows={[
                ['类型', selected_node.kind_label ?? selected_node.type],
                ['连接数', String(selected_node.degree)],
                ['来源', selected_node.source_label ?? '无直接来源'],
                ['证据', String(selected_node.evidence_count ?? 0)],
              ]}
            />
          ) : null}
          {selected_edge ? (
            <DetailBlock
              title={selected_edge.display_name}
              rows={[
                ['起点', selected_edge.source_name_resolved],
                ['终点', selected_edge.target_name_resolved],
                ['类型', selected_edge.relation_kind_label ?? selected_edge.type],
                ['权重', String(selected_edge.weight)],
              ]}
            />
          ) : null}
          {node_detail ? (
            <PreviewList
              title='关联证据'
              items={node_detail.paragraphs.map((item, index) => preview_text(item, `证据段落 ${index + 1}`))}
            />
          ) : null}
          {edge_detail?.paragraph ? (
            <PreviewList title='关系证据' items={[preview_text(edge_detail.paragraph, '关系证据')]} />
          ) : null}
        </section>
      </aside>
    </main>
  );
}

function DetailBlock(props: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className='detail-block'>
      <strong>{props.title}</strong>
      {props.rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

function PreviewList(props: { title: string; items: string[] }) {
  return (
    <div className='preview-list'>
      <strong>{props.title}</strong>
      {props.items.slice(0, 5).map((item, index) => (
        <p key={`${props.title}-${index}`}>{item}</p>
      ))}
    </div>
  );
}

function preview_text(value: Record<string, unknown>, fallback: string): string {
  for (const key of ['content', 'excerpt', 'summary', 'display_label', 'label', 'name']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return fallback;
}
