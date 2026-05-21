import { lazy, Suspense } from 'react';

import type { GraphDataView, SystemReady } from '../../../../shared/types/kb';
import type {
  GraphMode,
  Neighborhood,
  ProjectedGraph,
  RuntimeProfile,
  Selection,
} from '../../model/graphModel';
import type { GraphLayoutNodeSnapshot } from '../../model/layoutPersistence';
import { hover_description } from '../hoverDescription';
import type { LayoutCommand } from '../GraphCanvas';
import { WorkspaceHeader } from './WorkspaceHeader';

const GraphCanvas = lazy(() => import('../GraphCanvas').then((module) => ({ default: module.GraphCanvas })));

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

const VIEW_TOOLTIPS: Record<GraphDataView, string> = {
  semantic: '查看实体与语义关系，适合探索概念连接和选择证据锚点。',
  evidence: '围绕已选节点或关系查看证据段落、来源和引用链。',
  structure: '查看来源、段落、表格等文档结构关系。',
};

interface GraphWorkspaceProps {
  active_physics: boolean;
  error: string | null;
  graph_mode: GraphMode;
  graph_notice: string | null;
  layout_command: LayoutCommand | null;
  link_distance: number;
  loading: boolean;
  neighborhood: Neighborhood;
  profile: RuntimeProfile;
  projected: ProjectedGraph;
  ready: SystemReady | null;
  repulsion: number;
  selected: Selection;
  show_labels: boolean;
  view: GraphDataView;
  view_hint: string;
  viewport_command: { id: number; type: 'fit' | 'focus' | 'relayout' } | null;
  on_clear_selection: () => void;
  on_graph_mode_change: (mode: GraphMode) => void;
  on_layout_change: (nodes: GraphLayoutNodeSnapshot[]) => void;
  on_layout_snapshot: (nodes: GraphLayoutNodeSnapshot[]) => void;
  on_physics_auto_stop: () => void;
  on_physics_running_change: (updater: (current: boolean) => boolean) => void;
  on_select_edge: (edge_id: string) => void;
  on_select_graph_view: (view: GraphDataView) => void;
  on_select_node: (node_id: string) => void;
  on_viewport_command: (type: 'fit' | 'focus' | 'relayout') => void;
}

export function GraphWorkspace(props: GraphWorkspaceProps) {
  return (
    <section aria-label='图谱' className='workspace-stage graph-stage'>
      <WorkspaceHeader
        actions={
          <>
            <div aria-label='图谱视图' className='segmented'>
              {(['semantic', 'evidence', 'structure'] as GraphDataView[]).map((item) => (
                <button
                  {...hover_description(VIEW_TOOLTIPS[item])}
                  aria-pressed={props.view === item}
                  key={item}
                  onClick={() => props.on_select_graph_view(item)}
                  type='button'
                >
                  {VIEW_LABELS[item]}
                </button>
              ))}
            </div>

            <div aria-label='图谱操作' className='toolbar'>
              <button
                {...hover_description('显示当前范围内的完整图谱')}
                aria-pressed={props.graph_mode === 'global'}
                onClick={() => props.on_graph_mode_change('global')}
                type='button'
              >
                全局图
              </button>
              <button
                {...hover_description(props.selected?.type === 'node' ? '围绕当前节点按局部深度裁剪图谱' : '需要先选中一个节点才能进入局部图')}
                aria-pressed={props.graph_mode === 'local'}
                disabled={props.selected?.type !== 'node'}
                onClick={() => props.on_graph_mode_change('local')}
                type='button'
              >
                局部图
              </button>
              <button {...hover_description('缩放并移动视角，使当前图谱完整可见')} onClick={() => props.on_viewport_command('fit')} type='button'>
                适配
              </button>
              <button
                {...hover_description(props.selected ? '聚焦当前选中节点、关系及其邻域' : '需要先选中节点或关系')}
                disabled={!props.selected}
                onClick={() => props.on_viewport_command('focus')}
                type='button'
              >
                聚焦
              </button>
              <button {...hover_description('重新分配节点初始位置，并重启布局计算')} onClick={() => props.on_viewport_command('relayout')} type='button'>
                重排
              </button>
              <button
                {...hover_description(props.profile.physics_enabled ? (props.active_physics ? '暂停 d3-force 物理模拟，冻结当前布局' : '继续运行物理模拟，自动整理节点') : '大图静态模式下物理模拟已禁用')}
                aria-pressed={props.active_physics}
                disabled={!props.profile.physics_enabled}
                onClick={() => props.on_physics_running_change((current) => !current)}
                type='button'
              >
                {props.profile.physics_enabled ? (props.active_physics ? '暂停物理' : '运行物理') : '静态大图'}
              </button>
            </div>
          </>
        }
        className='graph-workspace-header'
        description='浏览、筛选和整理当前知识网络，选中实体后可聚焦邻域和证据链。'
        eyebrow='Graph'
        title='图谱'
      />

      <section className='status-strip'>
        <span>{props.projected.visible_node_count}/{props.projected.total_node_count} 节点</span>
        <span>{props.projected.visible_edge_count}/{props.projected.total_edge_count} 关系</span>
        <span>{PROFILE_LABELS[props.profile.mode]} · {Math.round(props.profile.complexity)}</span>
        <span>{props.ready?.status ?? 'ready: unknown'}</span>
        <span className='is-note'>{props.view_hint}</span>
        {props.loading ? <span>同步中</span> : null}
        {props.graph_notice ? <span className='is-note'>{props.graph_notice}</span> : null}
        {props.error ? <span className='is-danger'>{props.error}</span> : null}
      </section>

      <Suspense fallback={<div className='graph-canvas-shell'><div className='graph-overlay-message'>正在加载图谱画布</div></div>}>
        <GraphCanvas
          edges={props.projected.edges}
          layout_command={props.layout_command}
          link_distance={props.link_distance}
          neighborhood={props.neighborhood}
          nodes={props.projected.nodes}
          on_clear_selection={props.on_clear_selection}
          on_layout_change={props.on_layout_change}
          on_layout_snapshot={props.on_layout_snapshot}
          on_physics_auto_stop={props.on_physics_auto_stop}
          on_select_edge={props.on_select_edge}
          on_select_node={props.on_select_node}
          physics_running={props.active_physics}
          profile={props.profile}
          repulsion={props.repulsion}
          selected={props.selected}
          show_labels={props.show_labels}
          viewport_command={props.viewport_command}
        />
      </Suspense>
    </section>
  );
}
