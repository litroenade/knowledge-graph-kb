import { ApiError } from './http';

export type ApiErrorContext =
  | 'chat'
  | 'edge-detail'
  | 'graph'
  | 'import'
  | 'model-config'
  | 'node-detail'
  | 'source-detail';

export function is_not_found_api_error(error: unknown, code?: string): boolean {
  return error instanceof ApiError && error.status === 404 && (!code || error.code === code);
}

export function to_user_error_message(error: unknown, context: ApiErrorContext): string {
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

function is_backend_connection_error(error: unknown): boolean {
  return error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message);
}
