import { ApiError } from './http';

export type ApiErrorContext =
  | 'chat'
  | 'edge-detail'
  | 'graph'
  | 'graph-editor'
  | 'graph-render'
  | 'import'
  | 'model-config'
  | 'node-detail'
  | 'source-detail';

export function is_not_found_api_error(error: unknown, code?: string): boolean {
  return error instanceof ApiError && error.status === 404 && (!code || error.code === code);
}

export function to_user_error_message(error: unknown, context: ApiErrorContext): string {
  if (context === 'graph-render') {
    return `图谱渲染初始化失败，请确认浏览器 WebGL 可用。${extract_error_message(error)}`;
  }

  if (is_backend_connection_error(error)) {
    return '后端服务未连接，请确认知识库服务已启动并监听 7999。';
  }

  if (error instanceof ApiError) {
    if (context === 'graph' && error.status === 400) {
      return `图谱请求参数无效：${error.message}`;
    }
    if (context === 'edge-detail' && is_not_found_api_error(error, 'graph_edge_not_found')) {
      return '该关系可能是视图派生边或详情已不存在，仍可在图上查看连接。';
    }
    if (context === 'source-detail' && error.status === 404) {
      return '来源不存在或当前版本不可用。';
    }
    if (context === 'source-detail' && error.status === 204) {
      return '该来源暂无段落或表格预览。';
    }
    if (context === 'model-config' && (error.status === 400 || error.status === 503)) {
      return `模型配置不可用：${error.message}`;
    }
    if (context === 'chat') {
      if (error.status === 400) {
        return `问答/检索请求无效：${error.message}`;
      }
      if (error.status === 404) {
        return '会话不存在或已被删除，请重新创建会话。';
      }
      if (error.status === 503) {
        return `问答/检索服务暂不可用：${error.message}`;
      }
      return `问答/检索请求失败：${error.message}`;
    }
    if (context === 'import') {
      if (error.status === 400) {
        return `导入参数无效：${error.message}`;
      }
      return `导入操作失败：${error.message}`;
    }
    if (context === 'graph-editor') {
      if (error.status === 404) {
        return '要编辑的节点或关系不存在，可能已被刷新或删除。';
      }
      if (error.status === 400) {
        return `图谱编辑请求无效：${error.message}`;
      }
      return `图谱编辑失败：${error.message}`;
    }
    if (error.status === 503) {
      return '知识库运行时尚未就绪，请稍后重试。';
    }
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return '请求失败。';
}

function extract_error_message(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return '未知渲染错误。';
}

function is_backend_connection_error(error: unknown): boolean {
  return error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message);
}
