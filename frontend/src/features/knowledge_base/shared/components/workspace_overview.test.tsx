import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceOverview } from './workspace_overview';

vi.mock('../hooks/use_workspace_shell', () => ({
  use_workspace_shell: () => ({
    active_workspace: 'graph',
    set_active_workspace: vi.fn(),
    document_count: 1,
    active_task_count: 0,
    node_count: 89,
    edge_count: 190,
    graph_data_view: 'semantic',
    semantic_scope_entity_count: 88,
    semantic_scope_relation_count: 102,
    semantic_scope_source_anchor_count: 1,
    semantic_scope_provenance_count: 88,
    selected_source_summary: '全部来源',
    focus_summary: '准备开始新的知识问答',
  }),
}));

describe('WorkspaceOverview', () => {
  it('shows semantic scope counts in graph semantic workspace', () => {
    render(<WorkspaceOverview collapsed={false} />);

    expect(screen.getByText('范围实体')).toBeInTheDocument();
    expect(screen.getByText('语义关系')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
    expect(screen.queryByText('范围节点')).not.toBeInTheDocument();
    expect(screen.queryByText('范围关系')).not.toBeInTheDocument();
  });
});
