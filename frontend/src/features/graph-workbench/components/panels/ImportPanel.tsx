import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  cancel_import_job,
  fetch_import_chunks,
  fetch_import_job,
  fetch_import_jobs,
  paste_import,
  retry_import_job,
  scan_import,
  upload_import_files,
} from '../../../../shared/api/kb';
import { to_user_error_message } from '../../../../shared/api/errorMessages';
import type { ImportJobChunkItem, ImportJobFileItem, ImportJobItem } from '../../../../shared/types/kb';
import { format_date, format_percent } from './formatters';

interface ImportPanelProps {
  on_import_finished: () => void;
}

type ImportInputTab = 'upload' | 'paste' | 'scan';

const STATUS_LABELS: Record<string, string> = {
  aborted: '已中止',
  cancelled: '已取消',
  cancelling: '取消中',
  completed: '已完成',
  failed: '失败',
  partial: '部分完成',
  queued: '排队中',
  ready: '就绪',
  running: '运行中',
};

const STEP_LABELS: Record<string, string> = {
  aborted: '已中止',
  cancelled: '已取消',
  cancelling: '取消中',
  completed: '已完成',
  embedding: '向量化',
  extracting: '抽取中',
  failed: '失败',
  indexing: '建索引',
  preparing: '准备中',
  queued: '排队中',
  splitting: '分块中',
  writing: '写入中',
};

const SOURCE_LABELS: Record<string, string> = {
  paste: '粘贴导入',
  scan: '目录扫描',
  upload: '文件上传',
};

const RUNNING_STATUSES = new Set(['running', 'preparing', 'cancelling']);
const QUEUED_STATUSES = new Set(['queued']);
const CANCELABLE_STATUSES = new Set(['queued', 'running', 'preparing', 'cancelling']);
const RETRYABLE_STATUSES = new Set(['failed', 'partial', 'aborted']);
const ACTIVE_STATUSES = new Set(['queued', 'running', 'preparing', 'cancelling']);
const SUCCESSFUL_TERMINAL_STATUSES = new Set(['completed', 'partial']);
const IMPORT_POLL_INTERVAL_MS = 1500;

function status_label(value: string): string {
  return STATUS_LABELS[value] ?? value;
}

function step_label(value: string): string {
  return STEP_LABELS[value] ?? value;
}

function source_label(value: string): string {
  return SOURCE_LABELS[value] ?? value;
}

function status_class(value: string): string {
  if (['completed', 'ready'].includes(value)) {
    return 'is-ok';
  }
  if (['failed', 'aborted'].includes(value)) {
    return 'is-danger';
  }
  if (['partial', 'cancelled', 'cancelling'].includes(value)) {
    return 'is-warning';
  }
  return 'is-running';
}

function extract_job_id(result: unknown): string | null {
  if (result && typeof result === 'object') {
    const direct = result as { id?: unknown; job?: { id?: unknown } };
    if (typeof direct.id === 'string') {
      return direct.id;
    }
    if (typeof direct.job?.id === 'string') {
      return direct.job.id;
    }
  }
  return null;
}

function format_count(done: number, total: number): string {
  return `${done}/${total}`;
}

function derive_paste_title(title: string, content: string): string {
  const clean_title = title.trim();
  if (clean_title) {
    return clean_title;
  }
  const first_content_line = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return first_content_line ? first_content_line.slice(0, 80) : '粘贴导入';
}

export function ImportPanel(props: ImportPanelProps) {
  const [active_tab, set_active_tab] = useState<ImportInputTab>('upload');
  const [jobs, set_jobs] = useState<ImportJobItem[]>([]);
  const [selected_job_id, set_selected_job_id] = useState<string | null>(null);
  const [selected_job, set_selected_job] = useState<ImportJobItem | null>(null);
  const [selected_file_id, set_selected_file_id] = useState<string | null>(null);
  const [chunks, set_chunks] = useState<ImportJobChunkItem[]>([]);
  const [title, set_title] = useState('');
  const [content, set_content] = useState('');
  const [root_path, set_root_path] = useState('');
  const [glob_pattern, set_glob_pattern] = useState('**/*');
  const [strategy, set_strategy] = useState('auto');
  const [files, set_files] = useState<File[]>([]);
  const [busy, set_busy] = useState(false);
  const [message, set_message] = useState<string | null>(null);
  const active_job_ids_ref = useRef<Set<string>>(new Set());
  const notified_job_versions_ref = useRef<Set<string>>(new Set());

  const reconcile_import_notifications = useCallback((next_jobs: ImportJobItem[]) => {
    const previous_active_ids = active_job_ids_ref.current;
    const next_active_ids = new Set<string>();

    for (const job of next_jobs) {
      if (ACTIVE_STATUSES.has(job.status)) {
        next_active_ids.add(job.id);
        continue;
      }
      const notification_key = `${job.id}:${job.status}:${job.updated_at}`;
      if (
        SUCCESSFUL_TERMINAL_STATUSES.has(job.status)
        && previous_active_ids.has(job.id)
        && !notified_job_versions_ref.current.has(notification_key)
      ) {
        notified_job_versions_ref.current.add(notification_key);
        props.on_import_finished();
      }
    }

    active_job_ids_ref.current = next_active_ids;
  }, [props.on_import_finished]);

  const load_jobs = useCallback(async () => {
    const next_jobs = await fetch_import_jobs(50);
    set_jobs(next_jobs);
    reconcile_import_notifications(next_jobs);
    return next_jobs;
  }, [reconcile_import_notifications]);

  const selected_job_summary = useMemo(() => (
    selected_job_id ? jobs.find((job) => job.id === selected_job_id) ?? null : null
  ), [jobs, selected_job_id]);

  const has_active_jobs = useMemo(() => jobs.some((job) => ACTIVE_STATUSES.has(job.status)), [jobs]);

  const refresh_jobs = useCallback(() => {
    set_message(null);
    void load_jobs().catch((error) => set_message(to_user_error_message(error, 'import')));
  }, [load_jobs]);

  useEffect(() => {
    refresh_jobs();
  }, [refresh_jobs]);

  useEffect(() => {
    if (!has_active_jobs) {
      return;
    }
    const timer_id = window.setInterval(() => {
      void load_jobs().catch((error) => set_message(to_user_error_message(error, 'import')));
    }, IMPORT_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer_id);
  }, [has_active_jobs, load_jobs]);

  useEffect(() => {
    if (selected_job_id && jobs.some((job) => job.id === selected_job_id)) {
      return;
    }
    set_selected_job_id(jobs[0]?.id ?? null);
  }, [jobs, selected_job_id]);

  useEffect(() => {
    let ignore = false;
    if (!selected_job_id) {
      set_selected_job(null);
      set_selected_file_id(null);
      set_chunks([]);
      return;
    }

    fetch_import_job(selected_job_id)
      .then((job) => {
        if (ignore) {
          return;
        }
        set_selected_job(job);
        set_selected_file_id((current) => {
          if (current && job.files.some((file) => file.id === current)) {
            return current;
          }
          return job.files[0]?.id ?? null;
        });
      })
      .catch((error) => {
        if (!ignore) {
          set_message(to_user_error_message(error, 'import'));
        }
      });

    return () => {
      ignore = true;
    };
  }, [selected_job_id, selected_job_summary?.updated_at]);

  useEffect(() => {
    let ignore = false;
    if (!selected_job_id || !selected_file_id) {
      set_chunks([]);
      return;
    }

    fetch_import_chunks(selected_job_id, selected_file_id)
      .then((items) => {
        if (!ignore) {
          set_chunks(items);
        }
      })
      .catch((error) => {
        if (!ignore) {
          set_chunks([]);
          set_message(to_user_error_message(error, 'import'));
        }
      });

    return () => {
      ignore = true;
    };
  }, [selected_file_id, selected_job?.updated_at, selected_job_id]);

  async function run_action(action: () => Promise<unknown>, success: string): Promise<void> {
    set_busy(true);
    set_message(null);
    try {
      const result = await action();
      const job_id = extract_job_id(result);
      if (job_id) {
        set_selected_job_id(job_id);
        active_job_ids_ref.current = new Set(active_job_ids_ref.current).add(job_id);
      }
      set_message(success);
      await load_jobs();
    } catch (error) {
      set_message(to_user_error_message(error, 'import'));
    } finally {
      set_busy(false);
    }
  }

  async function submit_paste(): Promise<void> {
    const clean_content = content.trim();
    if (!clean_content) {
      set_message('粘贴导入需要正文。');
      return;
    }
    const clean_title = derive_paste_title(title, clean_content);
    await run_action(
      () => paste_import({ title: clean_title, content: clean_content, strategy, metadata: {} }),
      '粘贴导入任务已提交。',
    );
  }

  async function submit_scan(): Promise<void> {
    const clean_root = root_path.trim();
    if (!clean_root) {
      set_message('目录扫描需要根路径。');
      return;
    }
    await run_action(
      () => scan_import({ root_path: clean_root, glob_pattern: glob_pattern.trim() || '**/*', strategy }),
      '目录扫描任务已提交。',
    );
  }

  async function submit_upload(): Promise<void> {
    if (!files.length) {
      set_message('请选择要上传的文件。');
      return;
    }
    await run_action(async () => {
      const response = await upload_import_files(files, strategy);
      set_files([]);
      return response;
    }, '文件上传任务已提交。');
  }

  async function cancel_job(job_id: string): Promise<void> {
    await run_action(() => cancel_import_job(job_id), '已请求取消任务。');
  }

  async function retry_job(job_id: string): Promise<void> {
    await run_action(() => retry_import_job(job_id), '失败任务已重新提交。');
  }

  const grouped_jobs = useMemo(() => {
    const running: ImportJobItem[] = [];
    const queued: ImportJobItem[] = [];
    const recent: ImportJobItem[] = [];
    for (const job of jobs) {
      if (RUNNING_STATUSES.has(job.status)) {
        running.push(job);
      } else if (QUEUED_STATUSES.has(job.status)) {
        queued.push(job);
      } else {
        recent.push(job);
      }
    }
    return { running, queued, recent };
  }, [jobs]);

  const pasted_chars = content.trim().length;
  const selected_file = selected_job?.files.find((file) => file.id === selected_file_id) ?? null;
  const selected_file_names = files.map((file) => file.name);
  const preview_job = selected_job_summary ?? selected_job;
  const can_submit_upload = !busy && files.length > 0;
  const can_submit_paste = !busy && content.trim().length > 0;
  const can_submit_scan = !busy && root_path.trim().length > 0;

  function render_job_card(job: ImportJobItem): JSX.Element {
    const is_active = selected_job_id === job.id;
    return (
      <button
        className={`task-card ${is_active ? 'is-active' : ''}`}
        key={job.id}
        onClick={() => set_selected_job_id(job.id)}
        type='button'
      >
        <span>
          <strong>{source_label(job.source)}</strong>
          <b className={`status-badge ${status_class(job.status)}`}>{status_label(job.status)}</b>
        </span>
        <small>{job.id.slice(0, 12)} · {step_label(job.current_step)}</small>
        <span className='progress-track'><i style={{ width: format_percent(job.progress) }} /></span>
        <small>{format_percent(job.progress)} · 文件 {format_count(job.completed_files, job.total_files)} · 分块 {format_count(job.completed_chunks, job.total_chunks)}</small>
      </button>
    );
  }

  function render_file_row(file: ImportJobFileItem): JSX.Element {
    const is_active = file.id === selected_file_id;
    return (
      <tr className={is_active ? 'is-selected' : ''} key={file.id} onClick={() => set_selected_file_id(file.id)}>
        <td>{file.name}</td>
        <td>{file.input_mode}</td>
        <td><span className={`status-badge ${status_class(file.status)}`}>{status_label(file.status)}</span></td>
        <td>{step_label(file.current_step)}</td>
        <td>{format_percent(file.progress)}</td>
        <td>{format_count(file.completed_chunks, file.total_chunks)}</td>
      </tr>
    );
  }

  return (
    <section className='panel-body import-panel'>
      <div className='section-heading'>
        <span>导入中心</span>
        <button disabled={busy} onClick={refresh_jobs} type='button'>刷新任务</button>
      </div>

      <div className='import-workbench-grid'>
        <div className='import-compose-card'>
          <div className='import-tabs' role='tablist'>
            <button
              aria-selected={active_tab === 'upload'}
              className={active_tab === 'upload' ? 'active' : ''}
              onClick={() => set_active_tab('upload')}
              type='button'
            >
              上传文件
            </button>
            <button
              aria-selected={active_tab === 'paste'}
              className={active_tab === 'paste' ? 'active' : ''}
              onClick={() => set_active_tab('paste')}
              type='button'
            >
              粘贴导入
            </button>
            <button
              aria-selected={active_tab === 'scan'}
              className={active_tab === 'scan' ? 'active' : ''}
              onClick={() => set_active_tab('scan')}
              type='button'
            >
              扫描目录
            </button>
          </div>

          <div className='form-grid'>
            <label className='field'>
              <span>解析策略</span>
              <select onChange={(event) => set_strategy(event.target.value)} value={strategy}>
                <option value='auto'>自动 auto</option>
                <option value='plain'>纯文本 plain</option>
                <option value='table'>表格 table</option>
                <option value='openie'>关系抽取 openie</option>
              </select>
            </label>
          </div>

          <div className='import-preview-grid'>
            <div className='detail-block'>
              <strong>输入预览</strong>
              <div><span>粘贴文本</span><b>{pasted_chars ? `${pasted_chars} 字符` : '未填写'}</b></div>
              <div><span>上传文件</span><b>{selected_file_names.length ? `${selected_file_names.length} 个文件` : '未选择'}</b></div>
              <div><span>扫描目录</span><b>{root_path.trim() ? root_path.trim() : '未填写'}</b></div>
            </div>
            <div className='detail-block'>
              <strong>执行摘要</strong>
              <div><span>策略</span><b>{strategy}</b></div>
              <div><span>Glob</span><b>{glob_pattern.trim() || '**/*'}</b></div>
              <div><span>最近任务</span><b>{preview_job ? `${status_label(preview_job.status)} · ${format_percent(preview_job.progress)}` : '等待提交'}</b></div>
            </div>
          </div>

          {active_tab === 'upload' ? (
            <div className='import-tab-panel'>
              <label className='file-pick'>
                <input
                  multiple
                  onChange={(event) => set_files(Array.from(event.target.files ?? []))}
                  type='file'
                />
                <span className='file-pick-button'>选择文件</span>
                <span className='file-pick-name'>{files.length ? `已选择 ${files.length} 个文件` : '支持 txt、md、json、pdf、docx、xlsx 等文件'}</span>
              </label>
              <div className='selected-file-list'>
                {files.map((file) => (
                  <div key={`${file.name}-${file.size}-${file.lastModified}`}>
                    <span>{file.name}</span>
                    <small>{(file.size / 1024).toFixed(1)} KB</small>
                  </div>
                ))}
                {!files.length ? <p className='muted'>暂无待上传文件。</p> : null}
              </div>
              <div className='button-row'>
                <button disabled={!can_submit_upload} onClick={() => void submit_upload()} type='button'>提交上传任务</button>
                <button disabled={busy || !files.length} onClick={() => set_files([])} type='button'>清空文件</button>
              </div>
            </div>
          ) : null}

          {active_tab === 'paste' ? (
            <div className='import-tab-panel'>
              <label className='field'>
                <span>标题（可选）</span>
                <input onChange={(event) => set_title(event.target.value)} placeholder='留空时自动使用正文首行' value={title} />
              </label>
              <label className='field'>
                <span>正文</span>
                <textarea onChange={(event) => set_content(event.target.value)} placeholder='粘贴要导入的知识内容' rows={7} value={content} />
              </label>
              <button disabled={!can_submit_paste} onClick={() => void submit_paste()} type='button'>提交粘贴任务</button>
            </div>
          ) : null}

          {active_tab === 'scan' ? (
            <div className='import-tab-panel'>
              <label className='field'>
                <span>根路径</span>
                <input onChange={(event) => set_root_path(event.target.value)} placeholder='输入允许扫描的本地目录' value={root_path} />
              </label>
              <label className='field'>
                <span>Glob</span>
                <input onChange={(event) => set_glob_pattern(event.target.value)} value={glob_pattern} />
              </label>
              <button disabled={!can_submit_scan} onClick={() => void submit_scan()} type='button'>提交扫描任务</button>
            </div>
          ) : null}

          {message ? <p className='inline-message'>{message}</p> : null}
        </div>

        <div className='task-board'>
          <div className='section-heading'>
            <span>任务队列</span>
            <small className='muted'>最近 50 个任务</small>
          </div>
          <div className='task-column'>
            <strong>运行中</strong>
            <div className='task-list-compact'>
              {grouped_jobs.running.length ? grouped_jobs.running.map(render_job_card) : <p className='muted'>暂无运行任务。</p>}
            </div>
          </div>
          <div className='task-column'>
            <strong>排队中</strong>
            <div className='task-list-compact'>
              {grouped_jobs.queued.length ? grouped_jobs.queued.map(render_job_card) : <p className='muted'>暂无排队任务。</p>}
            </div>
          </div>
          <div className='task-column'>
            <strong>最近完成</strong>
            <div className='task-list-compact'>
              {grouped_jobs.recent.length ? grouped_jobs.recent.map(render_job_card) : <p className='muted'>暂无历史任务。</p>}
            </div>
          </div>
        </div>

        <div className='import-detail-panel'>
          <div className='section-heading'>
            <span>任务详情</span>
            {selected_job ? <small className='muted'>{format_date(selected_job.updated_at)}</small> : null}
          </div>

          {selected_job ? (
            <>
              <div className='detail-block'>
                <strong>{source_label(selected_job.source)}</strong>
                <div><span>任务 ID</span><b>{selected_job.id}</b></div>
                <div><span>状态</span><b>{status_label(selected_job.status)} · {step_label(selected_job.current_step)}</b></div>
                <div><span>策略</span><b>{selected_job.strategy}</b></div>
                {selected_job.error ? <p className='is-danger'>{selected_job.error}</p> : null}
                {selected_job.message ? <p>{selected_job.message}</p> : null}
                <span className='progress-track'><i style={{ width: format_percent(selected_job.progress) }} /></span>
              </div>

              <div className='metric-grid'>
                <div><span>文件</span><b>{format_count(selected_job.completed_files, selected_job.total_files)}</b></div>
                <div><span>失败文件</span><b>{selected_job.failed_files}</b></div>
                <div><span>分块</span><b>{format_count(selected_job.completed_chunks, selected_job.total_chunks)}</b></div>
                <div><span>失败分块</span><b>{selected_job.failed_chunks}</b></div>
              </div>

              <div className='button-row'>
                <button
                  disabled={busy || !CANCELABLE_STATUSES.has(selected_job.status)}
                  onClick={() => void cancel_job(selected_job.id)}
                  type='button'
                >
                  取消任务
                </button>
                <button disabled={busy || !RETRYABLE_STATUSES.has(selected_job.status)} onClick={() => void retry_job(selected_job.id)} type='button'>重试失败项</button>
              </div>

              <div className='import-detail-grid'>
                <div>
                  <div className='section-heading'>
                    <span>文件级状态</span>
                    <small className='muted'>{selected_job.files.length} 个文件</small>
                  </div>
                  <div className='import-table-scroll'>
                    <table>
                      <thead>
                        <tr>
                          <th>文件</th>
                          <th>模式</th>
                          <th>状态</th>
                          <th>步骤</th>
                          <th>进度</th>
                          <th>分块</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected_job.files.map(render_file_row)}
                        {!selected_job.files.length ? (
                          <tr><td colSpan={6}>暂无文件明细。</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className='section-heading'>
                    <span>分块级状态</span>
                    <small className='muted'>{selected_file ? selected_file.name : '未选择文件'}</small>
                  </div>
                  <div className='import-table-scroll'>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>类型</th>
                          <th>状态</th>
                          <th>步骤</th>
                          <th>预览</th>
                          <th>错误</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chunks.map((chunk) => (
                          <tr key={chunk.id}>
                            <td>{chunk.chunk_index}</td>
                            <td>{chunk.chunk_type}</td>
                            <td><span className={`status-badge ${status_class(chunk.status)}`}>{status_label(chunk.status)}</span></td>
                            <td>{step_label(chunk.step)}</td>
                            <td>{chunk.content_preview ?? '-'}</td>
                            <td>{chunk.error ?? '-'}</td>
                          </tr>
                        ))}
                        {!chunks.length ? (
                          <tr><td colSpan={6}>暂无分块明细。</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className='muted'>请选择任务查看详情。</p>
          )}
        </div>
      </div>
    </section>
  );
}
