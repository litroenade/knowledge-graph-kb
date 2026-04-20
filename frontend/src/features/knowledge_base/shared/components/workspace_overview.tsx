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
    overview_global_counts,
    overview_graph_counts,
    selected_source_summary,
    focus_summary,
  } = use_workspace_shell();

  if (collapsed) {
    return null;
  }

  return (
    <aside className={`kb-overview-panel ${on_toggle_sidebar ? 'has-sidebar-toggle' : ''}`}>
      {on_toggle_sidebar ? (
        <button
          aria-label='收起侧边栏'
          className='kb-sidebar-toggle kb-sidebar-toggle-panel'
          onClick={on_toggle_sidebar}
          type='button'
        >
          <span>{'<'}</span>
        </button>
      ) : null}
      <div className='kb-sidebar-brand'>
        <div aria-hidden='true' className='kb-sidebar-mark'>
          KB
        </div>
        <div className='kb-sidebar-brand-copy'>
          <span className='kb-context-label'>Knowledge Base</span>
          <strong>知识库工作区</strong>
          <p>在同一工作区中切换问答、导入和图谱，并保留跨面板的上下文。</p>
        </div>
      </div>

      <div className='kb-sidebar-mini-stats'>
        {[...overview_global_counts, ...overview_graph_counts].map((item) => (
          <div className='kb-sidebar-stat' key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
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
