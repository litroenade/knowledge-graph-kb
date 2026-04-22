import { describe, expect, it } from 'vitest';

import { ApiError } from './http';
import { is_not_found_api_error, to_user_error_message } from './errorMessages';

describe('api error messages', () => {
  it('explains backend connectivity failures without leaking low-level fetch text', () => {
    expect(to_user_error_message(new TypeError('Failed to fetch'), 'graph')).toBe(
      '后端服务未连接，请确认知识库服务已启动并监听 7999。',
    );
  });

  it('explains invalid graph query responses', () => {
    expect(to_user_error_message(new ApiError('Evidence graph requires at least one anchor node or edge.', 400, 'invalid_graph_query'), 'graph')).toBe(
      '图谱请求参数无效：Evidence graph requires at least one anchor node or edge.',
    );
  });

  it('downgrades missing graph edges to a derived-edge explanation', () => {
    const error = new ApiError('Graph edge not found.', 404, 'graph_edge_not_found');

    expect(is_not_found_api_error(error, 'graph_edge_not_found')).toBe(true);
    expect(to_user_error_message(error, 'edge-detail')).toBe(
      '该关系可能是视图派生边或详情已不存在，仍可在图上查看连接。',
    );
  });
});
