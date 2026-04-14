import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { create_worksheet_preview_record } from '../../shared/test_helpers/workspace_slice_fixtures';
import { WorksheetPreviewTable } from './worksheet_preview_table';

describe('WorksheetPreviewTable', () => {
  it('renders structured worksheet headers and rows', () => {
    const preview = create_worksheet_preview_record({
      worksheet_name: 'General Sheet',
      headers: ['Name', 'Role'],
      column_keys: ['name', 'role'],
      items: [
        {
          paragraph_id: 'paragraph-1',
          row_index: 3,
          record_key: 'row-3',
          cells: {
            name: 'Bai Qi',
            role: 'General',
          },
        },
      ],
      highlighted_row_indexes: [3],
      highlighted_columns: ['role'],
    });

    render(<WorksheetPreviewTable preview={preview} />);

    expect(screen.getByRole('table', { name: 'General Sheet 预览表格' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Role' })).toBeInTheDocument();
    expect(screen.getByText('Bai Qi')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('renders empty state when the worksheet page has no rows', () => {
    const preview = create_worksheet_preview_record({
      worksheet_name: 'Empty Sheet',
      headers: ['Name'],
      column_keys: ['name'],
      items: [],
      total_rows: 0,
      rendered_html: null,
    });

    render(<WorksheetPreviewTable preview={preview} />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('当前工作表没有可展示的结构化记录。')).toBeInTheDocument();
  });
});
