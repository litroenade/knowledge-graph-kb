export type WorkspaceView = 'graph' | 'import' | 'chat';
export type GraphContextPanel = 'inspector' | 'edit' | 'source';

export const WORKSPACE_LABELS: Record<WorkspaceView, string> = {
  graph: '图谱',
  import: '导入中心',
  chat: '知识问答',
};

export const WORKSPACE_TOOLTIPS: Record<WorkspaceView, string> = {
  graph: '进入图谱工作区，浏览、筛选和整理知识网络。',
  import: '进入导入中心，粘贴文本、上传文件或扫描目录。',
  chat: '进入知识问答，基于当前知识库范围进行检索增强问答。',
};

export const WORKSPACE_ICON_CLASS: Record<WorkspaceView, string> = {
  graph: 'rail-symbol rail-symbol-graph',
  import: 'rail-symbol rail-symbol-import',
  chat: 'rail-symbol rail-symbol-chat',
};

export const GRAPH_CONTEXT_PANEL_LABELS: Record<GraphContextPanel, string> = {
  inspector: '检查',
  edit: '编辑',
  source: '来源',
};

export const GRAPH_CONTEXT_PANEL_TOOLTIPS: Record<GraphContextPanel, string> = {
  inspector: '查看当前选中节点或关系的详情与关联证据。',
  edit: '新增、重命名、删除节点，并维护手工关系。',
  source: '查看来源详情、段落列表和表格预览。',
};

export const GRAPH_CONTEXT_PANEL_ICON_CLASS: Record<GraphContextPanel, string> = {
  inspector: 'rail-symbol rail-symbol-inspector',
  edit: 'rail-symbol rail-symbol-edit',
  source: 'rail-symbol rail-symbol-source',
};

export function resolve_workspace_chrome(workspace: WorkspaceView) {
  const is_graph = workspace === 'graph';
  return {
    show_graph_context_panel: is_graph,
    show_graph_controls: is_graph,
  };
}
