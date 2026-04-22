import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetch_model_config, test_model_config, update_model_config } from '../../../../shared/api/kb';
import { to_user_error_message } from '../../../../shared/api/errorMessages';
import type { ModelConfigResponse, ModelConfigTestResponse, SystemReady } from '../../../../shared/types/kb';
import { get_model_config_presentation, type ModelConfigMode } from '../../model/workspaceExperience';
import { stringify_detail } from './formatters';

interface ModelConfigPanelProps {
  ready: SystemReady | null;
  on_saved: () => void;
  mode?: ModelConfigMode;
  title?: string;
  description?: string;
}

export function ModelConfigPanel(props: ModelConfigPanelProps) {
  const [config, set_config] = useState<ModelConfigResponse | null>(null);
  const [provider, set_provider] = useState('');
  const [base_url, set_base_url] = useState('');
  const [llm_model, set_llm_model] = useState('');
  const [embedding_model, set_embedding_model] = useState('');
  const [api_key, set_api_key] = useState('');
  const [clear_api_key, set_clear_api_key] = useState(false);
  const [use_saved_api_key, set_use_saved_api_key] = useState(true);
  const [test_result, set_test_result] = useState<ModelConfigTestResponse | null>(null);
  const [busy, set_busy] = useState(false);
  const [message, set_message] = useState<string | null>(null);
  const presentation = useMemo(
    () => get_model_config_presentation(props.mode ? props.mode : 'shared'),
    [props.mode],
  );

  const load_config = useCallback(async () => {
    const next_config = await fetch_model_config();
    set_config(next_config);
    set_provider(next_config.provider);
    set_base_url(next_config.base_url);
    set_llm_model(next_config.llm_model);
    set_embedding_model(next_config.embedding_model);
    set_api_key('');
    set_clear_api_key(false);
  }, []);

  useEffect(() => {
    void load_config().catch((error) => set_message(to_user_error_message(error, 'model-config')));
  }, [load_config]);

  const vector_check = useMemo(
    () => props.ready?.checks.find((check) => check.name === 'vector_index') ?? null,
    [props.ready],
  );

  async function save_config(): Promise<void> {
    set_busy(true);
    set_message(null);
    try {
      const next_config = await update_model_config({
        provider: provider.trim(),
        base_url: base_url.trim(),
        llm_model: llm_model.trim(),
        embedding_model: embedding_model.trim(),
        api_key: api_key.trim() || null,
        clear_api_key,
      });
      set_config(next_config);
      set_api_key('');
      props.on_saved();
      set_message(next_config.reindex_required ? '配置已保存，后端提示需要重建向量索引。' : '配置已保存。');
    } catch (error) {
      set_message(to_user_error_message(error, 'model-config'));
    } finally {
      set_busy(false);
    }
  }

  async function run_test(): Promise<void> {
    set_busy(true);
    set_message(null);
    try {
      const result = await test_model_config({
        provider: provider.trim(),
        base_url: base_url.trim(),
        llm_model: llm_model.trim(),
        embedding_model: embedding_model.trim(),
        api_key: api_key.trim() || null,
        use_saved_api_key,
      });
      set_test_result(result);
      set_message(result.message);
    } catch (error) {
      set_message(to_user_error_message(error, 'model-config'));
    } finally {
      set_busy(false);
    }
  }

  function refresh_config(): void {
    set_message(null);
    void load_config().catch((error) => set_message(to_user_error_message(error, 'model-config')));
  }

  return (
    <section className='panel-body model-panel'>
      <div className='section-heading'>
        <span>{props.title ? props.title : presentation.title}</span>
        <button disabled={busy} onClick={refresh_config} type='button'>刷新</button>
      </div>
      <p className='muted'>{props.description ? props.description : presentation.description}</p>

      <div className='form-grid'>
        <label className='field'>
          <span>Provider</span>
          <input onChange={(event) => set_provider(event.target.value)} value={provider} />
        </label>
        <label className='field'>
          <span>Base URL</span>
          <input onChange={(event) => set_base_url(event.target.value)} value={base_url} />
        </label>
        <label className='field'>
          <span>{presentation.llm_label}</span>
          <input onChange={(event) => set_llm_model(event.target.value)} value={llm_model} />
        </label>
        <label className='field'>
          <span>{presentation.embedding_label}</span>
          <input
            disabled={!presentation.embedding_editable}
            onChange={(event) => set_embedding_model(event.target.value)}
            value={embedding_model}
          />
        </label>
      </div>

      <label className='field'>
        <span>API Key（留空则不更新）</span>
        <input onChange={(event) => set_api_key(event.target.value)} type='password' value={api_key} />
      </label>

      <label className='field is-inline'>
        <span>保存时清除已存 Key</span>
        <input checked={clear_api_key} onChange={(event) => set_clear_api_key(event.target.checked)} type='checkbox' />
      </label>
      <label className='field is-inline'>
        <span>测试时使用已保存 Key</span>
        <input checked={use_saved_api_key} onChange={(event) => set_use_saved_api_key(event.target.checked)} type='checkbox' />
      </label>

      <div className='button-row'>
        <button disabled={busy} onClick={() => void save_config()} type='button'>保存配置</button>
        <button disabled={busy} onClick={() => void run_test()} type='button'>测试连接</button>
      </div>

      {config ? (
        <div className='detail-block'>
          <strong>{presentation.status_title}</strong>
          <div><span>Key</span><b>{config.has_api_key ? `已配置 ${config.api_key_preview ?? ''}` : '未配置'}</b></div>
          <div><span>来源</span><b>{config.api_key_source}</b></div>
          <div><span>重建</span><b>{config.reindex_required ? '需要' : '不需要'}</b></div>
          {config.notice ? <div><span>提示</span><b>{config.notice}</b></div> : null}
        </div>
      ) : null}

      {test_result ? (
        <div className='detail-block'>
          <strong>连接测试</strong>
          <div><span>LLM</span><b>{test_result.llm_ok ? '通过' : '失败'}</b></div>
          <div><span>Embedding</span><b>{test_result.embedding_ok ? '通过' : '失败'}</b></div>
          <div><span>消息</span><b>{test_result.message}</b></div>
        </div>
      ) : null}

      <div className='detail-block'>
        <strong>索引状态</strong>
        {vector_check ? (
          <>
            <div><span>状态</span><b>{vector_check.ok ? '可用' : '异常'}</b></div>
            <div><span>消息</span><b>{vector_check.message}</b></div>
            <div><span>记录数</span><b>{stringify_detail(vector_check.details.record_count)}</b></div>
            <div><span>维度</span><b>{stringify_detail(vector_check.details.dimension)}</b></div>
            <div><span>模型签名</span><b>{stringify_detail(vector_check.details.model_signature)}</b></div>
          </>
        ) : (
          <p className='muted'>就绪检查中未返回 vector_index。</p>
        )}
      </div>

      <div className='capability-note'>
        <strong>{presentation.capability_title}</strong>
        <p>{presentation.capability_body}</p>
        {presentation.backend_pending_items.length ? (
          <ul className='pending-list'>
            {presentation.backend_pending_items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {message ? <p className='inline-message'>{message}</p> : null}
    </section>
  );
}
