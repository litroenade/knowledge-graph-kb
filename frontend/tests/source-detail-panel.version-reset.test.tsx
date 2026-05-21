import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SourceDetailPanel } from '../src/features/graph-workbench/components/panels/SourceDetailPanel';
import type { SourceDetail, SourceItem, WorksheetPreviewResponse } from '../src/shared/types/kb';
import {
  fetch_source_detail,
  fetch_source_paragraphs,
  fetch_source_worksheets,
  fetch_worksheet_preview,
} from '../src/shared/api/kb';

vi.mock('../src/shared/api/kb', () => ({
  fetch_source_detail: vi.fn(),
  fetch_source_paragraphs: vi.fn(),
  fetch_source_worksheets: vi.fn(),
  fetch_worksheet_preview: vi.fn(),
}));

const source: SourceItem = {
  active_version_id: 'v1',
  active_version_number: 1,
  created_at: '2026-01-01T00:00:00Z',
  file_type: 'xlsx',
  id: 'source-1',
  input_mode: 'file',
  metadata: {},
  name: 'Workbook.xlsx',
  source_kind: 'upload',
  status: 'ready',
  storage_path: null,
  strategy: 'auto',
  summary: null,
  updated_at: '2026-01-01T00:00:00Z',
  version_count: 2,
};

const detail: SourceDetail = {
  entity_count: 0,
  paragraph_count: 0,
  relation_count: 0,
  selected_version: null,
  source,
  versions: [
    {
      activated_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      id: 'v2',
      metadata: {},
      source_id: 'source-1',
      status: 'active',
      updated_at: '2026-01-01T00:00:00Z',
      version_number: 2,
    },
  ],
};

function preview(worksheet_key: string, version_id: string | null): WorksheetPreviewResponse {
  return {
    anchor_row_index: null,
    column_keys: ['name'],
    has_next: false,
    has_prev: false,
    headers: ['Name'],
    highlighted_columns: [],
    highlighted_row_indexes: [],
    items: [],
    page: 1,
    page_size: 30,
    render_kind: 'worksheet_preview',
    render_metadata: {},
    rendered_html: null,
    row_range_end: 0,
    row_range_start: 0,
    source_id: 'source-1',
    total_rows: 0,
    version_id,
    worksheet_key,
    worksheet_name: worksheet_key,
  };
}

describe('SourceDetailPanel', () => {
  beforeEach(() => {
    vi.mocked(fetch_source_detail).mockResolvedValue(detail);
    vi.mocked(fetch_source_paragraphs).mockResolvedValue([]);
    vi.mocked(fetch_source_worksheets).mockImplementation((_source_id, version_id) =>
      Promise.resolve([
        {
          column_keys: ['name'],
          headers: ['Name'],
          row_count: 1,
          worksheet_key: version_id === 'v2' ? 'sheet-b' : 'sheet-a',
          worksheet_name: version_id === 'v2' ? 'Sheet B' : 'Sheet A',
        },
      ]),
    );
    vi.mocked(fetch_worksheet_preview).mockImplementation((options) =>
      Promise.resolve(preview(options.worksheet_key, options.version_id ?? null)),
    );
  });

  it('resets worksheet preview state when the selected source version changes', async () => {
    render(<SourceDetailPanel selected_source_ids={['source-1']} sources={[source]} />);

    await waitFor(() => {
      expect(fetch_worksheet_preview).toHaveBeenCalledWith(
        expect.objectContaining({ version_id: null, worksheet_key: 'sheet-a' }),
      );
    });

    fireEvent.change(screen.getByLabelText('版本'), { target: { value: 'v2' } });

    await waitFor(() => {
      expect(fetch_worksheet_preview).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, version_id: 'v2', worksheet_key: 'sheet-b' }),
      );
    });
  });
});
