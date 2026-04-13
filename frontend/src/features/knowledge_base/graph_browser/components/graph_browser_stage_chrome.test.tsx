import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GraphBrowserStageChrome } from './graph_browser_stage_chrome';

describe('GraphBrowserStageChrome', () => {
  it('shows source anchor legend by default and raw provenance legend only when expanded', () => {
    const { rerender } = render(
      <GraphBrowserStageChrome
        compact_selection={null}
        current_view_label='全局浏览'
        focus_label='当前焦点：全局图'
        layer_summary_label='语义图谱'
        paragraph_label={null}
        show_provenance_legend={false}
        show_source_anchor_legend={true}
      />,
    );

    expect(screen.getByText('实体节点')).toBeInTheDocument();
    expect(screen.getByText('语义关系')).toBeInTheDocument();
    expect(screen.getByText('来源锚点')).toBeInTheDocument();
    expect(screen.queryByText('来源连接')).not.toBeInTheDocument();

    rerender(
      <GraphBrowserStageChrome
        compact_selection={null}
        current_view_label='全局浏览'
        focus_label='当前焦点：支形'
        layer_summary_label='语义图谱'
        paragraph_label={null}
        show_provenance_legend={true}
        show_source_anchor_legend={true}
      />,
    );

    expect(screen.getByText('来源连接')).toBeInTheDocument();
  });
});
