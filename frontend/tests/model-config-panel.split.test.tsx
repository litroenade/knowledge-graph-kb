import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelConfigPanel } from '../src/features/graph-workbench/components/panels/ModelConfigPanel';
import { fetch_model_config, test_model_config, update_model_config } from '../src/shared/api/kb';
import type { ModelConfigResponse, ModelConfigTestResponse, SystemReady } from '../src/shared/types/kb';

vi.mock('../src/shared/api/kb', () => ({
  fetch_model_config: vi.fn(),
  test_model_config: vi.fn(),
  update_model_config: vi.fn(),
}));

const config: ModelConfigResponse = {
  llm_provider: 'deepseek',
  llm_base_url: 'https://api.deepseek.com',
  llm_model: 'deepseek-chat',
  llm_has_api_key: true,
  llm_api_key_preview: 'deep...chat',
  llm_api_key_source: 'saved',
  embedding_provider: 'siliconflow',
  embedding_base_url: 'https://api.siliconflow.cn/v1',
  embedding_model: 'BAAI/bge-m3',
  embedding_has_api_key: true,
  embedding_api_key_preview: 'sili...flow',
  embedding_api_key_source: 'saved',
  reindex_required: false,
  notice: null,
};

const ready: SystemReady = {
  status: 'ok',
  checks: [
    {
      name: 'vector_index',
      ok: true,
      message: 'ok',
      details: {
        dimension: 1024,
        model_signature: 'siliconflow:https://api.siliconflow.cn/v1:BAAI/bge-m3',
        record_count: 0,
      },
    },
  ],
};

const test_result: ModelConfigTestResponse = {
  llm_provider: 'deepseek',
  llm_base_url: 'https://api.deepseek.com',
  llm_model: 'deepseek-chat',
  embedding_provider: 'siliconflow',
  embedding_base_url: 'https://api.siliconflow.cn/v1',
  embedding_model: 'BAAI/bge-m3',
  llm_ok: true,
  embedding_ok: true,
  message: 'ok',
};

describe('ModelConfigPanel split endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetch_model_config).mockResolvedValue(config);
    vi.mocked(test_model_config).mockResolvedValue(test_result);
    vi.mocked(update_model_config).mockResolvedValue(config);
  });

  it('saves separate LLM and Embedding endpoint payloads', async () => {
    render(<ModelConfigPanel on_saved={vi.fn()} ready={ready} />);

    await waitFor(() => expect(fetch_model_config).toHaveBeenCalled());

    fireEvent.change(screen.getAllByLabelText('API Key')[0], { target: { value: 'deepseek-key' } });
    fireEvent.change(screen.getAllByLabelText('API Key')[1], { target: { value: 'siliconflow-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => expect(update_model_config).toHaveBeenCalled());
    expect(update_model_config).toHaveBeenCalledWith({
      llm_provider: 'deepseek',
      llm_base_url: 'https://api.deepseek.com',
      llm_model: 'deepseek-chat',
      llm_api_key: 'deepseek-key',
      clear_llm_api_key: false,
      embedding_provider: 'siliconflow',
      embedding_base_url: 'https://api.siliconflow.cn/v1',
      embedding_model: 'BAAI/bge-m3',
      embedding_api_key: 'siliconflow-key',
      clear_embedding_api_key: false,
    });
  });

  it('tests separate endpoint payloads', async () => {
    render(<ModelConfigPanel on_saved={vi.fn()} ready={ready} />);

    await waitFor(() => expect(fetch_model_config).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole('button')[2]);

    await waitFor(() => expect(test_model_config).toHaveBeenCalled());
    expect(test_model_config).toHaveBeenCalledWith({
      llm_provider: 'deepseek',
      llm_base_url: 'https://api.deepseek.com',
      llm_model: 'deepseek-chat',
      llm_api_key: null,
      use_saved_llm_api_key: true,
      embedding_provider: 'siliconflow',
      embedding_base_url: 'https://api.siliconflow.cn/v1',
      embedding_model: 'BAAI/bge-m3',
      embedding_api_key: null,
      use_saved_embedding_api_key: true,
    });
  });

  it('does not allow saved key tests while the same key is marked for clearing', async () => {
    render(<ModelConfigPanel on_saved={vi.fn()} ready={ready} />);

    await waitFor(() => expect(fetch_model_config).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole('checkbox')[0]);

    expect(screen.getAllByRole('checkbox')[1]).toBeDisabled();
    expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked();
    expect(screen.getAllByRole('button')[2]).toBeDisabled();
  });
});
