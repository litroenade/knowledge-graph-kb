import { useMemo, useRef, useState, type FormEvent } from 'react';

import {
  get_input_mode_label,
  get_status_label,
  get_strategy_label,
} from '../../shared/config/ui_constants';
import { use_workspace_source_context } from '../../shared/context/knowledge_base_workspace_context';
import { use_import_center } from '../hooks/use_import_center';
import {
  format_import_task_short_id,
  format_import_task_timestamp,
  is_import_task_active,
  sort_import_tasks,
} from '../utils/import_task_order';

type ImportPanelMode = 'upload' | 'paste' | 'scan';

const STRATEGY_OPTIONS = [
  { value: 'auto', label: '自动策略' },
  { value: 'summary', label: '摘要抽取' },
  { value: 'factual', label: '事实抽取' },
  { value: 'semantic', label: '语义抽取' },
  { value: 'hybrid', label: '混合策略' },
];

function task_summary(task: { total_files: number; completed_files: number; failed_files: number }): string {
  return `文件 ${task.completed_files}/${task.total_files}，失败 ${task.failed_files}`;
}

export function ImportCenterPanel() {
  const source = use_workspace_source_context();
  const imports = use_import_center();
  const upload_input_ref = useRef<HTMLInputElement | null>(null);
  const [mode, set_mode] = useState<ImportPanelMode>('upload');
  const [strategy, set_strategy] = useState('auto');
  const [paste_title, set_paste_title] = useState('');
  const [paste_content, set_paste_content] = useState('');
  const [scan_root_path, set_scan_root_path] = useState('');
  const [scan_glob, set_scan_glob] = useState('**/*.*');

  const tasks = useMemo(() => sort_import_tasks(imports.tasks), [imports.tasks]);

  async function handle_upload_files(files: FileList | null): Promise<void> {
    if (!files?.length) {
      return;
    }
    await imports.upload_files(Array.from(files), strategy);
  }

  async function handle_submit_paste(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const title = paste_title.trim();
    const content = paste_content.trim();
    if (!title || !content) {
      return;
    }
    await imports.import_paste_text(title, content, strategy);
    setPasteTitle('');
    setPasteContent('');
  }

  async function handle_submit_scan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const root_path = scan_root_path.trim();
    const glob_pattern = scan_glob.trim() || '**/*.*';
    if (!root_path) {
      return;
    }
    await imports.import_scan_path(root_path, glob_pattern, strategy);
  }

  function setPasteTitle(value: string) {
    set_paste_title(value);
  }

  function setPasteContent(value: string) {
    set_paste_content(value);
  }

  return (
    <section className='kb-panel kb-import-page'>
      <header className='kb-chat-topbar'>
        <div className='kb-toolbar-copy'>
          <span className='kb-context-label'>导入中心</span>
          <strong>任务与进度</strong>
          <p>在这里提交新导入，并跟踪当前任务、失败重试和来源刷新。</p>
        </div>

        <div className='kb-chat-topbar-actions'>
          <button className='kb-secondary-button' onClick={() => void imports.refresh_tasks()} type='button'>
            刷新任务
          </button>
          <button className='kb-secondary-button' onClick={() => source.refresh_sources()} type='button'>
            刷新来源
          </button>
        </div>
      </header>

      <div className='kb-chat-composer-meta'>
        <span>{`导入任务 ${tasks.length}`}</span>
        <span>{`进行中 ${tasks.filter((task) => is_import_task_active(task)).length}`}</span>
      </div>

      <div className='kb-mode-tabs'>
        <button
          className={`kb-pill-button ${mode === 'upload' ? 'is-active' : ''}`}
          onClick={() => set_mode('upload')}
          type='button'
        >
          上传文件
        </button>
        <button
          className={`kb-pill-button ${mode === 'paste' ? 'is-active' : ''}`}
          onClick={() => set_mode('paste')}
          type='button'
        >
          粘贴文本
        </button>
        <button
          className={`kb-pill-button ${mode === 'scan' ? 'is-active' : ''}`}
          onClick={() => set_mode('scan')}
          type='button'
        >
          扫描目录
        </button>
      </div>

      <section className='kb-detail-card'>
        <label className='kb-form-field'>
          <span>导入策略</span>
          <select onChange={(event) => set_strategy(event.target.value)} value={strategy}>
            {STRATEGY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {mode === 'upload' ? (
          <div className='kb-button-row'>
            <button
              className='kb-primary-button'
              disabled={imports.is_submitting_import}
              onClick={() => upload_input_ref.current?.click()}
              type='button'
            >
              {imports.is_submitting_import ? '提交中…' : '选择文件并上传'}
            </button>
            <input
              hidden
              multiple
              onChange={(event) => void handle_upload_files(event.target.files)}
              ref={upload_input_ref}
              type='file'
            />
          </div>
        ) : null}

        {mode === 'paste' ? (
          <form className='kb-result-stack' onSubmit={(event) => void handle_submit_paste(event)}>
            <label className='kb-form-field'>
              <span>标题</span>
              <input onChange={(event) => setPasteTitle(event.target.value)} type='text' value={paste_title} />
            </label>
            <label className='kb-form-field'>
              <span>内容</span>
              <textarea onChange={(event) => setPasteContent(event.target.value)} rows={8} value={paste_content} />
            </label>
            <div className='kb-button-row'>
              <button
                className='kb-primary-button'
                disabled={imports.is_submitting_import || !paste_title.trim() || !paste_content.trim()}
                type='submit'
              >
                {imports.is_submitting_import ? '提交中…' : '提交文本导入'}
              </button>
            </div>
          </form>
        ) : null}

        {mode === 'scan' ? (
          <form className='kb-result-stack' onSubmit={(event) => void handle_submit_scan(event)}>
            <label className='kb-form-field'>
              <span>根目录</span>
              <input onChange={(event) => set_scan_root_path(event.target.value)} type='text' value={scan_root_path} />
            </label>
            <label className='kb-form-field'>
              <span>Glob 模式</span>
              <input onChange={(event) => set_scan_glob(event.target.value)} type='text' value={scan_glob} />
            </label>
            <div className='kb-button-row'>
              <button
                className='kb-primary-button'
                disabled={imports.is_submitting_import || !scan_root_path.trim()}
                type='submit'
              >
                {imports.is_submitting_import ? '提交中…' : '提交目录扫描'}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className='kb-task-list'>
        {tasks.map((task) => (
          <article className='kb-detail-card' key={task.id}>
            <div className='kb-button-row'>
              <strong>{task.source || `任务 ${format_import_task_short_id(task.id)}`}</strong>
              <div className='kb-meta-strip'>
                <span className='kb-meta-pill'>{get_input_mode_label(task.input_mode)}</span>
                <span className='kb-meta-pill'>{get_strategy_label(task.strategy)}</span>
                <span className='kb-meta-pill'>{get_status_label(task.status)}</span>
              </div>
            </div>

            <div className='kb-button-row'>
              <span>{`进度 ${task.progress}%`}</span>
              <span>{task_summary(task)}</span>
              <span>{format_import_task_timestamp(task.created_at)}</span>
            </div>

            <progress max={100} value={Math.max(0, Math.min(100, task.progress))} />

            <div className='kb-result-stack'>
              <span>{`当前步骤：${task.current_step || '未开始'}`}</span>
              {task.message ? <span>{task.message}</span> : null}
              {task.error ? <span className='kb-error-text'>{task.error}</span> : null}
            </div>

            <div className='kb-button-row'>
              {is_import_task_active(task) ? (
                <button
                  className='kb-secondary-button'
                  onClick={() => void imports.cancel_task(task.id)}
                  type='button'
                >
                  取消任务
                </button>
              ) : null}
              {task.status === 'failed' ? (
                <button
                  className='kb-secondary-button'
                  onClick={() => void imports.retry_task(task.id)}
                  type='button'
                >
                  重试任务
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!tasks.length ? <div className='kb-empty-card'>当前还没有导入任务。</div> : null}
      </section>
    </section>
  );
}
