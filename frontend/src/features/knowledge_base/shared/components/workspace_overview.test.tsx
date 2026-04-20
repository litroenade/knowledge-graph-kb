import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceOverview } from './workspace_overview';

vi.mock('../hooks/use_workspace_shell', () => ({
  use_workspace_shell: () => ({
    active_workspace: 'graph',
    set_active_workspace: vi.fn(),
    overview_global_counts: [
      { label: '全局来源', value: 1 },
      { label: '运行中任务', value: 0 },
    ],
    overview_graph_counts: [
      { label: '语义实体', value: 88 },
      { label: '语义关系', value: 102 },
    ],
    semantic_scope_source_anchor_count: 1,
    semantic_scope_provenance_count: 88,
    selected_source_summary: '全部来源',
    focus_summary: '准备开始新的知识问答',
  }),
}));

describe('WorkspaceOverview', () => {
  it('shows unified overview counts with explicit count scope labels', () => {
    render(<WorkspaceOverview collapsed={false} />);

    expect(screen.getByText('全局来源')).toBeInTheDocument();
    expect(screen.getByText('运行中任务')).toBeInTheDocument();
    expect(screen.getByText('语义实体')).toBeInTheDocument();
    expect(screen.getByText('语义关系')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
    expect(screen.getByText('当前来源范围')).toBeInTheDocument();
    expect(screen.queryByText('图谱范围实体')).not.toBeInTheDocument();
    expect(screen.queryByText('图谱范围关系')).not.toBeInTheDocument();
  });
});
