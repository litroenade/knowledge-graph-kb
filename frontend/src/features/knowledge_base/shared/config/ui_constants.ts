import type {
  GraphViewMode,
  GraphViewportMode,
  ModelProvider,
  QueryMode,
  WorkspaceTab,
} from '../types/knowledge_base_types';

export const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string; description: string }> = [
  {
    id: 'chat',
    label: '知识问答',
    description: '查看回答、来源和检索诊断。',
  },
  {
    id: 'import',
    label: '导入中心',
    description: '提交导入任务并跟踪处理进度。',
  },
  {
    id: 'graph',
    label: '知识图谱',
    description: '阅读语义主图，并从属性面板下钻证据。',
  },
];

export const WORKSPACE_LABELS: Record<WorkspaceTab, string> = {
  chat: '知识问答',
  import: '导入中心',
  graph: '知识图谱',
};

export const QUERY_MODE_OPTIONS: Array<{ id: QueryMode; label: string; description: string }> = [
  { id: 'answer', label: '问答', description: '基于知识库生成回答。' },
  { id: 'record', label: '记录', description: '搜索表格记录和结构化条目。' },
  { id: 'entity', label: '实体', description: '搜索知识图谱中的实体节点。' },
  { id: 'relation', label: '关系', description: '搜索实体之间的语义关系。' },
  { id: 'source', label: '来源', description: '搜索来源文件和来源摘要。' },
];

export const QUERY_MODE_LABELS: Record<QueryMode, string> = {
  answer: '问答',
  record: '记录搜索',
  entity: '实体搜索',
  relation: '关系搜索',
  source: '来源搜索',
};

export const GRAPH_VIEW_MODE_LABELS: Record<GraphViewMode, string> = {
  global: '全局图',
  local: '局部图',
};

export const GRAPH_VIEWPORT_MODE_LABELS: Record<GraphViewportMode, string> = {
  'fit-all': '适配全图',
  'focus-selection': '聚焦选中',
};

export const NODE_TYPE_LABELS: Record<string, string> = {
  entity: '实体',
  source: '来源',
  workbook: '工作簿',
  paragraph: '段落',
  worksheet: '工作表',
  record: '记录',
};

export const PREDICATE_SUGGESTIONS = ['提及', '属于', '位于', '依赖', '影响', '支持', '关联', '包含'];

export const MODEL_PROVIDER_OPTIONS: Array<{
  id: ModelProvider;
  label: string;
  description: string;
  base_url: string;
}> = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: '直接连接 OpenAI 官方接口。',
    base_url: 'https://api.openai.com/v1',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: '通过 OpenRouter 访问多模型路由。',
    base_url: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    description: '通过 SiliconFlow 调用兼容接口。',
    base_url: 'https://api.siliconflow.cn/v1',
  },
  {
    id: 'custom',
    label: '自定义',
    description: '使用自定义的 OpenAI 兼容接口地址。',
    base_url: '',
  },
];

export const MODEL_PROVIDER_BASE_URLS: Record<ModelProvider, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  custom: '',
};

export const TASK_STATUS_ORDER: Record<string, number> = {
  running: 0,
  cancelling: 1,
  queued: 2,
  ready: 3,
  completed: 3,
  partial: 4,
  failed: 5,
};

const IMPORT_MODE_LABELS: Record<string, string> = {
  upload: '上传文件',
  paste: '粘贴文本',
  scan: '扫描目录',
  openie: 'OpenIE 导入',
  convert: '转换导入',
  text: '文本',
  file: '文件',
};

const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '处理中',
  cancelling: '取消中',
  ready: '已完成',
  completed: '已完成',
  partial: '部分完成',
  failed: '失败',
  idle: '未开始',
};

const STRATEGY_LABELS: Record<string, string> = {
  auto: '自动策略',
  factual: '事实抽取',
  narrative: '叙事抽取',
  quote: '引用抽取',
  summary: '自动策略',
  semantic: '自动策略',
  hybrid: '自动策略',
};

const VECTOR_STATE_LABELS: Record<string, string> = {
  pending: '待向量化',
  ready: '已向量化',
  failed: '向量化失败',
  missing: '缺少向量',
};

const API_KEY_SOURCE_LABELS: Record<string, string> = {
  none: '未配置',
  saved: '已保存配置',
  request: '当前表单',
  environment: '环境变量（旧配置）',
  env: '环境变量（旧配置）',
  config: '配置文件（旧配置）',
};

function label_from_map(value: string, mapping: Record<string, string>, fallback: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return mapping[normalized] ?? value;
}

export function get_input_mode_label(value: string): string {
  return label_from_map(value, IMPORT_MODE_LABELS, '未知输入');
}

export function get_status_label(value: string): string {
  return label_from_map(value, STATUS_LABELS, '未知状态');
}

export function get_strategy_label(value: string): string {
  return label_from_map(value, STRATEGY_LABELS, '默认策略');
}

export function get_vector_state_label(value: string): string {
  return label_from_map(value, VECTOR_STATE_LABELS, '未知状态');
}

export function get_api_key_source_label(value: string): string {
  return label_from_map(value, API_KEY_SOURCE_LABELS, '未知来源');
}
