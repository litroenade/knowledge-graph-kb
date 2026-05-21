import { beforeEach, describe, expect, it, vi } from 'vitest';

import { delete_graph_node } from '../src/shared/api/kb';
import { request_json } from '../src/shared/api/http';

vi.mock('../src/shared/api/http', () => ({
  request_json: vi.fn().mockResolvedValue({ status: 'deleted' }),
}));

describe('delete_graph_node', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes source delete confirmation through the graph node endpoint', async () => {
    await delete_graph_node('source:abc/def');

    expect(request_json).toHaveBeenCalledWith(
      '/api/kb/graph/nodes/source%3Aabc%2Fdef?confirm=true',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('does not add source confirmation to regular entity nodes', async () => {
    await delete_graph_node('entity:abc');

    expect(request_json).toHaveBeenCalledWith(
      '/api/kb/graph/nodes/entity%3Aabc',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
