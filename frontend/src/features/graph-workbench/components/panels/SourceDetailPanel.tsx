import { useEffect, useMemo, useState } from 'react';

import {
  fetch_source_detail,
  fetch_source_paragraphs,
  fetch_source_worksheets,
  fetch_worksheet_preview,
} from '../../../../shared/api/kb';
import type {
  ParagraphItem,
  SourceDetail,
  SourceItem,
  WorksheetItem,
  WorksheetPreviewResponse,
} from '../../../../shared/types/kb';
import { format_date } from './formatters';

interface SourceDetailPanelProps {
  sources: SourceItem[];
  selected_source_ids: string[];
}

export function SourceDetailPanel(props: SourceDetailPanelProps) {
  const default_source_id = props.selected_source_ids[0] ?? props.sources[0]?.id ?? '';
  const [source_id, set_source_id] = useState(default_source_id);
  const [version_id, set_version_id] = useState<string>('');
  const [detail, set_detail] = useState<SourceDetail | null>(null);
  const [paragraphs, set_paragraphs] = useState<ParagraphItem[]>([]);
  const [worksheets, set_worksheets] = useState<WorksheetItem[]>([]);
  const [worksheet_key, set_worksheet_key] = useState('');
  const [preview, set_preview] = useState<WorksheetPreviewResponse | null>(null);
  const [page, set_page] = useState(1);
  const [message, set_message] = useState<string | null>(null);

  useEffect(() => {
    if (!source_id && default_source_id) {
      set_source_id(default_source_id);
    }
  }, [default_source_id, source_id]);

  useEffect(() => {
    if (!source_id) {
      set_detail(null);
      set_paragraphs([]);
      set_worksheets([]);
      return;
    }
    let cancelled = false;
    set_message(null);
    void Promise.all([
      fetch_source_detail(source_id, version_id || null),
      fetch_source_paragraphs(source_id, version_id || null),
      fetch_source_worksheets(source_id, version_id || null),
    ])
      .then(([next_detail, next_paragraphs, next_worksheets]) => {
        if (cancelled) {
          return;
        }
        set_detail(next_detail);
        set_paragraphs(next_paragraphs);
        set_worksheets(next_worksheets);
        set_worksheet_key((current) => current || next_worksheets[0]?.worksheet_key || '');
      })
      .catch((error) => {
        if (!cancelled) {
          set_message((error as Error).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source_id, version_id]);

  useEffect(() => {
    if (!source_id || !worksheet_key) {
      set_preview(null);
      return;
    }
    let cancelled = false;
    void fetch_worksheet_preview({
      source_id,
      worksheet_key,
      version_id: version_id || null,
      page,
      page_size: 30,
    })
      .then((next_preview) => {
        if (!cancelled) {
          set_preview(next_preview);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          set_message((error as Error).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, source_id, version_id, worksheet_key]);

  const selected_source = useMemo(
    () => props.sources.find((source) => source.id === source_id) ?? null,
    [props.sources, source_id],
  );

  function change_source(next_source_id: string): void {
    set_source_id(next_source_id);
    set_version_id('');
    set_worksheet_key('');
    set_preview(null);
    set_page(1);
  }

  return (
    <section className='panel-body source-detail-panel'>
      <div className='section-heading'>
        <span>来源详情</span>
      </div>

      <label className='field'>
        <span>来源</span>
        <select onChange={(event) => change_source(event.target.value)} value={source_id}>
          <option value=''>选择来源</option>
          {props.sources.map((source) => (
            <option key={source.id} value={source.id}>{source.name}</option>
          ))}
        </select>
      </label>

      {detail ? (
        <label className='field'>
          <span>版本</span>
          <select onChange={(event) => set_version_id(event.target.value)} value={version_id}>
            <option value=''>当前激活版本</option>
            {detail.versions.map((version) => (
              <option key={version.id} value={version.id}>v{version.version_number} · {version.status}</option>
            ))}
          </select>
        </label>
      ) : null}

      {selected_source ? (
        <div className='detail-block'>
          <strong>{selected_source.name}</strong>
          <div><span>状态</span><b>{selected_source.status}</b></div>
          <div><span>类型</span><b>{selected_source.source_kind}</b></div>
          <div><span>策略</span><b>{selected_source.strategy}</b></div>
          <div><span>更新</span><b>{format_date(selected_source.updated_at)}</b></div>
          {detail ? (
            <>
              <div><span>段落</span><b>{String(detail.paragraph_count)}</b></div>
              <div><span>实体</span><b>{String(detail.entity_count)}</b></div>
              <div><span>关系</span><b>{String(detail.relation_count)}</b></div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className='stacked-tool'>
        <strong>段落预览</strong>
        <div className='paragraph-list'>
          {paragraphs.slice(0, 24).map((paragraph) => (
            <article className='paragraph-item' key={paragraph.id}>
              <div>
                <strong>#{paragraph.position}</strong>
                <span>{paragraph.knowledge_type} · {paragraph.vector_state} · {paragraph.token_count} tokens</span>
              </div>
              <p>{paragraph.content}</p>
            </article>
          ))}
          {!paragraphs.length ? <p className='muted'>暂无段落。</p> : null}
        </div>
      </div>

      <div className='stacked-tool'>
        <strong>表格预览</strong>
        <label className='field'>
          <span>工作表</span>
          <select onChange={(event) => { set_worksheet_key(event.target.value); set_page(1); }} value={worksheet_key}>
            <option value=''>选择工作表</option>
            {worksheets.map((sheet) => (
              <option key={sheet.worksheet_key} value={sheet.worksheet_key}>{sheet.worksheet_name} · {sheet.row_count} 行</option>
            ))}
          </select>
        </label>
        {preview ? (
          <>
            <div className='table-scroll'>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    {preview.column_keys.map((key, index) => (
                      <th key={key}>{preview.headers[index] ?? key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((row) => (
                    <tr key={`${preview.worksheet_key}-${row.row_index}`}>
                      <td>{row.row_index}</td>
                      {preview.column_keys.map((key) => (
                        <td key={key}>{row.cells[key] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className='button-row'>
              <button disabled={!preview.has_prev} onClick={() => set_page((current) => Math.max(1, current - 1))} type='button'>上一页</button>
              <span className='muted'>第 {preview.page} 页 · {preview.total_rows} 行</span>
              <button disabled={!preview.has_next} onClick={() => set_page((current) => current + 1)} type='button'>下一页</button>
            </div>
          </>
        ) : <p className='muted'>该来源暂无可预览工作表。</p>}
      </div>

      {message ? <p className='inline-message'>{message}</p> : null}
    </section>
  );
}
