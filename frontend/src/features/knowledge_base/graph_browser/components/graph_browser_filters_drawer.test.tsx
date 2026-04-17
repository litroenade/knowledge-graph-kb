import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { create_source_record } from '../../shared/test_helpers/workspace_slice_fixtures';
import { GraphBrowserFiltersDrawer } from './graph_browser_filters_drawer';

describe('GraphBrowserFiltersDrawer', () => {
  it('separates graph scope, visible canvas counts, and source raw stats', () => {
    const source = create_source_record({
      id: 'source-1',
      name: '刷机知识.txt',
      summary: '136 paragraphs, 458 entities, 571 relations',
      metadata: {
        paragraph_count: 136,
        entity_count: 458,
        relation_count: 571,
      },
    });

    render(
      <GraphBrowserFiltersDrawer
        density={100}
        filtered_sources={[source]}
        graph_data_view='semantic'
        graph_scope_summary='345 实体 / 431 关系'
        on_clear_source_filters={vi.fn()}
        on_close={vi.fn()}
        on_reset_graph_filters={vi.fn()}
        on_select_graph_data_view={vi.fn()}
        on_set_density={vi.fn()}
        on_source_keyword_change={vi.fn()}
        on_toggle_source={vi.fn()}
        selected_source_ids={[source.id]}
        source_keyword=''
        source_scope_label='当前范围：刷机知识.txt'
        sources={[source]}
        visible_graph_summary='287 实体 / 389 关系 / 1 锚点 / 53 连接'
      />,
    );

    expect(screen.getByText('当前图谱范围')).toBeInTheDocument();
    expect(screen.getByText('345 实体 / 431 关系')).toBeInTheDocument();
    expect(screen.getByText('当前画布可见')).toBeInTheDocument();
    expect(screen.getByText('287 实体 / 389 关系 / 1 锚点 / 53 连接')).toBeInTheDocument();
    expect(screen.getByText('段落 136 / 实体 458 / 关系 571')).toBeInTheDocument();
    expect(screen.queryByText('136 paragraphs, 458 entities, 571 relations')).not.toBeInTheDocument();
  });
});
