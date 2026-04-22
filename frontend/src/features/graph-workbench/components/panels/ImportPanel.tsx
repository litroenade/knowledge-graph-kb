import { useCallback, useEffect, useState } from 'react';

import {
  cancel_import_job,
  fetch_import_jobs,
  paste_import,
  retry_import_job,
  scan_import,
  upload_import_files,
} from '../../../../shared/api/kb';
import type { ImportJobItem } from '../../../../shared/types/kb';
import { format_date, format_percent } from './formatters';

interface ImportPanelProps {
  on_import_finished: () => void;
}

export function ImportPanel(props: ImportPanelProps) {
  const [jobs, set_jobs] = useState<ImportJobItem[]>([]);
  const [title, set_title] = useState('');
  const [content, set_content] = useState('');
  const [root_path, set_root_path] = useState('');
  const [glob_pattern, set_glob_pattern] = useState('**/*');
  const [strategy, set_strategy] = useState('auto');
  const [files, set_files] = useState<File[]>([]);
  const [busy, set_busy] = useState(false);
  const [message, set_message] = useState<string | null>(null);

  const load_jobs = useCallback(async () => {
    const next_jobs = await fetch_import_jobs(50);
    set_jobs(next_jobs);
  }, []);

  useEffect(() => {
    void load_jobs().catch((error) => set_message((error as Error).message));
  }, [load_jobs]);

  async function run_action(action: () => Promise<unknown>, success: string): Promise<void> {
    set_busy(true);
    set_message(null);
    try {
      await action();
      set_message(success);
      await load_jobs();
      props.on_import_finished();
    } catch (error) {
      set_message((error as Error).message);
    } finally {
      set_busy(false);
    }
  }

  async function submit_paste(): Promise<void> {
    const clean_title = title.trim();
    const clean_content = content.trim();
    if (!clean_title || !clean_content) {
      set_message('粘贴导入需要标题和正文。');
      return;
    }
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
    await run_action(() => upload_import_files(files, strategy), '文件上传任务已提交。');
  }

  async function cancel_job(job_id: string): Promise<void> {
    await run_action(() => cancel_import_job(job_id), '任务已取消。');
  }

  async function retry_job(job_id: string): Promise<void> {
    await run_action(() => retry_import_job(job_id), '任务已重新提交。');
  }

  return (
    <section className='panel-body import-panel'>
      <div className='section-heading'>
        <span>导入中心</span>
        <button disabled={busy} onClick={() => void load_jobs()} type='button'>刷新</button>
      </div>

      <div className='form-grid'>
        <label className='field'>
          <span>导入策略</span>
          <select onChange={(event) => set_strategy(event.target.value)} value={strategy}>
            <option value='auto'>auto</option>
            <option value='plain'>plain</option>
            <option value='table'>table</option>
            <option value='openie'>openie</option>
          </select>
        </label>
      </div>

      <div className='stacked-tool'>
        <strong>粘贴文本</strong>
        <label className='field'>
          <span>标题</span>
          <input onChange={(event) => set_title(event.target.value)} value={title} />
        </label>
        <label className='field'>
          <span>正文</span>
          <textarea onChange={(event) => set_content(event.target.value)} rows={5} value={content} />
        </label>
        <button disabled={busy} onClick={() => void submit_paste()} type='button'>提交粘贴导入</button>
      </div>

      <div className='stacked-tool'>
        <strong>上传文件</strong>
        <input
          multiple
          onChange={(event) => set_files(Array.from(event.target.files ?? []))}
          type='file'
        />
        <button disabled={busy} onClick={() => void submit_upload()} type='button'>上传并导入</button>
      </div>

      <div className='stacked-tool'>
        <strong>扫描目录</strong>
        <label className='field'>
          <span>根路径</span>
          <input onChange={(event) => set_root_path(event.target.value)} value={root_path} />
        </label>
        <label className='field'>
          <span>Glob</span>
          <input onChange={(event) => set_glob_pattern(event.target.value)} value={glob_pattern} />
        </label>
        <button disabled={busy} onClick={() => void submit_scan()} type='button'>提交扫描任务</button>
      </div>

      {message ? <p className='inline-message'>{message}</p> : null}

      <div className='job-list'>
        {jobs.map((job) => (
          <article className='job-item' key={job.id}>
            <div className='job-item-header'>
              <strong>{job.source}</strong>
              <span>{job.status} · {format_percent(job.progress)}</span>
            </div>
            <p>{job.current_step} · 文件 {job.completed_files}/{job.total_files} · 分块 {job.completed_chunks}/{job.total_chunks}</p>
            {job.error ? <p className='is-danger'>{job.error}</p> : null}
            <div className='job-item-footer'>
              <span>{format_date(job.updated_at)}</span>
              <div>
                <button disabled={busy || !['queued', 'running'].includes(job.status)} onClick={() => void cancel_job(job.id)} type='button'>
                  取消
                </button>
                <button disabled={busy} onClick={() => void retry_job(job.id)} type='button'>重试</button>
              </div>
            </div>
          </article>
        ))}
        {!jobs.length ? <p className='muted'>暂无导入任务。</p> : null}
      </div>
    </section>
  );
}
