import { createRef } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GraphBrowserToolbar } from './graph_browser_toolbar';

describe('GraphBrowserToolbar', () => {
  it('shows a compact toolbar layout with inline zoom controls', () => {
    const on_zoom_in = vi.fn();
    const on_zoom_out = vi.fn();
    const { container } = render(
      <GraphBrowserToolbar
        active_search_candidate={null}
        active_search_index={0}
        can_enter_local_graph={true}
        graph_view_mode='global'
        has_focus_target={false}
        node_keyword=''
        node_matches={[]}
        on_apply_search={(event) => event.preventDefault()}
        on_choose_search_candidate={vi.fn()}
        on_enter_global_graph={vi.fn()}
        on_enter_local_graph={vi.fn()}
        on_fit_all={vi.fn()}
        on_focus_selected={vi.fn()}
        on_node_keyword_change={vi.fn()}
        on_open_create_node={vi.fn()}
        on_open_filters={vi.fn()}
        on_open_relation={vi.fn()}
        on_relayout_graph={vi.fn()}
        on_refresh_graph={vi.fn()}
        on_search_focus={vi.fn()}
        on_search_key_down={vi.fn()}
        on_search_shell_blur={vi.fn()}
        on_zoom_in={on_zoom_in}
        on_zoom_out={on_zoom_out}
        search_results_visible={false}
        search_shell_ref={createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.queryByText('语义主图')).not.toBeInTheDocument();
    expect(
      screen.queryByText('默认先阅读实体关系；证据和结构放到筛选抽屉与属性面板里下钻。'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '筛选与显示' })).toBeInTheDocument();
    expect(screen.getByText('编辑图谱')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '放大图谱' }));
    fireEvent.click(screen.getByRole('button', { name: '缩小图谱' }));

    expect(on_zoom_in).toHaveBeenCalledTimes(1);
    expect(on_zoom_out).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.kb-graph-toolbar-row.is-controls')).toBeInTheDocument();
    expect(container.querySelector('.kb-graph-toolbar-search-panel')).toBeInTheDocument();
    expect(container.querySelector('.kb-graph-toolbar-controls-panel')).toBeInTheDocument();
  });
});
