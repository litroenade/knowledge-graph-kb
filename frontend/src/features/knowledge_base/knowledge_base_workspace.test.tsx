import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { KnowledgeBaseWorkspace } from './knowledge_base_workspace';

const { use_workspace_shell_mock } = vi.hoisted(() => ({
  use_workspace_shell_mock: vi.fn(),
}));

vi.mock('./shared/context/knowledge_base_workspace_context', () => ({
  KnowledgeBaseWorkspaceProvider: (props: { children: ReactNode }) => props.children,
}));

vi.mock('./shared/hooks/use_workspace_shell', () => ({
  use_workspace_shell: use_workspace_shell_mock,
}));

vi.mock('./shared/components/workspace_body', () => ({
  WorkspaceBody: () => <div>workspace-body</div>,
}));

vi.mock('./shared/components/workspace_overview', () => ({
  WorkspaceOverview: (props: { on_toggle_sidebar?: () => void }) => (
    <aside>
      <span>workspace-overview</span>
      {props.on_toggle_sidebar ? (
        <button aria-label='收起侧边栏' onClick={props.on_toggle_sidebar} type='button'>
          collapse
        </button>
      ) : null}
    </aside>
  ),
}));

describe('KnowledgeBaseWorkspace', () => {
  it('does not render the old shared header blocks', () => {
    use_workspace_shell_mock.mockReturnValue({
      sidebar_collapsed: false,
      set_sidebar_collapsed: vi.fn(),
      sidebar_width: 280,
      set_sidebar_width: vi.fn(),
    });

    render(
      <KnowledgeBaseWorkspace
        resolved_theme='dark'
        set_theme_mode={vi.fn()}
        theme_mode='dark'
      />,
    );

    expect(screen.getByText('workspace-body')).toBeInTheDocument();
    expect(screen.queryByText('工作区')).not.toBeInTheDocument();
    expect(screen.queryByText('当前焦点')).not.toBeInTheDocument();
  });

  it('shows a compact expand control when the sidebar is collapsed', () => {
    use_workspace_shell_mock.mockReturnValue({
      sidebar_collapsed: true,
      set_sidebar_collapsed: vi.fn(),
      sidebar_width: 280,
      set_sidebar_width: vi.fn(),
    });

    render(
      <KnowledgeBaseWorkspace
        resolved_theme='dark'
        set_theme_mode={vi.fn()}
        theme_mode='dark'
      />,
    );

    expect(screen.getByRole('button', { name: '展开侧边栏' })).toBeInTheDocument();
  });
});
