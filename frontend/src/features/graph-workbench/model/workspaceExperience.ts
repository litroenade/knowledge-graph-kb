export type ModelConfigMode = 'shared' | 'chat' | 'import';

export interface ModelConfigPresentation {
  mode: ModelConfigMode;
  title: string;
  description: string;
  llm_label: string;
  embedding_label: string;
  embedding_editable: boolean;
  status_title: string;
  capability_title: string;
  capability_body: string;
  backend_pending_items: string[];
}

export function get_model_config_presentation(mode: ModelConfigMode): ModelConfigPresentation {
  if (mode === 'chat') {
    return {
      mode,
      title: '问答模型配置',
      description: '配置问答使用的 LLM，同时保留当前检索所依赖的 Embedding 端点。',
      llm_label: '问答 LLM 模型',
      embedding_label: '检索 Embedding 模型',
      embedding_editable: true,
      status_title: '问答运行状态',
      capability_title: '双端点配置',
      capability_body: 'LLM 与 Embedding 可以使用不同提供商、Base URL 和 API Key。',
      backend_pending_items: [],
    };
  }

  if (mode === 'import') {
    return {
      mode,
      title: '导入模型配置',
      description: '配置导入解析使用的 LLM 与写入索引使用的 Embedding。Embedding 变化会重置现有向量索引。',
      llm_label: '解析 / 生成模型',
      embedding_label: 'Embedding / 索引模型',
      embedding_editable: true,
      status_title: '导入索引状态',
      capability_title: '索引一致性',
      capability_body: '保存新的 Embedding provider、Base URL 或模型名后，需要重新导入内容以生成一致的向量。',
      backend_pending_items: [],
    };
  }

  return {
    mode,
    title: '模型配置',
    description: '全局模型配置已拆分为 LLM 与 Embedding 两套端点。',
    llm_label: 'LLM 模型',
    embedding_label: 'Embedding 模型',
    embedding_editable: true,
    status_title: '当前状态',
    capability_title: '配置说明',
    capability_body: '对话、抽取与向量生成会分别读取对应端点；切换 Embedding 会触发向量索引重建提示。',
    backend_pending_items: [],
  };
}
