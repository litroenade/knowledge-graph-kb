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
  const [llm_provider, set_llm_provider] = useState('');
  const [llm_base_url, set_llm_base_url] = useState('');
  const [llm_model, set_llm_model] = useState('');
  const [llm_api_key, set_llm_api_key] = useState('');
  const [clear_llm_api_key, set_clear_llm_api_key] = useState(false);
  const [use_saved_llm_api_key, set_use_saved_llm_api_key] = useState(true);
  const [embedding_provider, set_embedding_provider] = useState('');
  const [embedding_base_url, set_embedding_base_url] = useState('');
  const [embedding_model, set_embedding_model] = useState('');
  const [embedding_api_key, set_embedding_api_key] = useState('');
  const [clear_embedding_api_key, set_clear_embedding_api_key] = useState(false);
  const [use_saved_embedding_api_key, set_use_saved_embedding_api_key] = useState(true);
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
    set_llm_provider(next_config.llm_provider);
    set_llm_base_url(next_config.llm_base_url);
    set_llm_model(next_config.llm_model);
    set_llm_api_key('');
    set_clear_llm_api_key(false);
    set_use_saved_llm_api_key(true);
    set_embedding_provider(next_config.embedding_provider);
    set_embedding_base_url(next_config.embedding_base_url);
    set_embedding_model(next_config.embedding_model);
    set_embedding_api_key('');
    set_clear_embedding_api_key(false);
    set_use_saved_embedding_api_key(true);
  }, []);

  useEffect(() => {
    void load_config().catch((error) => set_message(to_user_error_message(error, 'model-config')));
  }, [load_config]);

  const vector_check = useMemo(
    () => props.ready?.checks.find((check) => check.name === 'vector_index') ?? null,
    [props.ready],
  );
  const llm_fields_ready = llm_provider.trim().length > 0 && llm_model.trim().length > 0;
  const embedding_fields_ready =
    embedding_provider.trim().length > 0 &&
    embedding_model.trim().length > 0;
  const normalized_llm_provider = llm_provider.trim().toLowerCase();
  const normalized_embedding_provider = embedding_provider.trim().toLowerCase();
  const normalized_llm_base_url = llm_base_url.trim().replace(/\/+$/, '');
  const normalized_embedding_base_url = embedding_base_url.trim().replace(/\/+$/, '');
  const same_endpoint =
    normalized_llm_provider === normalized_embedding_provider &&
    normalized_llm_base_url === normalized_embedding_base_url;
  const llm_test_key_ready =
    llm_api_key.trim().length > 0 ||
    (!clear_llm_api_key && use_saved_llm_api_key && Boolean(config?.llm_has_api_key));
  const embedding_test_key_ready =
    embedding_api_key.trim().length > 0 ||
    (!clear_embedding_api_key && use_saved_embedding_api_key && Boolean(config?.embedding_has_api_key)) ||
    (same_endpoint && llm_test_key_ready);
  const required_model_fields_ready = llm_fields_ready && embedding_fields_ready;
  const can_save_config = !busy && required_model_fields_ready;
  const can_test_config = !busy && required_model_fields_ready && llm_test_key_ready && embedding_test_key_ready;

  function change_clear_llm_api_key(next_value: boolean): void {
    set_clear_llm_api_key(next_value);
    if (next_value) {
      set_llm_api_key('');
      set_use_saved_llm_api_key(false);
    }
  }

  function change_clear_embedding_api_key(next_value: boolean): void {
    set_clear_embedding_api_key(next_value);
    if (next_value) {
      set_embedding_api_key('');
      set_use_saved_embedding_api_key(false);
    }
  }

  useEffect(() => {
    set_test_result(null);
  }, [
    llm_provider,
    llm_base_url,
    llm_model,
    llm_api_key,
    clear_llm_api_key,
    use_saved_llm_api_key,
    embedding_provider,
    embedding_base_url,
    embedding_model,
    embedding_api_key,
    clear_embedding_api_key,
    use_saved_embedding_api_key,
  ]);

  async function save_config(): Promise<void> {
    set_busy(true);
    set_message(null);
    try {
      const next_config = await update_model_config({
        llm_provider: llm_provider.trim(),
        llm_base_url: llm_base_url.trim(),
        llm_model: llm_model.trim(),
        llm_api_key: llm_api_key.trim() || null,
        clear_llm_api_key,
        embedding_provider: embedding_provider.trim(),
        embedding_base_url: embedding_base_url.trim(),
        embedding_model: embedding_model.trim(),
        embedding_api_key: embedding_api_key.trim() || null,
        clear_embedding_api_key,
      });
      set_config(next_config);
      set_llm_api_key('');
      set_embedding_api_key('');
      props.on_saved();
      set_message(next_config.reindex_required ? '配置已保存，Embedding 已变化，需要重新导入内容。' : '配置已保存。');
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
        llm_provider: llm_provider.trim(),
        llm_base_url: llm_base_url.trim(),
        llm_model: llm_model.trim(),
        llm_api_key: llm_api_key.trim() || null,
        use_saved_llm_api_key,
        embedding_provider: embedding_provider.trim(),
        embedding_base_url: embedding_base_url.trim(),
        embedding_model: embedding_model.trim(),
        embedding_api_key: embedding_api_key.trim() || null,
        use_saved_embedding_api_key,
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

      <div className='model-config-stack'>
        <div className='model-endpoint-card'>
          <header>
            <strong>LLM 端点</strong>
            <span>{presentation.llm_label}</span>
          </header>
          <div className='form-grid'>
            <label className='field'>
              <span>Provider</span>
              <input onChange={(event) => set_llm_provider(event.target.value)} placeholder='提供商标识' value={llm_provider} />
            </label>
            <label className='field'>
              <span>Base URL</span>
              <input onChange={(event) => set_llm_base_url(event.target.value)} placeholder='模型服务地址' value={llm_base_url} />
            </label>
            <label className='field'>
              <span>Model</span>
              <input onChange={(event) => set_llm_model(event.target.value)} placeholder='聊天或抽取模型名' value={llm_model} />
            </label>
            <label className='field'>
              <span>API Key</span>
              <input
                disabled={clear_llm_api_key}
                onChange={(event) => set_llm_api_key(event.target.value)}
                placeholder='留空则不更新'
                type='password'
                value={llm_api_key}
              />
            </label>
          </div>
          <div className='model-key-options'>
            <label className='field is-inline'>
              <span>保存时清除已保存 LLM Key</span>
              <input checked={clear_llm_api_key} onChange={(event) => change_clear_llm_api_key(event.target.checked)} type='checkbox' />
            </label>
            <label className='field is-inline'>
              <span>测试时使用已保存 LLM Key</span>
              <input
                checked={use_saved_llm_api_key}
                disabled={clear_llm_api_key}
                onChange={(event) => set_use_saved_llm_api_key(event.target.checked)}
                type='checkbox'
              />
            </label>
          </div>
        </div>

        <div className='model-endpoint-card'>
          <header>
            <strong>Embedding 端点</strong>
            <span>{presentation.embedding_label}</span>
          </header>
          <div className='form-grid'>
            <label className='field'>
              <span>Provider</span>
              <input onChange={(event) => set_embedding_provider(event.target.value)} placeholder='提供商标识' value={embedding_provider} />
            </label>
            <label className='field'>
              <span>Base URL</span>
              <input onChange={(event) => set_embedding_base_url(event.target.value)} placeholder='向量模型服务地址' value={embedding_base_url} />
            </label>
            <label className='field'>
              <span>Model</span>
              <input
                disabled={!presentation.embedding_editable}
                onChange={(event) => set_embedding_model(event.target.value)}
                placeholder='向量模型名'
                value={embedding_model}
              />
            </label>
            <label className='field'>
              <span>API Key</span>
              <input
                disabled={clear_embedding_api_key}
                onChange={(event) => set_embedding_api_key(event.target.value)}
                placeholder={same_endpoint ? '可复用 LLM Key' : '留空则不更新'}
                type='password'
                value={embedding_api_key}
              />
            </label>
          </div>
          <div className='model-key-options'>
            <label className='field is-inline'>
              <span>保存时清除已保存 Embedding Key</span>
              <input
                checked={clear_embedding_api_key}
                onChange={(event) => change_clear_embedding_api_key(event.target.checked)}
                type='checkbox'
              />
            </label>
            <label className='field is-inline'>
              <span>测试时使用已保存 Embedding Key</span>
              <input
                checked={use_saved_embedding_api_key}
                disabled={clear_embedding_api_key}
                onChange={(event) => set_use_saved_embedding_api_key(event.target.checked)}
                type='checkbox'
              />
            </label>
          </div>
        </div>
      </div>

      <div className='button-row'>
        <button disabled={!can_save_config} onClick={() => void save_config()} type='button'>保存配置</button>
        <button disabled={!can_test_config} onClick={() => void run_test()} type='button'>测试连接</button>
      </div>
      {!required_model_fields_ready ? <p className='muted'>填写两套端点的 Provider 和模型名后才能保存配置。</p> : null}
      {required_model_fields_ready && !can_test_config ? <p className='muted'>测试连接需要可用的 LLM Key 和 Embedding Key。</p> : null}

      {config ? (
        <div className='model-status-grid'>
          <div className='detail-block'>
            <strong>LLM Key</strong>
            <div><span>状态</span><b>{config.llm_has_api_key ? `已配置 ${config.llm_api_key_preview ?? ''}` : '未配置'}</b></div>
            <div><span>来源</span><b>{config.llm_api_key_source}</b></div>
            <div><span>端点</span><b>{config.llm_provider} · {config.llm_base_url}</b></div>
          </div>
          <div className='detail-block'>
            <strong>Embedding Key</strong>
            <div><span>状态</span><b>{config.embedding_has_api_key ? `已配置 ${config.embedding_api_key_preview ?? ''}` : '未配置'}</b></div>
            <div><span>来源</span><b>{config.embedding_api_key_source}</b></div>
            <div><span>端点</span><b>{config.embedding_provider} · {config.embedding_base_url}</b></div>
            <div><span>重建</span><b>{config.reindex_required ? '需要' : '不需要'}</b></div>
            {config.notice ? <div><span>提示</span><b>{config.notice}</b></div> : null}
          </div>
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
          <p className='muted'>就绪检查未返回 vector_index。</p>
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
