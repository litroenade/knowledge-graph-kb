import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { format_source_display_name } from '../../graph_browser/components/graph_browser_utils';
import { ParagraphEvidencePreview } from '../../shared/components/paragraph_evidence_preview';
import {
  get_input_mode_label,
  get_status_label,
  get_strategy_label,
  get_vector_state_label,
} from '../../shared/config/ui_constants';
import type {
  ParagraphRecord,
  SourceDetailRecord,
  SourceRecord,
  SourceVersionRecord,
  WorksheetPreviewRecord,
  WorksheetSummaryRecord,
} from '../../shared/types/knowledge_base_types';
import { WorksheetPreviewTable } from './worksheet_preview_table';

function source_summary(source: SourceRecord): string {
  return source.summary || get_input_mode_label(source.source_kind) || '暂无摘要';
}

function is_source_in_scope(source_id: string, selected_source_ids: string[]): boolean {
  return !selected_source_ids.length || selected_source_ids.includes(source_id);
}

function format_version_label(version: SourceVersionRecord): string {
  return `v${version.version_number} · ${version.status.toUpperCase()}`;
}

function worksheet_range_label(preview: WorksheetPreviewRecord | null): string | null {
  if (!preview || !preview.row_range_start || !preview.row_range_end) {
    return null;
  }
  return `当前窗口 ${preview.row_range_start}-${preview.row_range_end}`;
}

function worksheet_page_label(preview: WorksheetPreviewRecord | null): string | null {
  if (!preview || preview.total_rows <= 0) {
    return null;
  }
  const page_count = Math.max(1, Math.ceil(preview.total_rows / Math.max(1, preview.page_size)));
  return `第 ${preview.page} / ${page_count} 页`;
}

interface SourceLibraryDrawerProps {
  open: boolean;
  sources: SourceRecord[];
  selected_source_ids: string[];
  set_selected_source_ids: Dispatch<SetStateAction<string[]>>;
  selected_source_browser_id: string | null;
  set_selected_source_browser_id: Dispatch<SetStateAction<string | null>>;
  selected_source_version_id: string | null;
  set_selected_source_version_id: Dispatch<SetStateAction<string | null>>;
  query_scope_source_id: string | null;
  set_query_scope_version_id: (version_id: string | null) => void;
  source_detail: SourceDetailRecord | null;
  source_paragraphs: ParagraphRecord[];
  source_worksheets: WorksheetSummaryRecord[];
  worksheet_preview: WorksheetPreviewRecord | null;
  selected_worksheet_key: string | null;
  set_selected_worksheet_key: Dispatch<SetStateAction<string | null>>;
  worksheet_page: number;
  set_worksheet_page: Dispatch<SetStateAction<number>>;
  worksheet_anchor_row: number | null;
  worksheet_preview_mode: 'page' | 'context';
  set_worksheet_preview_mode: Dispatch<SetStateAction<'page' | 'context'>>;
  is_loading_source_worksheets: boolean;
  is_loading_worksheet_preview: boolean;
  source_worksheets_error: string | null;
  worksheet_preview_error: string | null;
  is_updating_source: boolean;
  is_deleting_source: boolean;
  update_source: (
    source_id: string,
    payload: { name?: string; summary?: string; metadata?: Record<string, unknown> },
  ) => Promise<void>;
  delete_source: (source_id: string) => Promise<void>;
  on_close: () => void;
  on_focus_paragraph: (paragraph_id: string) => void;
}

export function SourceLibraryDrawer(props: SourceLibraryDrawerProps) {
  const {
    open,
    sources,
    selected_source_ids,
    set_selected_source_ids,
    selected_source_browser_id,
    set_selected_source_browser_id,
    selected_source_version_id,
    set_selected_source_version_id,
    query_scope_source_id,
    set_query_scope_version_id,
    source_detail,
    source_paragraphs,
    source_worksheets,
    worksheet_preview,
    selected_worksheet_key,
    set_selected_worksheet_key,
    worksheet_page,
    set_worksheet_page,
    worksheet_anchor_row,
    worksheet_preview_mode,
    set_worksheet_preview_mode,
    is_loading_source_worksheets,
    is_loading_worksheet_preview,
    source_worksheets_error,
    worksheet_preview_error,
    is_updating_source,
    is_deleting_source,
    update_source,
    delete_source,
    on_close,
    on_focus_paragraph,
  } = props;

  const [source_keyword, set_source_keyword] = useState('');
  const [paragraph_keyword, set_paragraph_keyword] = useState('');
  const [name_draft, set_name_draft] = useState('');
  const [summary_draft, set_summary_draft] = useState('');
  const deferred_source_keyword = useDeferredValue(source_keyword.trim().toLowerCase());
  const deferred_paragraph_keyword = useDeferredValue(paragraph_keyword.trim().toLowerCase());
  const paragraph_scroll_ref = useRef<HTMLDivElement | null>(null);

  const filtered_sources = useMemo(
    () =>
      sources.filter((source) => {
        if (!deferred_source_keyword) {
          return true;
        }
        const haystack =
          `${source.name} ${source.summary ?? ''} ${source.source_kind} ${source.input_mode}`.toLowerCase();
        return haystack.includes(deferred_source_keyword);
      }),
    [deferred_source_keyword, sources],
  );

  const filtered_paragraphs = useMemo(
    () =>
      source_paragraphs.filter((paragraph) => {
        if (!deferred_paragraph_keyword) {
          return true;
        }
        return paragraph.content.toLowerCase().includes(deferred_paragraph_keyword);
      }),
    [deferred_paragraph_keyword, source_paragraphs],
  );

  const paragraph_virtualizer = useVirtualizer({
    count: filtered_paragraphs.length,
    getScrollElement: () => paragraph_scroll_ref.current,
    estimateSize: () => 200,
    overscan: 4,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 0,
  });

  const active_source =
    source_detail?.source ??
    sources.find((source) => source.id === selected_source_browser_id) ??
    null;
  const active_worksheet =
    source_worksheets.find((item) => item.worksheet_key === selected_worksheet_key) ?? null;
  const worksheet_page_copy = worksheet_page_label(worksheet_preview);
  const worksheet_range_copy = worksheet_range_label(worksheet_preview);

  useEffect(() => {
    set_name_draft(active_source?.name ?? '');
    set_summary_draft(active_source?.summary ?? '');
  }, [active_source]);

  if (!open) {
    return null;
  }

  return (
    <div className='kb-modal-backdrop' onClick={on_close} role='presentation'>
      <aside
        aria-modal='true'
        className='kb-side-drawer'
        onClick={(event) => event.stopPropagation()}
        role='dialog'
      >
        <div className='kb-side-drawer-header'>
          <div>
            <span className='kb-context-label'>来源浏览</span>
            <h3>来源库</h3>
            <p>在这里切换来源范围、浏览工作表预览，并保留段落级证据入口。</p>
          </div>
          <button className='kb-secondary-button' onClick={on_close} type='button'>
            关闭
          </button>
        </div>

        <div className='kb-side-drawer-actions'>
          <button className='kb-secondary-button' onClick={() => set_selected_source_ids([])} type='button'>
            全部来源
          </button>
          {active_source ? (
            <button
              className='kb-secondary-button'
              onClick={() => set_selected_source_ids([active_source.id])}
              type='button'
            >
              仅当前来源
            </button>
          ) : null}
        </div>

        <div className='kb-source-library-layout'>
          <section className='kb-source-library-list'>
            <label className='kb-form-field'>
              <span>筛选来源</span>
              <input
                onChange={(event) => set_source_keyword(event.target.value)}
                placeholder='按名称、摘要或类型搜索'
                type='search'
                value={source_keyword}
              />
            </label>

            <div className='kb-source-library-results'>
              {filtered_sources.map((source) => {
                const in_scope = is_source_in_scope(source.id, selected_source_ids);
                return (
                  <article
                    className={`kb-source-library-card ${
                      selected_source_browser_id === source.id ? 'is-active' : ''
                    }`}
                    key={source.id}
                  >
                    <button
                      className='kb-source-library-hit'
                      onClick={() => set_selected_source_browser_id(source.id)}
                      type='button'
                    >
                      <strong>{format_source_display_name(source, sources)}</strong>
                      <span>{source_summary(source)}</span>
                    </button>

                    <div className='kb-meta-strip'>
                      <span className='kb-meta-pill'>
                        {source.active_version_number ? `v${source.active_version_number}` : '无快照'}
                      </span>
                      <span className='kb-meta-pill'>{`${source.version_count ?? 0} 个快照`}</span>
                      <span className='kb-meta-pill'>{get_input_mode_label(source.input_mode)}</span>
                      <span className='kb-meta-pill'>{get_status_label(source.status)}</span>
                      <span className='kb-meta-pill'>{get_strategy_label(source.strategy)}</span>
                    </div>

                    <button
                      className='kb-secondary-button'
                      onClick={() => {
                        if (!selected_source_ids.length) {
                          set_selected_source_ids([source.id]);
                          return;
                        }
                        if (selected_source_ids.includes(source.id)) {
                          set_selected_source_ids(selected_source_ids.filter((item) => item !== source.id));
                          return;
                        }
                        set_selected_source_ids([...selected_source_ids, source.id]);
                      }}
                      type='button'
                    >
                      {selected_source_ids.length
                        ? in_scope
                          ? '移出范围'
                          : '加入范围'
                        : '仅此来源'}
                    </button>
                  </article>
                );
              })}
              {!filtered_sources.length ? <div className='kb-empty-card'>没有匹配的来源。</div> : null}
            </div>
          </section>

          <section className='kb-source-library-preview'>
            <div className='kb-detail-card'>
              <span className='kb-context-label'>来源预览</span>
              <h3>{active_source ? format_source_display_name(active_source, sources) : '选择一个来源'}</h3>
              <p>
                {active_source
                  ? source_summary(active_source)
                  : '选中来源后，这里会显示来源摘要、快照和工作表预览。'}
              </p>
              {source_detail ? (
                <div className='kb-meta-strip'>
                  <span className='kb-meta-pill'>
                    {source_detail.selected_version
                      ? format_version_label(source_detail.selected_version)
                      : '未选择快照'}
                  </span>
                  <span className='kb-meta-pill'>{`段落 ${source_detail.paragraph_count}`}</span>
                  <span className='kb-meta-pill'>{`实体 ${source_detail.entity_count}`}</span>
                  <span className='kb-meta-pill'>{`关系 ${source_detail.relation_count}`}</span>
                </div>
              ) : null}

              {active_source ? (
                <>
                  {source_detail?.versions.length ? (
                    <label className='kb-form-field'>
                      <span>快照</span>
                      <select
                        onChange={(event) => {
                          const next_version_id = event.target.value || null;
                          set_selected_source_version_id(next_version_id);
                          if (query_scope_source_id === active_source.id) {
                            set_query_scope_version_id(next_version_id);
                          }
                        }}
                        value={selected_source_version_id ?? source_detail.selected_version?.id ?? ''}
                      >
                        {source_detail.versions.map((version) => (
                          <option key={version.id} value={version.id}>
                            {format_version_label(version)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className='kb-form-field'>
                    <span>来源名称</span>
                    <input
                      onChange={(event) => set_name_draft(event.target.value)}
                      type='text'
                      value={name_draft}
                    />
                  </label>

                  <label className='kb-form-field'>
                    <span>摘要</span>
                    <textarea
                      onChange={(event) => set_summary_draft(event.target.value)}
                      rows={3}
                      value={summary_draft}
                    />
                  </label>

                  <div className='kb-button-row'>
                    <button
                      className='kb-primary-button'
                      disabled={is_updating_source || !name_draft.trim()}
                      onClick={() =>
                        void update_source(active_source.id, {
                          name: name_draft.trim(),
                          summary: summary_draft.trim() || undefined,
                        })
                      }
                      type='button'
                    >
                      {is_updating_source ? '保存中...' : '保存来源'}
                    </button>
                    <button
                      className='kb-secondary-button is-danger'
                      disabled={is_deleting_source}
                      onClick={() => void delete_source(active_source.id)}
                      type='button'
                    >
                      {is_deleting_source ? '删除中...' : '删除来源'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <div className='kb-detail-card'>
              <span className='kb-context-label'>工作表预览</span>
              <h3>{active_worksheet?.worksheet_name ?? '选择工作表'}</h3>
              <p>
                {active_worksheet
                  ? `当前工作表共 ${active_worksheet.row_count} 行。`
                  : '工作表预览只按单个 worksheet 返回，不会一次展开整本工作簿。'}
              </p>

              {active_source ? (
                <>
                  {source_worksheets.length ? (
                    <>
                      <label className='kb-form-field'>
                        <span>工作表</span>
                        <select
                          onChange={(event) => set_selected_worksheet_key(event.target.value || null)}
                          value={selected_worksheet_key ?? ''}
                        >
                          {source_worksheets.map((worksheet) => (
                            <option key={worksheet.worksheet_key} value={worksheet.worksheet_key}>
                              {`${worksheet.worksheet_name} · ${worksheet.row_count} 行`}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className='kb-meta-strip'>
                        {worksheet_page_copy ? <span className='kb-meta-pill'>{worksheet_page_copy}</span> : null}
                        {worksheet_range_copy ? <span className='kb-meta-pill'>{worksheet_range_copy}</span> : null}
                        {worksheet_anchor_row ? (
                          <span className='kb-meta-pill'>{`命中行 ${worksheet_anchor_row}`}</span>
                        ) : null}
                      </div>

                      <div className='kb-button-row'>
                        {worksheet_anchor_row ? (
                          <button
                            className='kb-secondary-button'
                            onClick={() =>
                              set_worksheet_preview_mode((current) =>
                                current === 'context' ? 'page' : 'context',
                              )
                            }
                            type='button'
                          >
                            {worksheet_preview_mode === 'context' ? '查看整页' : '仅看命中上下文'}
                          </button>
                        ) : null}
                        {worksheet_anchor_row ? (
                          <button
                            className='kb-secondary-button'
                            onClick={() => {
                              set_worksheet_page(1);
                              set_worksheet_preview_mode('context');
                            }}
                            type='button'
                          >
                            跳到命中行
                          </button>
                        ) : null}
                      </div>

                      {is_loading_source_worksheets || is_loading_worksheet_preview ? (
                        <div className='kb-empty-card'>正在加载工作表预览...</div>
                      ) : source_worksheets_error ? (
                        <div className='kb-empty-card'>{source_worksheets_error}</div>
                      ) : worksheet_preview_error ? (
                        <div className='kb-empty-card'>{worksheet_preview_error}</div>
                      ) : worksheet_preview ? (
                        <>
                          <WorksheetPreviewTable preview={worksheet_preview} />
                          {worksheet_preview_mode === 'page' && worksheet_preview.total_rows > 0 ? (
                            <div className='kb-button-row'>
                              <button
                                className='kb-secondary-button'
                                disabled={!worksheet_preview.has_prev}
                                onClick={() => set_worksheet_page((current) => Math.max(1, current - 1))}
                                type='button'
                              >
                                上一页
                              </button>
                              <button
                                className='kb-secondary-button'
                                disabled={!worksheet_preview.has_next}
                                onClick={() => set_worksheet_page((current) => current + 1)}
                                type='button'
                              >
                                下一页
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className='kb-empty-card'>选择工作表后，预览会显示在这里。</div>
                      )}
                    </>
                  ) : (
                    <div className='kb-empty-card'>当前来源没有可用工作表。</div>
                  )}
                </>
              ) : (
                <div className='kb-empty-card'>先选择来源，再查看工作表预览。</div>
              )}
            </div>

            <label className='kb-form-field'>
              <span>筛选段落</span>
              <input
                onChange={(event) => set_paragraph_keyword(event.target.value)}
                placeholder='按段落内容搜索'
                type='search'
                value={paragraph_keyword}
              />
            </label>

            <div className='kb-source-library-paragraphs' ref={paragraph_scroll_ref}>
              {filtered_paragraphs.length ? (
                <div
                  className='kb-virtual-list-spacer'
                  style={{
                    height: `${paragraph_virtualizer.getTotalSize()}px`,
                    position: 'relative',
                  }}
                >
                  {paragraph_virtualizer.getVirtualItems().map((virtual_item) => {
                    const paragraph = filtered_paragraphs[virtual_item.index];
                    return (
                      <div
                        className='kb-virtual-list-item'
                        data-index={virtual_item.index}
                        key={paragraph.id}
                        ref={paragraph_virtualizer.measureElement}
                        style={{
                          left: 0,
                          position: 'absolute',
                          top: 0,
                          transform: `translateY(${virtual_item.start}px)`,
                          width: '100%',
                        }}
                      >
                        <article className='kb-chat-source-card'>
                          <strong>{`#${paragraph.position + 1}`}</strong>
                          <ParagraphEvidencePreview
                            render_kind={paragraph.render_kind}
                            rendered_html={paragraph.rendered_html}
                            text_content={paragraph.content}
                          />
                          <div className='kb-meta-strip'>
                            <span className='kb-meta-pill'>
                              {source_detail?.selected_version
                                ? `v${source_detail.selected_version.version_number}`
                                : paragraph.version_id.slice(0, 8)}
                            </span>
                            <span className='kb-meta-pill'>{get_vector_state_label(paragraph.vector_state)}</span>
                            <span className='kb-meta-pill'>{`Token ${paragraph.token_count}`}</span>
                          </div>
                          <div className='kb-button-row'>
                            <button
                              className='kb-secondary-button'
                              onClick={() => on_focus_paragraph(paragraph.id)}
                              type='button'
                            >
                              在图谱中定位
                            </button>
                          </div>
                        </article>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className='kb-empty-card'>当前来源下没有匹配的段落。</div>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
