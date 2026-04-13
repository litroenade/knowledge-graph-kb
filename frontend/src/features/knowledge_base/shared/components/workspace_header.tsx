import { WORKSPACE_TABS } from '../config/ui_constants';
import { use_workspace_shell } from '../hooks/use_workspace_shell';

interface WorkspaceHeaderProps {
  sidebar_collapsed: boolean;
  on_toggle_sidebar: () => void;
}

export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { sidebar_collapsed, on_toggle_sidebar } = props;
  const { active_workspace, focus_summary, selected_source_summary, message, error } = use_workspace_shell();
  const active_tab = WORKSPACE_TABS.find((tab) => tab.id === active_workspace) ?? WORKSPACE_TABS[0];
  const status_text = error ?? message ?? '知识库已就绪。';

  return (
    <header className='kb-toolbar'>
      <div className='kb-toolbar-leading'>
        <button
          aria-label={sidebar_collapsed ? '展开侧边栏' : '收起侧边栏'}
          className='kb-sidebar-toggle kb-sidebar-toggle-main'
          onClick={on_toggle_sidebar}
          type='button'
        >
          <span>{sidebar_collapsed ? '>' : '<'}</span>
        </button>

        <div className='kb-toolbar-copy'>
          <span className='kb-context-label'>工作区</span>
          <strong>{active_tab.label}</strong>
          <p>{active_tab.description}</p>
        </div>
      </div>

      <div className='kb-toolbar-status'>
        <div className='kb-toolbar-focus-card'>
          <div className='kb-toolbar-focus-row'>
            <div className='kb-toolbar-focus-copy'>
              <span className='kb-context-label'>当前焦点</span>
              <strong>{focus_summary}</strong>
            </div>
            <span className='kb-meta-pill'>{selected_source_summary}</span>
          </div>

          <span className={`kb-toolbar-message ${error ? 'is-error' : ''}`}>{status_text}</span>
        </div>
      </div>
    </header>
  );
}
