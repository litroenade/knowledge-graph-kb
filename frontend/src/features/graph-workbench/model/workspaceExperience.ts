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

const BACKEND_PENDING_CHAT = [
  '新增 /api/kb/config/model/chat',
  '持久化 LLM、top-k、引用数量、检索策略',
  'ConversationService 读取问答专属配置',
];

const BACKEND_PENDING_IMPORT = [
  '新增 /api/kb/config/model/import',
  '持久化 embedding、解析模型、分块参数、索引策略',
  'ImportService 和 VectorRetriever 读取导入/索引专属配置',
];

export function get_model_config_presentation(mode: ModelConfigMode): ModelConfigPresentation {
  if (mode === 'chat') {
    return {
      mode,
      title: '问答模型配置',
      description: '控制问答生成和检索参数。当前后端仍复用全局模型配置，embedding 只展示当前索引签名，不在问答侧修改。',
      llm_label: '问答 LLM 模型',
      embedding_label: '当前索引 Embedding',
      embedding_editable: false,
      status_title: '问答运行状态',
      capability_title: '后端待拆分',
      capability_body: '后续需要把问答 LLM、top-k、引用数量和检索策略从全局模型配置中拆出。',
      backend_pending_items: BACKEND_PENDING_CHAT,
    };
  }

  if (mode === 'import') {
    return {
      mode,
      title: '导入模型配置',
      description: '控制导入解析、embedding 和索引流程。当前后端仍复用全局模型配置，保存 embedding 变更会触发索引重建提示。',
      llm_label: '解析 / 生成模型',
      embedding_label: 'Embedding / 索引模型',
      embedding_editable: true,
      status_title: '导入索引状态',
      capability_title: '后端待拆分',
      capability_body: '后续需要把导入策略、分块参数、embedding 和索引任务配置拆成独立持久化语义。',
      backend_pending_items: BACKEND_PENDING_IMPORT,
    };
  }

  return {
    mode,
    title: '模型配置',
    description: '当前后端全局模型配置。',
    llm_label: 'LLM 模型',
    embedding_label: 'Embedding 模型',
    embedding_editable: true,
    status_title: '当前状态',
    capability_title: '向量重建',
    capability_body: '当前后端仅有 CLI/服务层重建能力，尚未开放 HTTP 任务接口；这里先展示索引状态。',
    backend_pending_items: [],
  };
}
