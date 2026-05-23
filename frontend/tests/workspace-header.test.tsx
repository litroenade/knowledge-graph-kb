import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GraphWorkspace } from '../src/features/graph-workbench/components/workspaces/GraphWorkspace';
import { ImportWorkspace } from '../src/features/graph-workbench/components/workspaces/ImportWorkspace';
import { ChatWorkspace } from '../src/features/graph-workbench/components/workspaces/ChatWorkspace';
import type { KBScope } from '../src/shared/types/kb';

vi.mock('../src/features/graph-workbench/components/GraphCanvas', () => ({
  GraphCanvas: () => <div>graph canvas</div>,
}));

vi.mock('../src/features/graph-workbench/components/panels/ImportPanel', () => ({
  ImportPanel: () => <div>import panel</div>,
}));

vi.mock('../src/features/graph-workbench/components/panels/ChatPanel', () => ({
  ChatPanel: () => <div>chat panel</div>,
}));

vi.mock('../src/features/graph-workbench/components/workspaces/ModelConfigPopover', () => ({
  ModelConfigPopover: () => <button type='button'>模型配置</button>,
}));

const scope: KBScope = {
  excluded_source_ids: [],
  mode: 'all',
  source_ids: [],
  version_id: null,
  version_mode: 'latest',
};

describe('workspace page headers', () => {
  it('keeps graph, import, and chat workspaces on the same header contract', () => {
    expect_header(
      <GraphWorkspace
        active_physics={false}
        error={null}
        graph_mode='global'
        graph_notice={null}
        layout_command={null}
        link_distance={92}
        loading={false}
        neighborhood={{ depth: 1, node_ids: new Set(), edge_ids: new Set() }}
        profile={{ complexity: 0, mode: 'standard', physics_enabled: true }}
        projected={{ edges: [], nodes: [], total_edge_count: 0, total_node_count: 0, visible_edge_count: 0, visible_node_count: 0 }}
        ready={null}
        repulsion={180}
        selected={null}
        show_labels={true}
        view='semantic'
        view_hint='语义图'
        viewport_command={null}
        on_clear_selection={vi.fn()}
        on_graph_mode_change={vi.fn()}
        on_layout_change={vi.fn()}
        on_layout_snapshot={vi.fn()}
        on_physics_auto_stop={vi.fn()}
        on_physics_running_change={vi.fn()}
        on_select_edge={vi.fn()}
        on_select_graph_view={vi.fn()}
        on_select_node={vi.fn()}
        on_viewport_command={vi.fn()}
      />,
      '图谱',
    );

    expect_header(<ImportWorkspace on_import_finished={vi.fn()} ready={null} />, '导入中心');
    expect_header(<ChatWorkspace on_focus_node={vi.fn()} on_saved={vi.fn()} ready={null} scope={scope} />, '知识问答');
  });

  it('keeps import strategy workflow copy aligned with backend strategies', () => {
    render(<ImportWorkspace on_import_finished={vi.fn()} ready={null} />);

    expect(screen.getByText('选择 auto、factual、narrative 或 quote')).toBeInTheDocument();
    expect(screen.queryByText(/plain、table 或 openie/)).not.toBeInTheDocument();
  });
});

function expect_header(element: JSX.Element, title: string): void {
  const { unmount } = render(element);

  expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  expect(screen.getByLabelText('页面操作')).toBeInTheDocument();

  unmount();
}
