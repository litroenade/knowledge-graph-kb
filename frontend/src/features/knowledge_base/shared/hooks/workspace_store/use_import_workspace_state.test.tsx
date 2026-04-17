import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportTaskRecord } from '../../types/knowledge_base_types';
import { use_import_workspace_state } from './use_import_workspace_state';

const {
  list_import_jobs_mock,
  cancel_import_job_mock,
  retry_failed_job_mock,
  submit_paste_job_mock,
  submit_scan_job_mock,
  submit_structured_job_mock,
  submit_upload_job_mock,
} = vi.hoisted(() => ({
  list_import_jobs_mock: vi.fn(),
  cancel_import_job_mock: vi.fn(),
  retry_failed_job_mock: vi.fn(),
  submit_paste_job_mock: vi.fn(),
  submit_scan_job_mock: vi.fn(),
  submit_structured_job_mock: vi.fn(),
  submit_upload_job_mock: vi.fn(),
}));

vi.mock('../../api/import_api', () => ({
  list_import_jobs: list_import_jobs_mock,
  cancel_import_job: cancel_import_job_mock,
  retry_failed_job: retry_failed_job_mock,
  submit_paste_job: submit_paste_job_mock,
  submit_scan_job: submit_scan_job_mock,
  submit_structured_job: submit_structured_job_mock,
  submit_upload_job: submit_upload_job_mock,
}));

function create_import_task(status: string): ImportTaskRecord {
  return {
    id: 'job-1',
    source: 'Alpha Source',
    input_mode: 'paste',
    strategy: 'auto',
    status,
    current_step: status,
    progress: status === 'completed' ? 100 : 45,
    total_files: 1,
    completed_files: status === 'completed' ? 1 : 0,
    failed_files: 0,
    total_chunks: 1,
    completed_chunks: status === 'completed' ? 1 : 0,
    failed_chunks: 0,
    message: null,
    error: null,
    params: {},
    failure_stage: null,
    step_durations: {},
    retry_of: null,
    stats: {},
    created_at: '2026-04-14T00:00:00Z',
    started_at: '2026-04-14T00:00:01Z',
    finished_at: status === 'completed' ? '2026-04-14T00:00:02Z' : null,
    updated_at: '2026-04-14T00:00:02Z',
    files: [],
  };
}

describe('use_import_workspace_state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list_import_jobs_mock.mockResolvedValue([]);
    cancel_import_job_mock.mockResolvedValue(create_import_task('cancelling'));
    retry_failed_job_mock.mockResolvedValue({ job: create_import_task('queued') });
    submit_paste_job_mock.mockResolvedValue({ job: create_import_task('queued') });
    submit_scan_job_mock.mockResolvedValue({ job: create_import_task('queued') });
    submit_structured_job_mock.mockResolvedValue({ job: create_import_task('queued') });
    submit_upload_job_mock.mockResolvedValue({ job: create_import_task('queued') });
  });

  it('invalidates source, worksheet, graph, and manual-relation caches when a job leaves the active state', async () => {
    list_import_jobs_mock.mockResolvedValueOnce([create_import_task('running')]);

    const refresh_sources = vi.fn(async () => {});
    const set_message = vi.fn();
    const set_error = vi.fn();
    const query_client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
        },
      },
    });
    const invalidate_queries_spy = vi.spyOn(query_client, 'invalidateQueries');

    function wrapper(props: { children: ReactNode }) {
      return <QueryClientProvider client={query_client}>{props.children}</QueryClientProvider>;
    }

    const { result } = renderHook(
      () =>
        use_import_workspace_state({
          refresh_sources,
          set_message,
          set_error,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(list_import_jobs_mock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.tasks[0]?.status).toBe('running');
    });

    act(() => {
      query_client.setQueryData(['kb', 'imports', 'jobs'], [create_import_task('completed')]);
    });

    await waitFor(() => {
      expect(refresh_sources).toHaveBeenCalledTimes(1);
    });

    const invalidated_query_keys = invalidate_queries_spy.mock.calls.map(
      ([filters]) => JSON.stringify(filters?.queryKey ?? null),
    );
    expect(invalidated_query_keys).toContain(JSON.stringify(['kb', 'sources', 'detail']));
    expect(invalidated_query_keys).toContain(JSON.stringify(['kb', 'sources', 'paragraphs']));
    expect(invalidated_query_keys).toContain(JSON.stringify(['kb', 'sources', 'worksheets']));
    expect(invalidated_query_keys).toContain(JSON.stringify(['kb', 'sources', 'worksheet-preview']));
    expect(invalidated_query_keys).toContain(JSON.stringify(['kb', 'graph']));
    expect(invalidated_query_keys).toContain(JSON.stringify(['kb', 'graph', 'manual-relations']));
    expect(set_error).not.toHaveBeenCalled();
  });
});
