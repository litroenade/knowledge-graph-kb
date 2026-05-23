import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportPanel } from '../src/features/graph-workbench/components/panels/ImportPanel';
import type { ImportJobItem } from '../src/shared/types/kb';
import {
  fetch_import_chunks,
  fetch_import_job,
  fetch_import_jobs,
  paste_import,
} from '../src/shared/api/kb';

vi.mock('../src/shared/api/kb', () => ({
  cancel_import_job: vi.fn(),
  fetch_import_chunks: vi.fn(),
  fetch_import_job: vi.fn(),
  fetch_import_jobs: vi.fn(),
  paste_import: vi.fn(),
  retry_import_job: vi.fn(),
  scan_import: vi.fn(),
  upload_import_files: vi.fn(),
}));

function job(status: string, updated_at: string): ImportJobItem {
  return {
    completed_chunks: status === 'completed' ? 1 : 0,
    completed_files: status === 'completed' ? 1 : 0,
    created_at: '2026-01-01T00:00:00Z',
    current_step: status,
    error: null,
    failed_chunks: 0,
    failed_files: 0,
    failure_stage: null,
    files: [],
    finished_at: status === 'completed' ? updated_at : null,
    id: 'job-1',
    input_mode: 'text',
    message: null,
    params: {},
    progress: status === 'completed' ? 100 : 25,
    retry_of: null,
    source: 'paste',
    started_at: '2026-01-01T00:00:00Z',
    stats: {},
    status,
    step_durations: {},
    strategy: 'auto',
    total_chunks: 1,
    total_files: 1,
    updated_at,
  };
}

async function flush_react_work(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('ImportPanel polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(fetch_import_chunks).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('refreshes running jobs and notifies after a submitted job reaches a terminal successful state', async () => {
    const running = job('running', '2026-01-01T00:00:01Z');
    const completed = job('completed', '2026-01-01T00:00:02Z');
    vi.mocked(fetch_import_jobs)
      .mockResolvedValueOnce([running])
      .mockResolvedValueOnce([completed]);
    vi.mocked(fetch_import_job)
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(completed);
    const on_import_finished = vi.fn();

    render(<ImportPanel on_import_finished={on_import_finished} />);

    await flush_react_work();
    expect(fetch_import_jobs).toHaveBeenCalledTimes(1);
    await flush_react_work();
    expect(fetch_import_job).toHaveBeenCalledWith('job-1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(fetch_import_jobs).toHaveBeenCalledTimes(2);
    expect(on_import_finished).toHaveBeenCalledTimes(1);
  });

  it('allows paste import without a manual title and derives the title from content', async () => {
    vi.useRealTimers();
    vi.mocked(fetch_import_jobs).mockResolvedValue([]);
    vi.mocked(fetch_import_job).mockResolvedValue(job('queued', '2026-01-01T00:00:03Z'));
    vi.mocked(paste_import).mockResolvedValue({ job: job('queued', '2026-01-01T00:00:03Z') });

    const view = render(<ImportPanel on_import_finished={vi.fn()} />);
    const current_panel = within(view.container);

    await waitFor(() => expect(fetch_import_jobs).toHaveBeenCalled());
    fireEvent.click(current_panel.getByRole('button', { name: '粘贴导入' }));

    const submit_button = current_panel.getByRole('button', { name: '提交粘贴任务' });
    expect(submit_button).toBeDisabled();

    fireEvent.change(current_panel.getByLabelText('正文'), { target: { value: '第一行标题\n正文内容' } });
    expect(submit_button).toBeEnabled();

    fireEvent.click(submit_button);

    await waitFor(() => expect(paste_import).toHaveBeenCalledWith({
      content: '第一行标题\n正文内容',
      metadata: {},
      strategy: 'auto',
      title: '第一行标题',
    }));
  });

  it('offers only backend-supported import strategies', async () => {
    vi.useRealTimers();
    vi.mocked(fetch_import_jobs).mockResolvedValue([]);

    const view = render(<ImportPanel on_import_finished={vi.fn()} />);
    const current_panel = within(view.container);

    await waitFor(() => expect(fetch_import_jobs).toHaveBeenCalled());

    const strategy_select = current_panel.getByRole('combobox') as HTMLSelectElement;
    const option_values = Array.from(strategy_select.options).map((option) => option.value);

    expect(option_values).toEqual(['auto', 'factual', 'narrative', 'quote']);
    expect(option_values).not.toContain('plain');
    expect(option_values).not.toContain('table');
    expect(option_values).not.toContain('openie');
  });
});
