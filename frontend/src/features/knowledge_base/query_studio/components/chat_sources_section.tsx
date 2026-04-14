import { useEffect, useMemo, useState } from 'react';

import { ParagraphEvidencePreview } from '../../shared/components/paragraph_evidence_preview';
import type { AnswerCitationRecord } from '../../shared/types/knowledge_base_types';

interface ChatSourcesSectionProps {
  citations: AnswerCitationRecord[];
  excluded_source_ids: string[];
  on_toggle_source_exclusion: (source_id: string) => void;
  on_view_in_graph: (
    source_id: string,
    paragraph_id: string,
    options?: {
      preferred_anchor_node_id?: string | null;
      anchor_node_ids?: string[];
    },
  ) => void;
  on_open_source_preview: (citation: AnswerCitationRecord) => void;
}

const PAGE_SIZE = 3;

function pagination_label(page: number, page_count: number): string {
  return `第 ${page} 页 / 共 ${page_count} 页`;
}

export function ChatSourcesSection(props: ChatSourcesSectionProps) {
  const {
    citations,
    excluded_source_ids,
    on_toggle_source_exclusion,
    on_view_in_graph,
    on_open_source_preview,
  } = props;
  const [open, set_open] = useState(false);
  const [page, set_page] = useState(1);

  const page_count = Math.max(1, Math.ceil(citations.length / PAGE_SIZE));
  const visible_citations = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return citations.slice(start, start + PAGE_SIZE);
  }, [citations, page]);

  useEffect(() => {
    set_page((current) => Math.min(current, page_count));
  }, [page_count]);

  if (!citations.length) {
    return null;
  }

  return (
    <section className='kb-chat-sources'>
      <button className='kb-chat-sources-toggle' onClick={() => set_open((current) => !current)} type='button'>
        <strong>{open ? '收起来源' : '显示来源'}</strong>
        <span>{`${citations.length} 条引用`}</span>
      </button>

      {open ? (
        <div className='kb-chat-sources-body'>
          <div className='kb-chat-sources-scroll'>
            {visible_citations.map((citation) => {
              const excluded = excluded_source_ids.includes(citation.source_id);
              return (
                <article className='kb-chat-source-card' key={`${citation.source_id}-${citation.paragraph_id}`}>
                  <div className='kb-chat-source-head'>
                    <strong>{citation.source_name}</strong>
                    <span>{`匹配度 ${citation.score.toFixed(2)}`}</span>
                  </div>

                  <p className='kb-chat-source-reason'>
                    {citation.match_reason ?? '该证据参与了当前回答。'}
                  </p>

                  <ParagraphEvidencePreview
                    render_kind={citation.render_kind}
                    rendered_html={citation.rendered_html}
                    text_content={citation.snippet ?? citation.excerpt}
                  />

                  <div className='kb-chat-source-meta'>
                    {citation.file_path ? <span>{citation.file_path}</span> : null}
                    {citation.version_id ? <span>{`版本 ${citation.version_id}`}</span> : null}
                    {citation.worksheet_name ? <span>{citation.worksheet_name}</span> : null}
                    {citation.row_index !== null && citation.row_index !== undefined ? (
                      <span>{`行 ${citation.row_index}`}</span>
                    ) : null}
                    {citation.page_number !== null && citation.page_number !== undefined ? (
                      <span>{`第 ${citation.page_number} 页`}</span>
                    ) : null}
                  </div>

                  <div className='kb-button-row'>
                    <button
                      className='kb-secondary-button'
                      onClick={() =>
                        on_view_in_graph(citation.source_id, citation.paragraph_id, {
                          preferred_anchor_node_id: citation.preferred_anchor_node_id ?? null,
                          anchor_node_ids: citation.anchor_node_ids ?? [],
                        })
                      }
                      type='button'
                    >
                      在图谱中查看
                    </button>
                    <button
                      className='kb-secondary-button'
                      onClick={() => on_open_source_preview(citation)}
                      type='button'
                    >
                      在来源中查看
                    </button>
                    <button
                      className='kb-secondary-button'
                      onClick={() => on_toggle_source_exclusion(citation.source_id)}
                      type='button'
                    >
                      {excluded ? '重新纳入来源' : '排除此来源'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {page_count > 1 ? (
            <div className='kb-chat-sources-pagination'>
              <button
                className='kb-secondary-button'
                disabled={page <= 1}
                onClick={() => set_page((current) => Math.max(1, current - 1))}
                type='button'
              >
                上一页
              </button>
              <span>{pagination_label(page, page_count)}</span>
              <button
                className='kb-secondary-button'
                disabled={page >= page_count}
                onClick={() => set_page((current) => Math.min(page_count, current + 1))}
                type='button'
              >
                下一页
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
