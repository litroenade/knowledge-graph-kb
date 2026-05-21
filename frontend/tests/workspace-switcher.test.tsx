import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceSwitcher } from '../src/features/graph-workbench/components/workspaces/WorkspaceSwitcher';
import { WORKSPACE_ITEMS, WORKSPACE_LABELS, type WorkspaceView } from '../src/features/graph-workbench/model/workspaceLayout';

describe('WorkspaceSwitcher', () => {
  it('uses the same workspace buttons in icon and label variants', () => {
    const on_select_workspace = vi.fn();

    const { rerender } = render(
      <WorkspaceSwitcher active_workspace='graph' on_select_workspace={on_select_workspace} variant='label' />,
    );

    for (const item of WORKSPACE_ITEMS) {
      expect(screen.getByRole('button', { name: `切换到${WORKSPACE_LABELS[item]}` })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: `切换到${WORKSPACE_LABELS.import}` }));
    expect(on_select_workspace).toHaveBeenLastCalledWith('import' satisfies WorkspaceView);

    rerender(<WorkspaceSwitcher active_workspace='chat' on_select_workspace={on_select_workspace} variant='icon' />);

    for (const item of WORKSPACE_ITEMS) {
      expect(screen.getByRole('button', { name: `切换到${WORKSPACE_LABELS[item]}` })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: `切换到${WORKSPACE_LABELS.graph}` }));
    expect(on_select_workspace).toHaveBeenLastCalledWith('graph' satisfies WorkspaceView);
  });
});
