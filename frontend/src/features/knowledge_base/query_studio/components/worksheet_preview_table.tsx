import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { WorksheetPreviewRecord } from '../../shared/types/knowledge_base_types';
import './worksheet_preview_table.css';

const ROW_INDEX_COLUMN_WIDTH = 72;
const MIN_COLUMN_WIDTH = 160;
const BODY_MAX_HEIGHT = 420;
const ROW_ESTIMATE_HEIGHT = 52;
const VIRTUALIZATION_THRESHOLD = 24;

interface WorksheetPreviewTableProps {
  preview: WorksheetPreviewRecord;
}

interface WorksheetPreviewColumn {
  key: string;
  label: string;
}

function build_columns(preview: WorksheetPreviewRecord): WorksheetPreviewColumn[] {
  const fallback_keys = Object.keys(preview.items[0]?.cells ?? {});
  const column_keys = preview.column_keys.length ? preview.column_keys : fallback_keys;
  return column_keys.map((column_key, index) => ({
    key: column_key,
    label: preview.headers[index] ?? column_key,
  }));
}

function empty_message(preview: WorksheetPreviewRecord): string {
  if (preview.total_rows <= 0) {
    return '当前工作表没有可展示的结构化记录。';
  }
  if (!preview.items.length) {
    return '当前页没有可展示的数据。';
  }
  return '当前工作表缺少可渲染的列定义。';
}

export function WorksheetPreviewTable(props: WorksheetPreviewTableProps) {
  const { preview } = props;
  const body_ref = useRef<HTMLDivElement | null>(null);
  const columns = useMemo(() => build_columns(preview), [preview]);
  const highlighted_row_indexes = useMemo(
    () => new Set(preview.highlighted_row_indexes),
    [preview.highlighted_row_indexes],
  );
  const highlighted_columns = useMemo(
    () => new Set(preview.highlighted_columns),
    [preview.highlighted_columns],
  );
  const grid_template_columns = useMemo(
    () => `${ROW_INDEX_COLUMN_WIDTH}px ${columns.map(() => `minmax(${MIN_COLUMN_WIDTH}px, 1fr)`).join(' ')}`,
    [columns],
  );
  const table_min_width = useMemo(
    () => `${ROW_INDEX_COLUMN_WIDTH + columns.length * MIN_COLUMN_WIDTH}px`,
    [columns.length],
  );
  const anchor_row_position = useMemo(
    () =>
      preview.anchor_row_index
        ? preview.items.findIndex((item) => item.row_index === preview.anchor_row_index)
        : -1,
    [preview.anchor_row_index, preview.items],
  );
  const should_virtualize = preview.items.length > VIRTUALIZATION_THRESHOLD;

  const row_virtualizer = useVirtualizer({
    count: preview.items.length,
    getScrollElement: () => body_ref.current,
    estimateSize: () => ROW_ESTIMATE_HEIGHT,
    overscan: 8,
    initialRect: { width: 0, height: BODY_MAX_HEIGHT },
    measureElement: (element) =>
      Math.max(element?.getBoundingClientRect().height ?? 0, ROW_ESTIMATE_HEIGHT),
  });

  useEffect(() => {
    if (!should_virtualize) {
      return;
    }
    if (anchor_row_position < 0) {
      return;
    }
    row_virtualizer.scrollToIndex(anchor_row_position, { align: 'center' });
  }, [anchor_row_position, row_virtualizer, should_virtualize]);

  if (!columns.length) {
    if (preview.rendered_html) {
      return (
        <div
          className='kb-worksheet-preview-fallback'
          dangerouslySetInnerHTML={{ __html: preview.rendered_html }}
        />
      );
    }
    return <div className='kb-empty-card'>{empty_message(preview)}</div>;
  }

  if (!preview.items.length) {
    return <div className='kb-empty-card'>{empty_message(preview)}</div>;
  }

  function render_row(
    row: WorksheetPreviewRecord['items'][number],
    row_key: string,
    is_virtualized: boolean,
    style?: Record<string, string>,
  ) {
    const is_highlighted_row = highlighted_row_indexes.has(row.row_index);
    return (
      <div
        className={`kb-worksheet-preview-row ${is_virtualized ? 'is-virtualized' : ''} ${is_highlighted_row ? 'is-highlighted-row' : ''}`}
        key={row_key}
        role='row'
        style={{
          gridTemplateColumns: grid_template_columns,
          ...style,
        }}
      >
        <div className='kb-worksheet-preview-cell is-row-index' role='rowheader'>
          {row.row_index}
        </div>
        {columns.map((column) => {
          const is_highlighted_cell =
            is_highlighted_row && highlighted_columns.has(column.key);
          return (
            <div
              className={`kb-worksheet-preview-cell ${is_highlighted_cell ? 'is-highlighted-cell' : ''}`}
              key={`${row_key}-${column.key}`}
              role='cell'
              title={row.cells[column.key] ?? ''}
            >
              {row.cells[column.key] ?? ''}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className='kb-worksheet-preview-shell'>
      <div
        aria-label={`${preview.worksheet_name} 预览表格`}
        className='kb-worksheet-preview-table'
        role='table'
        style={{ minWidth: table_min_width }}
      >
        <div className='kb-worksheet-preview-head' role='rowgroup' style={{ gridTemplateColumns: grid_template_columns }}>
          <div className='kb-worksheet-preview-head-cell is-row-index' role='columnheader'>
            行号
          </div>
          {columns.map((column) => (
            <div className='kb-worksheet-preview-head-cell' key={column.key} role='columnheader'>
              {column.label}
            </div>
          ))}
        </div>

        <div className='kb-worksheet-preview-body' ref={body_ref}>
          {should_virtualize ? (
            <div
              className='kb-worksheet-preview-body-spacer'
              role='rowgroup'
              style={{ height: `${row_virtualizer.getTotalSize()}px` }}
            >
              {row_virtualizer.getVirtualItems().map((virtual_row) => {
                const row = preview.items[virtual_row.index];
                const row_key =
                  row.paragraph_id ?? `${preview.worksheet_key}-${row.row_index}-${virtual_row.index}`;

                return (
                  <div
                  data-index={virtual_row.index}
                  key={row_key}
                  ref={row_virtualizer.measureElement}
                >
                    {render_row(row, row_key, true, { transform: `translateY(${virtual_row.start}px)` })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className='kb-worksheet-preview-static-rows' role='rowgroup'>
              {preview.items.map((row, index) =>
                render_row(
                  row,
                  row.paragraph_id ?? `${preview.worksheet_key}-${row.row_index}-${index}`,
                  false,
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
