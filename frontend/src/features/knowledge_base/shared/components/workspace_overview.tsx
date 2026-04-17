import { WORKSPACE_TABS } from '../config/ui_constants';
import { use_workspace_shell } from '../hooks/use_workspace_shell';

interface WorkspaceOverviewProps {
  collapsed: boolean;
  on_toggle_sidebar?: () => void;
}

const TAB_ICONS = {
  chat: '问',
  import: '导',
  graph: '图',
} as const;

export function WorkspaceOverview(props: WorkspaceOverviewProps) {
  const { collapsed, on_toggle_sidebar } = props;
  const {
    active_workspace,
    set_active_workspace,
    document_count,
    active_task_count,
    node_count,
    edge_count,
    graph_data_view,
    semantic_scope_entity_count,
    semantic_scope_relation_count,
    selected_source_summary,
    focus_summary,
  } = use_workspace_shell();

  if (collapsed) {
    return null;
  }

  const is_semantic_graph_workspace = active_workspace === 'graph' && graph_data_view === 'semantic';
  const scope_node_label = is_semantic_graph_workspace ? '图谱范围实体' : '图谱范围节点';
  const scope_node_value = is_semantic_graph_workspace ? semantic_scope_entity_count : node_count;
  const scope_edge_label = is_semantic_graph_workspace ? '图谱范围关系' : '图谱范围边';
  const scope_edge_value = is_semantic_graph_workspace ? semantic_scope_relation_count : edge_count;

  return (
    <aside className='kb-overview-panel'>
      <div className='kb-sidebar-brand'>
        <div aria-hidden='true' className='kb-sidebar-mark'>
          KB
        </div>
        <div className='kb-sidebar-brand-copy'>
          <span className='kb-context-label'>Knowledge Base</span>
          <strong>知识库工作区</strong>
          <p>在同一工作区中切换问答、导入和图谱，并保留跨面板的上下文。</p>
        </div>
        {on_toggle_sidebar ? (
          <button
            aria-label='收起侧边栏'
            className='kb-sidebar-toggle kb-sidebar-toggle-inline'
            onClick={on_toggle_sidebar}
            type='button'
          >
            <span>{'<'}</span>
          </button>
        ) : null}
      </div>

      <div className='kb-sidebar-mini-stats'>
        <div className='kb-sidebar-stat'>
          <span>可用来源</span>
          <strong>{document_count}</strong>
        </div>
        <div className='kb-sidebar-stat'>
          <span>进行中任务</span>
          <strong>{active_task_count}</strong>
        </div>
        <div className='kb-sidebar-stat'>
          <span>{scope_node_label}</span>
          <strong>{scope_node_value}</strong>
        </div>
        <div className='kb-sidebar-stat'>
          <span>{scope_edge_label}</span>
          <strong>{scope_edge_value}</strong>
        </div>
      </div>

      <div className='kb-sidebar-context-grid'>
        <div className='kb-context-card'>
          <span className='kb-context-label'>当前来源范围</span>
          <strong>{selected_source_summary}</strong>
        </div>
        {active_workspace !== 'graph' ? (
          <div className='kb-context-card'>
            <span className='kb-context-label'>当前焦点</span>
            <strong>{focus_summary}</strong>
          </div>
        ) : null}
      </div>

      <nav aria-label='知识库工作区导航' className='kb-sidebar-nav'>
        {WORKSPACE_TABS.map((tab) => {
          const is_active = tab.id === active_workspace;
          return (
            <button
              aria-label={tab.label}
              className={`kb-sidebar-link ${is_active ? 'is-active' : ''}`}
              key={tab.id}
              onClick={() => set_active_workspace(tab.id)}
              type='button'
            >
              <span aria-hidden='true' className='kb-sidebar-link-icon'>
                {TAB_ICONS[tab.id]}
              </span>
              <span className='kb-sidebar-link-copy'>
                <strong>{tab.label}</strong>
                <span>{tab.description}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
