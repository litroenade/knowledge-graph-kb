import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SCOPE,
  create_manual_relation,
  fetch_ready,
  fetch_sources,
  send_chat_message,
} from './kb';

describe('kb api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the backend system readiness route', async () => {
    const fetch_mock = mock_json({ status: 'ok', checks: [] });

    await fetch_ready();

    expect(fetch_mock).toHaveBeenCalledWith('/api/system/ready', expect.objectContaining({
      headers: expect.objectContaining({ Accept: 'application/json' }),
    }));
  });

  it('serializes source scope filters as repeated query params', async () => {
    const fetch_mock = mock_json([]);

    await fetch_sources({
      keyword: 'alpha',
      limit: 25,
      scope: {
        mode: 'subset',
        source_ids: ['s1', 's2'],
        version_mode: 'specific',
        version_id: 'v7',
        excluded_source_ids: ['x1'],
      },
    });

    const [url] = fetch_mock.mock.calls[0];
    const params = new URLSearchParams(String(url).split('?')[1]);
    expect(String(url).startsWith('/api/kb/sources?')).toBe(true);
    expect(params.get('keyword')).toBe('alpha');
    expect(params.get('limit')).toBe('25');
    expect(params.get('mode')).toBe('subset');
    expect(params.get('version_mode')).toBe('specific');
    expect(params.get('version_id')).toBe('v7');
    expect(params.getAll('source_ids')).toEqual(['s1', 's2']);
    expect(params.getAll('excluded_source_ids')).toEqual(['x1']);
  });

  it('creates manual relations with the documented payload', async () => {
    const fetch_mock = mock_json({
      id: 'm1',
      subject_node_id: 'a',
      predicate: 'depends_on',
      object_node_id: 'b',
      weight: 1.5,
      metadata: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    await create_manual_relation({
      subject_node_id: 'a',
      predicate: 'depends_on',
      object_node_id: 'b',
      weight: 1.5,
      metadata: { source: 'test' },
    });

    const [, init] = fetch_mock.mock.calls[0];
    expect(fetch_mock).toHaveBeenCalledWith('/api/kb/graph/manual-relations', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(init?.body))).toEqual({
      subject_node_id: 'a',
      predicate: 'depends_on',
      object_node_id: 'b',
      weight: 1.5,
      metadata: { source: 'test' },
    });
  });

  it('sends chat messages with the active knowledge-base scope', async () => {
    const fetch_mock = mock_json({ session: { id: 'c1', title: 'T', metadata: {}, created_at: '', updated_at: '', last_message_at: null }, messages: [] });

    await send_chat_message({
      session_id: 'c1',
      content: 'question',
      scope: { ...DEFAULT_SCOPE, mode: 'subset', source_ids: ['s1'] },
      top_k: 8,
    });

    const [, init] = fetch_mock.mock.calls[0];
    expect(fetch_mock).toHaveBeenCalledWith('/api/kb/chat/sessions/c1/messages', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(init?.body))).toEqual({
      content: 'question',
      scope: { ...DEFAULT_SCOPE, mode: 'subset', source_ids: ['s1'] },
      top_k: 8,
    });
  });
});

function mock_json(payload: unknown) {
  const fetch_mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetch_mock);
  return fetch_mock;
}
