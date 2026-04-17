import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { QUERY_MODE_OPTIONS } from '../../shared/config/ui_constants';
import {
  use_workspace_focus_context,
  use_workspace_graph_context,
  use_workspace_import_context,
  use_workspace_source_context,
  use_workspace_ui_context,
} from '../../shared/context/knowledge_base_workspace_context';
import { use_query_studio } from '../hooks/use_query_studio';
import { ChatDiagnosticsSection } from './chat_diagnostics_section';
import { ChatSourcesSection } from './chat_sources_section';
import { SourceLibraryDrawer } from './source_library_drawer';
import { ModelConfigModal } from '../../model_config/components/model_config_modal';
import '../styles/query_studio_panel.css';

function scope_label(mode: string): string {
  if (mode === 'single') {
    return '单个来源';
  }
  if (mode === 'subset') {
    return '自选来源';
  }
  return '全部来源';
}

const SCOPE_MODE_OPTIONS = [
  { id: 'all', label: '全部来源' },
  { id: 'single', label: '单个来源' },
  { id: 'subset', label: '自选来源' },
] as const;

function format_scope_version_label(version_number?: number | null, status?: string | null): string {
  if (!version_number) {
    return '当前激活快照';
  }
  return `快照 v${version_number}${status ? ` · ${status.toUpperCase()}` : ''}`;
}

function query_mode_supports_scope(mode: string): boolean {
  return mode === 'answer' || mode === 'record' || mode === 'entity' || mode === 'relation' || mode === 'source';
}

function query_mode_empty_copy(mode: string): { title: string; description: string } {
  if (mode === 'record') {
    return {
      title: '开始记录搜索',
      description: '输入关键词后搜索表格记录和结构化条目。',
    };
  }
  if (mode === 'entity') {
    return {
      title: '开始实体搜索',
      description: '输入实体名称后搜索知识图谱中的实体节点。',
    };
  }
  if (mode === 'relation') {
    return {
      title: '开始关系搜索',
      description: '输入实体名称或谓词后搜索语义关系。',
    };
  }
  if (mode === 'source') {
    return {
      title: '开始来源搜索',
      description: '输入来源名称、类型或摘要后搜索来源资料。',
    };
  }
  return {
    title: '开始提问',
    description: '先选择检索范围，然后提问。回答、来源与检索诊断会显示在这里。',
  };
}

export function QueryStudioPanel() {
  const query = use_query_studio();
  const ui = use_workspace_ui_context();
  const source = use_workspace_source_context();
  const graph = use_workspace_graph_context();
  const imports = use_workspace_import_context();
  const focus = use_workspace_focus_context();
  const upload_input_ref = useRef<HTMLInputElement | null>(null);
  const [query_text, set_query_text] = useState('');
  const scope_supported = query_mode_supports_scope(query.query_mode);

  const current_mode_label =
    QUERY_MODE_OPTIONS.find((option) => option.id === query.query_mode)?.label ?? '问答';
  const empty_copy = query_mode_empty_copy(query.query_mode);
  const current_scope_source_names = useMemo(() => {
    const source_by_id = new Map(source.sources.map((item) => [item.id, item.name]));
    return query.scope_source_ids.map((source_id) => source_by_id.get(source_id) ?? source_id);
  }, [query.scope_source_ids, source.sources]);
  const single_scope_source_id =
    query.current_scope.mode === 'single' ? query.current_scope.source_ids[0] ?? null : null;
  const scoped_source = useMemo(
    () => source.sources.find((item) => item.id === single_scope_source_id) ?? null,
    [single_scope_source_id, source.sources],
  );
  const scoped_source_versions =
    single_scope_source_id && source.selected_source_browser_id === single_scope_source_id
      ? source.source_versions
      : [];
  const selected_scope_version =
    scoped_source_versions.find((version) => version.id === query.scope_version_id) ??
    source.source_detail?.selected_version ??
    null;

  useEffect(() => {
    if (
      !scope_supported ||
      !single_scope_source_id ||
      source.selected_source_browser_id === single_scope_source_id
    ) {
      return;
    }
    source.set_selected_source_browser_id(single_scope_source_id);
  }, [
    scope_supported,
    single_scope_source_id,
    source.selected_source_browser_id,
    source.set_selected_source_browser_id,
  ]);

  useEffect(() => {
    if (
      !scope_supported ||
      !single_scope_source_id ||
      source.selected_source_browser_id !== single_scope_source_id
    ) {
      return;
    }
    const desired_version_id = query.scope_version_id ?? scoped_source?.active_version_id ?? null;
    if ((source.selected_source_version_id ?? null) === desired_version_id) {
      return;
    }
    source.set_selected_source_version_id(desired_version_id);
  }, [
    scope_supported,
    query.scope_version_id,
    scoped_source?.active_version_id,
    single_scope_source_id,
    source.selected_source_browser_id,
    source.selected_source_version_id,
    source.set_selected_source_version_id,
  ]);

  async function submit_query(): Promise<void> {
    const normalized = query_text.trim();
    if (!normalized || query.is_querying) {
      return;
    }
    await query.execute_query(normalized);
    set_query_text('');
  }

  async function handle_submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await submit_query();
  }

  async function handle_query_input_key_down(event: KeyboardEvent<HTMLTextAreaElement>): Promise<void> {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    await submit_query();
  }

  async function handle_upload_files(files: FileList | null): Promise<void> {
    if (!files?.length) {
      return;
    }
    await imports.upload_files(Array.from(files), 'auto');
    ui.set_active_workspace('import');
  }

  function handle_open_citation_source(citation: {
    source_id: string;
    version_id?: string | null;
    worksheet_key?: string | null;
    row_index?: number | null;
    anchor_row_index?: number | null;
    matched_fields?: string[];
  }): void {
    const has_worksheet_anchor = Boolean(citation.worksheet_key);
    focus.focus_source(citation.source_id, {
      version_id: citation.version_id ?? null,
      worksheet_key: has_worksheet_anchor ? (citation.worksheet_key ?? null) : null,
      anchor_row_index: has_worksheet_anchor ? (citation.anchor_row_index ?? citation.row_index ?? null) : null,
      highlighted_columns: has_worksheet_anchor ? (citation.matched_fields ?? []) : [],
    });
  }

  return (
    <section className='kb-panel kb-chat-page'>
      <header className='kb-chat-topbar'>
        <div className='kb-chat-session-rail'>
          {query.answer_sessions.map((session) => (
            <button
              className={`kb-chat-session-pill ${session.id === query.active_answer_session_id ? 'is-active' : ''}`}
              key={session.id}
              onClick={() => void query.select_answer_session(session.id)}
              type='button'
            >
              <strong>{session.title}</strong>
              <span>{session.last_message_at ? '最近更新' : '新建'}</span>
            </button>
          ))}
          {!query.answer_sessions.length ? <div className='kb-chat-session-status'>暂无会话</div> : null}
        </div>

        <div className='kb-chat-topbar-actions'>
          <button className='kb-secondary-button' onClick={() => void query.create_answer_session()} type='button'>
            新建问答
          </button>
          <button
            className='kb-secondary-button'
            onClick={() => ui.set_is_source_library_open(true)}
            type='button'
          >
            {scope_supported ? '来源范围' : '来源库'}
          </button>
          <button
            className='kb-secondary-button'
            onClick={() => upload_input_ref.current?.click()}
            type='button'
          >
            导入文件
          </button>
          <button
            className='kb-secondary-button'
            onClick={() => ui.set_is_settings_open(true)}
            type='button'
          >
            模型配置
          </button>
          <input
            hidden
            multiple
            onChange={(event) => void handle_upload_files(event.target.files)}
            ref={upload_input_ref}
            type='file'
          />
        </div>
      </header>

      <div className='kb-chat-composer-meta'>
        <span>{`当前模式：${current_mode_label}`}</span>
        <span>{scope_supported ? `当前范围：${scope_label(query.scope_mode)}` : '当前模式不支持来源范围过滤'}</span>
      </div>

      <div className='kb-mode-tabs'>
        {QUERY_MODE_OPTIONS.map((option) => (
          <button
            className={`kb-pill-button ${query.query_mode === option.id ? 'is-active' : ''}`}
            key={option.id}
            onClick={() => query.set_query_mode(option.id)}
            type='button'
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className='kb-chat-composer-card'>
        <div className='kb-chat-composer-meta'>
          <span>来源范围</span>
          <span>
            {scope_supported
              ? query.excluded_source_ids.length
                ? `已排除 ${query.excluded_source_ids.length} 个来源`
                : '未排除来源'
              : '当前模式使用整个知识库'}
          </span>
        </div>

        {scope_supported ? (
          <>
            <div className='kb-mode-tabs'>
              {SCOPE_MODE_OPTIONS.map((option) => (
                <button
                  className={`kb-pill-button ${query.scope_mode === option.id ? 'is-active' : ''}`}
                  key={option.id}
                  onClick={() => query.set_scope_mode(option.id)}
                  type='button'
                >
                  {option.label}
                </button>
              ))}
            </div>

            {query.scope_mode !== 'all' ? (
              <div className='kb-button-row'>
                {source.sources.map((item) => {
                  const selected = query.scope_source_ids.includes(item.id);
                  return (
                    <button
                      className={`kb-pill-button ${selected ? 'is-active' : ''}`}
                      key={item.id}
                      onClick={() => {
                        query.toggle_scope_source_id(item.id);
                        if (query.scope_mode === 'single') {
                          source.set_selected_source_browser_id(item.id);
                        }
                      }}
                      type='button'
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className='kb-chat-composer-meta'>
              <span>
                {query.scope_mode === 'all'
                  ? '当前会在全部可用来源中检索。'
                  : current_scope_source_names.length
                    ? current_scope_source_names.join(', ')
                    : '尚未选择来源。'}
              </span>
              <span>
                {query.current_scope.version_mode === 'specific'
                  ? `固定快照：${format_scope_version_label(
                      selected_scope_version?.version_number,
                      selected_scope_version?.status,
                    )}`
                  : '使用当前激活快照'}
              </span>
              {query.excluded_source_ids.length ? (
                <button className='kb-secondary-button' onClick={query.clear_source_exclusions} type='button'>
                  清空排除项
                </button>
              ) : null}
            </div>

            {query.current_scope.mode === 'single' ? (
              <label className='kb-form-field'>
                <span>快照</span>
                <select
                  onChange={(event) => {
                    const next_version_id = event.target.value || null;
                    query.set_scope_version_id(next_version_id);
                    source.set_selected_source_version_id(next_version_id ?? scoped_source?.active_version_id ?? null);
                  }}
                  value={query.scope_version_id ?? ''}
                >
                  <option value=''>当前激活快照</option>
                  {scoped_source_versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {format_scope_version_label(version.version_number, version.status)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : (
          <p className='kb-chat-source-reason'>
            实体、关系与来源搜索暂不支持按来源范围过滤。如需限定来源，请切换到“问答”或“记录”模式。
          </p>
        )}
      </section>

      <section className='kb-chat-thread-shell'>
        <div className='kb-chat-thread'>
          {query.query_mode === 'answer' ? (
            <>
              {!query.answer_messages.length ? (
                <section className='kb-chat-empty'>
                  <span className='kb-context-label'>知识问答</span>
                  <h3>{empty_copy.title}</h3>
                  <p>{empty_copy.description}</p>
                </section>
              ) : null}

              {query.answer_messages.map((message) => (
                <article
                  className={`kb-chat-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
                  key={message.id}
                >
                  <div className='kb-chat-bubble-head'>
                    <strong>{message.role === 'user' ? '用户' : '助手'}</strong>
                    <span>{message.created_at}</span>
                  </div>
                  <div className='kb-chat-bubble-body'>{message.content}</div>
                  {message.role === 'assistant' ? (
                    <>
                      <ChatSourcesSection
                        citations={message.citations}
                        excluded_source_ids={query.excluded_source_ids}
                        on_open_source_preview={handle_open_citation_source}
                        on_toggle_source_exclusion={query.toggle_source_exclusion}
                        on_view_in_graph={focus.focus_citation}
                      />
                      <ChatDiagnosticsSection execution={message.execution} retrieval_trace={message.retrieval_trace} />
                    </>
                  ) : null}
                </article>
              ))}
            </>
          ) : null}

          {query.query_mode === 'record' && !query.record_results.length && !query.is_querying ? (
            <section className='kb-chat-empty'>
              <span className='kb-context-label'>{current_mode_label}</span>
              <h3>{empty_copy.title}</h3>
              <p>{empty_copy.description}</p>
            </section>
          ) : null}
          {query.query_mode === 'record'
            ? query.record_results.map((item) => (
                <article className='kb-chat-source-card' key={item.paragraph_id}>
                  <div className='kb-chat-source-head'>
                    <strong>{item.source_name}</strong>
                    <span>{`匹配度 ${item.score.toFixed(2)}`}</span>
                  </div>
                  <div className='kb-chat-composer-meta'>
                    <span>{`${item.worksheet_name} · 行 ${item.row_index}`}</span>
                    {item.matched_cells.length ? <span>{`命中列：${item.matched_cells.join('、')}`}</span> : null}
                  </div>
                  <p className='kb-chat-source-reason'>{item.content}</p>
                  <div className='kb-button-row'>
                    <button
                      className='kb-secondary-button'
                      onClick={() => focus.focus_paragraph(item.paragraph_id)}
                      type='button'
                    >
                      定位段落
                    </button>
                  </div>
                </article>
              ))
            : null}

          {query.query_mode === 'entity' && !query.entity_results.length && !query.is_querying ? (
            <section className='kb-chat-empty'>
              <span className='kb-context-label'>{current_mode_label}</span>
              <h3>{empty_copy.title}</h3>
              <p>{empty_copy.description}</p>
            </section>
          ) : null}
          {query.query_mode === 'entity'
            ? query.entity_results.map((item) => (
                <article className='kb-chat-source-card' key={item.id}>
                  <div className='kb-chat-source-head'>
                    <strong>{item.display_name}</strong>
                    <span>{`出现 ${item.appearance_count} 次`}</span>
                  </div>
                  {item.description ? <p className='kb-chat-source-reason'>{item.description}</p> : null}
                  <div className='kb-button-row'>
                    <button
                      className='kb-secondary-button'
                      onClick={() => focus.focus_entity(item.id)}
                      type='button'
                    >
                      在图谱中查看
                    </button>
                    {item.paragraph_ids[0] ? (
                      <button
                        className='kb-secondary-button'
                        onClick={() => focus.focus_paragraph(item.paragraph_ids[0])}
                        type='button'
                      >
                        定位首个段落
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            : null}

          {query.query_mode === 'relation' && !query.relation_results.length && !query.is_querying ? (
            <section className='kb-chat-empty'>
              <span className='kb-context-label'>{current_mode_label}</span>
              <h3>{empty_copy.title}</h3>
              <p>{empty_copy.description}</p>
            </section>
          ) : null}
          {query.query_mode === 'relation'
            ? query.relation_results.map((item) => {
                const source_paragraph_id = item.source_paragraph_id;

                return (
                  <article className='kb-chat-source-card' key={item.id}>
                    <div className='kb-chat-source-head'>
                      <strong>{`${item.subject_name} · ${item.predicate} · ${item.object_name}`}</strong>
                      <span>{`置信度 ${item.confidence.toFixed(2)}`}</span>
                    </div>
                    <div className='kb-button-row'>
                      <button
                        className='kb-secondary-button'
                        onClick={() => focus.focus_relation(item.id)}
                        type='button'
                      >
                        在图谱中查看
                      </button>
                      {source_paragraph_id ? (
                        <button
                          className='kb-secondary-button'
                          onClick={() => focus.focus_paragraph(source_paragraph_id)}
                          type='button'
                        >
                          定位证据段落
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            : null}

          {query.query_mode === 'source' && !query.source_results.length && !query.is_querying ? (
            <section className='kb-chat-empty'>
              <span className='kb-context-label'>{current_mode_label}</span>
              <h3>{empty_copy.title}</h3>
              <p>{empty_copy.description}</p>
            </section>
          ) : null}
          {query.query_mode === 'source'
            ? query.source_results.map((item) => (
                <article className='kb-chat-source-card' key={item.id}>
                  <div className='kb-chat-source-head'>
                    <strong>{item.name}</strong>
                    <span>{`段落 ${item.paragraph_count}`}</span>
                  </div>
                  {item.summary ? <p className='kb-chat-source-reason'>{item.summary}</p> : null}
                  <div className='kb-chat-composer-meta'>
                    <span>{`类型：${item.source_kind}`}</span>
                  </div>
                  <div className='kb-button-row'>
                    <button
                      className='kb-secondary-button'
                      onClick={() => focus.focus_source(item.id)}
                      type='button'
                    >
                      查看来源
                    </button>
                  </div>
                </article>
              ))
            : null}

          {query.is_querying ? (
            <article className='kb-chat-bubble is-assistant is-pending'>
              <div className='kb-chat-bubble-head'>
                <strong>{query.query_mode === 'answer' ? '助手' : current_mode_label}</strong>
                <span>处理中</span>
              </div>
              <div className='kb-chat-bubble-body'>
                {query.query_mode === 'answer'
                  ? '正在检索当前范围内的证据并生成回答。'
                  : `正在执行${current_mode_label}，结果会显示在这里。`}
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className='kb-chat-composer-card'>
        <form className='kb-chat-composer-main' onSubmit={(event) => void handle_submit(event)}>
          <label className='kb-form-field kb-chat-composer-input'>
            <span>问题</span>
            <textarea
              onChange={(event) => set_query_text(event.target.value)}
              onKeyDown={(event) => void handle_query_input_key_down(event)}
              placeholder='输入你的问题，按 Enter 发送，Shift + Enter 换行。'
              value={query_text}
            />
          </label>

          <div className='kb-chat-composer-actions'>
            <div className='kb-chat-composer-meta'>
              <span>{scope_supported ? `当前范围：${scope_label(query.current_scope.mode)}` : '当前模式使用整个知识库'}</span>
              <span>{query.query_mode === 'answer' ? (query.is_loading_answer_sessions ? '会话加载中' : '会话已就绪') : '检索已就绪'}</span>
            </div>
            <button
              className='kb-primary-button'
              disabled={
                query.is_querying ||
                !query_text.trim() ||
                (scope_supported && query.current_scope.mode !== 'all' && !query.current_scope.source_ids.length)
              }
              type='submit'
            >
              {query.is_querying ? '发送中...' : '发送'}
            </button>
          </div>
        </form>
      </section>

      <SourceLibraryDrawer
        browser_sources={source.browser_sources}
        delete_source={source.delete_source}
        is_deleting_source={source.is_deleting_source}
        is_loading_source_worksheets={source.is_loading_source_worksheets}
        is_loading_worksheet_preview={source.is_loading_worksheet_preview}
        is_updating_source={source.is_updating_source}
        on_close={() => ui.set_is_source_library_open(false)}
        on_focus_paragraph={focus.focus_paragraph}
        open={ui.is_source_library_open}
        query_scope_source_id={scope_supported ? single_scope_source_id : null}
        selected_source_browser_id={source.selected_source_browser_id}
        selected_source_version_id={source.selected_source_version_id}
        selected_source_ids={graph.selected_source_ids}
        selected_worksheet_key={source.selected_worksheet_key}
        set_query_scope_version_id={query.set_scope_version_id}
        set_selected_source_browser_id={source.set_selected_source_browser_id}
        set_selected_source_version_id={source.set_selected_source_version_id}
        set_selected_source_ids={graph.set_selected_source_ids}
        set_selected_worksheet_key={source.set_selected_worksheet_key}
        set_worksheet_page={source.set_worksheet_page}
        set_worksheet_preview_mode={source.set_worksheet_preview_mode}
        source_detail={source.source_detail}
        source_paragraphs={source.source_paragraphs}
        source_worksheets={source.source_worksheets}
        source_worksheets_error={source.source_worksheets_error}
        sources={source.sources}
        update_source={source.update_source}
        worksheet_anchor_row={source.worksheet_anchor_row}
        worksheet_page={source.worksheet_page}
        worksheet_preview={source.worksheet_preview}
        worksheet_preview_error={source.worksheet_preview_error}
        worksheet_preview_mode={source.worksheet_preview_mode}
      />

      <ModelConfigModal on_close={() => ui.set_is_settings_open(false)} open={ui.is_settings_open} />
    </section>
  );
}
