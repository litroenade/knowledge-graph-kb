import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  create_scope_record,
  create_source_detail_record,
  create_source_record,
  create_source_version_record,
} from '../../test_helpers/workspace_slice_fixtures';
import { use_source_workspace_state } from './use_source_workspace_state';

const {
  delete_source_mock,
  get_source_detail_mock,
  get_source_worksheet_preview_mock,
  list_source_paragraphs_mock,
  list_source_worksheets_mock,
  list_sources_mock,
  update_source_mock,
} = vi.hoisted(() => ({
  delete_source_mock: vi.fn(),
  get_source_detail_mock: vi.fn(),
  get_source_worksheet_preview_mock: vi.fn(),
  list_source_paragraphs_mock: vi.fn(),
  list_source_worksheets_mock: vi.fn(),
  list_sources_mock: vi.fn(),
  update_source_mock: vi.fn(),
}));

vi.mock('../../api/source_api', () => ({
  delete_source: delete_source_mock,
  get_source_detail: get_source_detail_mock,
  get_source_worksheet_preview: get_source_worksheet_preview_mock,
  list_source_paragraphs: list_source_paragraphs_mock,
  list_source_worksheets: list_source_worksheets_mock,
  list_sources: list_sources_mock,
  update_source: update_source_mock,
}));

describe('use_source_workspace_state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete_source_mock.mockResolvedValue({ status: 'deleted' });
    get_source_worksheet_preview_mock.mockResolvedValue(null);
    list_source_paragraphs_mock.mockResolvedValue([]);
    list_source_worksheets_mock.mockResolvedValue([]);
    update_source_mock.mockResolvedValue(null);
  });

  it('keeps the global source list and loads a scope-filtered browser list separately', async () => {
    const source_one = create_source_record({ id: 'source-1', name: 'Alpha Source.txt' });
    const source_two = create_source_record({
      id: 'source-2',
      name: 'Beta Source.txt',
      active_version_id: 'version-2',
      active_version_number: 2,
    });
    const source_two_version = create_source_version_record({
      id: 'version-2',
      source_id: source_two.id,
      version_number: 2,
    });

    list_sources_mock.mockImplementation(async (options?: { scope?: { mode: string; source_ids: string[] } }) => {
      if (options?.scope?.mode === 'subset') {
        return [source_two];
      }
      return [source_one, source_two];
    });
    get_source_detail_mock.mockResolvedValue(
      create_source_detail_record({
        source: source_two,
        selected_version: source_two_version,
        versions: [source_two_version],
      }),
    );

    const query_client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
        },
      },
    });

    function wrapper(props: { children: ReactNode }) {
      return <QueryClientProvider client={query_client}>{props.children}</QueryClientProvider>;
    }

    const { result } = renderHook(
      () =>
        use_source_workspace_state({
          active_workspace: 'chat',
          is_source_library_open: true,
          browser_scope: create_scope_record({ mode: 'subset', source_ids: ['source-2'] }),
          set_message: vi.fn(),
          set_error: vi.fn(),
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.sources.map((item) => item.id)).toEqual(['source-1', 'source-2']);
    });
    await waitFor(() => {
      expect(result.current.browser_sources.map((item) => item.id)).toEqual(['source-2']);
    });
    await waitFor(() => {
      expect(result.current.selected_source_browser_id).toBe('source-2');
    });

    expect(
      list_sources_mock.mock.calls.some(([options]) => options === undefined),
    ).toBe(true);
    expect(
      list_sources_mock.mock.calls.some(
        ([options]) => options?.scope?.mode === 'subset' && options.scope?.source_ids?.[0] === 'source-2',
      ),
    ).toBe(true);
  });
});
