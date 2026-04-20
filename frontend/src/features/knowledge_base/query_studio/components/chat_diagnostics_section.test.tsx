import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatDiagnosticsSection } from './chat_diagnostics_section';

describe('ChatDiagnosticsSection', () => {
  it('renders localized diagnostics labels and count summaries', () => {
    render(
      <ChatDiagnosticsSection
        execution={{
          status: 'completed',
          retrieval_mode: 'hybrid',
          model_invoked: true,
          matched_paragraph_count: 4,
          message: '回答完成',
        }}
        retrieval_trace={{
          structured: {
            executed: true,
            skipped_reason: null,
            hit_count: 2,
            latency_ms: 18,
            top_paragraph_ids: ['paragraph-1', 'paragraph-2'],
          },
          vector: {
            executed: false,
            skipped_reason: 'disabled',
            hit_count: 0,
            latency_ms: 0,
            top_paragraph_ids: [],
          },
          fusion: {
            executed: true,
            skipped_reason: null,
            hit_count: 2,
            latency_ms: 6,
            top_paragraph_ids: ['paragraph-1'],
          },
          ppr: {
            executed: true,
            skipped_reason: null,
            hit_count: 1,
            latency_ms: 11,
            top_paragraph_ids: ['paragraph-1'],
          },
          total_ms: 42,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /显示诊断/i }));

    expect(screen.getByText('检索命中段落 4')).toBeInTheDocument();
    expect(screen.getByText('检索链路 · 总耗时 42 ms')).toBeInTheDocument();
    expect(screen.getByText('结构检索')).toBeInTheDocument();
    expect(screen.getByText('图谱重排')).toBeInTheDocument();
    expect(screen.getByText('已跳过：disabled')).toBeInTheDocument();
    expect(screen.getByText('命中 2 条，耗时 18 ms。候选段落：paragraph-1、paragraph-2')).toBeInTheDocument();
  });
});
