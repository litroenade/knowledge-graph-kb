import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GraphSettingsPanel } from './GraphSettingsPanel';

afterEach(() => {
  cleanup();
});

function render_panel(has_selected = false) {
  render(
    <GraphSettingsPanel
      auto_save_layout={true}
      density={48}
      fixed_node_count={3}
      has_selected={has_selected}
      layout_status='中等规模图谱已自动冻结'
      link_distance={94}
      local_depth={2}
      on_auto_save_layout_change={vi.fn()}
      on_density_change={vi.fn()}
      on_fix_neighborhood={vi.fn()}
      on_fix_selected={vi.fn()}
      on_link_distance_change={vi.fn()}
      on_local_depth_change={vi.fn()}
      on_release_all={vi.fn()}
      on_release_selected={vi.fn()}
      on_repulsion_change={vi.fn()}
      on_reset_layout={vi.fn()}
      on_restore_layout={vi.fn()}
      on_save_layout={vi.fn()}
      on_show_labels_change={vi.fn()}
      repulsion={180}
      show_labels={true}
    />,
  );
}

describe('GraphSettingsPanel', () => {
  it('uses a product-neutral graph control title', () => {
    render_panel();

    expect(screen.getByText('图谱控制')).toBeInTheDocument();
    expect(screen.queryByText(/Obsidian/)).not.toBeInTheDocument();
  });

  it('disables selected-node layout actions until there is a selection', () => {
    render_panel(false);

    expect(screen.getByRole('button', { name: '固定选中' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '释放选中' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '固定一度邻域' })).toBeDisabled();
  });

  it('exposes hover descriptions for layout actions', () => {
    render_panel(true);

    expect(screen.getByRole('button', { name: '保存布局' })).toHaveAttribute(
      'data-tooltip',
      '保存当前节点位置和固定状态',
    );
    expect(screen.getByRole('button', { name: '固定一度邻域' })).toHaveAttribute(
      'title',
      '固定当前节点和一度邻居，保护核心骨架',
    );
  });
});
