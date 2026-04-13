import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { create_answer_citation_record } from '../../shared/test_helpers/workspace_slice_fixtures';
import { ChatSourcesSection } from './chat_sources_section';

vi.mock('../../shared/components/paragraph_evidence_preview', () => ({
  ParagraphEvidencePreview: (props: { text_content?: string | null }) => <div>{props.text_content}</div>,
}));

describe('ChatSourcesSection', () => {
  it('clamps the current page when the citation set shrinks', () => {
    const citations = [
      create_answer_citation_record({
        paragraph_id: 'paragraph-1',
        source_id: 'source-1',
        source_name: '来源一.txt',
        excerpt: '第一条证据',
      }),
      create_answer_citation_record({
        paragraph_id: 'paragraph-2',
        source_id: 'source-2',
        source_name: '来源二.txt',
        excerpt: '第二条证据',
      }),
      create_answer_citation_record({
        paragraph_id: 'paragraph-3',
        source_id: 'source-3',
        source_name: '来源三.txt',
        excerpt: '第三条证据',
      }),
      create_answer_citation_record({
        paragraph_id: 'paragraph-4',
        source_id: 'source-4',
        source_name: '来源四.txt',
        excerpt: '第四条证据',
      }),
    ];
    const callbacks = {
      excluded_source_ids: [],
      on_toggle_source_exclusion: vi.fn(),
      on_view_in_graph: vi.fn(),
      on_focus_paragraph: vi.fn(),
    };

    const { rerender } = render(<ChatSourcesSection citations={citations} {...callbacks} />);

    fireEvent.click(screen.getByRole('button', { name: /显示来源/i }));
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    expect(screen.getByText('来源四.txt')).toBeInTheDocument();
    expect(screen.getByText('第 2 页 / 共 2 页')).toBeInTheDocument();

    rerender(<ChatSourcesSection citations={[citations[0]]} {...callbacks} />);

    expect(screen.getByText('来源一.txt')).toBeInTheDocument();
    expect(screen.queryByText('来源四.txt')).not.toBeInTheDocument();
    expect(screen.queryByText('第 2 页 / 共 2 页')).not.toBeInTheDocument();
  });
});
