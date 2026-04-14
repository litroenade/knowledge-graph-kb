import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChatMessageRecord,
  ChatSessionDetailRecord,
  ChatSessionRecord,
  KBScopeRecord,
} from '../../types/knowledge_base_types';
import { use_query_workspace_state } from './use_query_workspace_state';

const {
  create_chat_session_mock,
  get_chat_session_mock,
  list_chat_sessions_mock,
  post_chat_message_mock,
  search_entities_mock,
  search_records_mock,
  search_relations_mock,
  search_sources_mock,
} = vi.hoisted(() => ({
  create_chat_session_mock: vi.fn(),
  get_chat_session_mock: vi.fn(),
  list_chat_sessions_mock: vi.fn(),
  post_chat_message_mock: vi.fn(),
  search_entities_mock: vi.fn(),
  search_records_mock: vi.fn(),
  search_relations_mock: vi.fn(),
  search_sources_mock: vi.fn(),
}));

vi.mock('../../api/query_api', () => ({
  create_chat_session: create_chat_session_mock,
  get_chat_session: get_chat_session_mock,
  list_chat_sessions: list_chat_sessions_mock,
  post_chat_message: post_chat_message_mock,
  search_entities: search_entities_mock,
  search_records: search_records_mock,
  search_relations: search_relations_mock,
  search_sources: search_sources_mock,
}));

function create_deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next_resolve, next_reject) => {
    resolve = next_resolve;
    reject = next_reject;
  });
  return { promise, resolve, reject };
}

const DEFAULT_SCOPE: KBScopeRecord = {
  mode: 'all',
  source_ids: [],
  version_mode: 'latest',
  version_id: null,
  excluded_source_ids: [],
};

function create_session(id: string, title: string): ChatSessionRecord {
  return {
    id,
    title,
    metadata: { scope: DEFAULT_SCOPE },
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    last_message_at: '2026-04-01T00:00:00Z',
  };
}

function create_message(overrides: Partial<ChatMessageRecord>): ChatMessageRecord {
  return {
    id: overrides.id ?? 'message-1',
    session_id: overrides.session_id ?? 'session-a',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? 'default message',
    turn_index: overrides.turn_index ?? 1,
    citations: overrides.citations ?? [],
    scope: overrides.scope ?? DEFAULT_SCOPE,
    sources: overrides.sources ?? [],
    execution: overrides.execution ?? null,
    retrieval_trace: overrides.retrieval_trace ?? null,
    highlighted_node_ids: overrides.highlighted_node_ids ?? [],
    highlighted_edge_ids: overrides.highlighted_edge_ids ?? [],
    error: overrides.error ?? null,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-04-01T00:00:00Z',
  };
}

function create_detail(session: ChatSessionRecord, messages: ChatMessageRecord[]): ChatSessionDetailRecord {
  return { session, messages };
}

function build_props(
  overrides: Partial<Parameters<typeof use_query_workspace_state>[0]> = {},
): Parameters<typeof use_query_workspace_state>[0] {
  return {
    active_workspace: 'import',
    query_mode: 'answer',
    available_source_ids: ['source-1', 'source-2'],
    set_active_workspace: vi.fn(),
    set_last_query_text: vi.fn(),
    set_message: vi.fn(),
    set_error: vi.fn(),
    set_highlighted_node_ids: vi.fn(),
    set_highlighted_edge_ids: vi.fn(),
    ...overrides,
  };
}

function AnswerWorkspaceHarness(props: Parameters<typeof use_query_workspace_state>[0]) {
  const state = use_query_workspace_state(props);

  return (
    <div>
      <button onClick={() => void state.execute_query('Alpha 项目是谁负责的？')} type='button'>
        run answer
      </button>
      <button onClick={() => void state.select_answer_session('session-b')} type='button'>
        switch B
      </button>
      <div data-testid='active-session'>{state.active_answer_session_id ?? ''}</div>
      <div data-testid='latest-message'>{state.answer_messages[state.answer_messages.length - 1]?.content ?? ''}</div>
    </div>
  );
}

function QueryExecutionHarness(props: Parameters<typeof use_query_workspace_state>[0]) {
  const state = use_query_workspace_state(props);

  return (
    <button onClick={() => void state.execute_query('Beta')} type='button'>
      run search
    </button>
  );
}

describe('use_query_workspace_state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search_records_mock.mockResolvedValue([]);
    search_entities_mock.mockResolvedValue([]);
    search_relations_mock.mockResolvedValue([]);
    search_sources_mock.mockResolvedValue([]);
  });

  it('keeps the manually selected session when an older answer request resolves later', async () => {
    const session_a = create_session('session-a', 'Session A');
    const session_b = create_session('session-b', 'Session B');
    const detail_a = create_detail(session_a, []);
    const detail_b = create_detail(session_b, [
      create_message({
        id: 'message-b',
        session_id: session_b.id,
        content: 'latest message from session B',
        highlighted_node_ids: ['entity:b'],
      }),
    ]);
    const answer_deferred = create_deferred<ChatSessionDetailRecord>();

    list_chat_sessions_mock.mockResolvedValue([session_a, session_b]);
    create_chat_session_mock.mockResolvedValue(session_a);
    get_chat_session_mock.mockImplementation(async (session_id: string) => {
      if (session_id === 'session-b') {
        return detail_b;
      }
      return detail_a;
    });
    post_chat_message_mock.mockReturnValue(answer_deferred.promise);

    const props = build_props();

    render(<AnswerWorkspaceHarness {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'run answer' }));

    await waitFor(() => {
      expect(post_chat_message_mock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('active-session')).toHaveTextContent('session-a');
    });

    fireEvent.click(screen.getByRole('button', { name: 'switch B' }));

    await waitFor(() => {
      expect(screen.getByTestId('active-session')).toHaveTextContent('session-b');
    });
    await waitFor(() => {
      expect(screen.getByTestId('latest-message')).toHaveTextContent('latest message from session B');
    });
    expect(props.set_highlighted_node_ids).toHaveBeenLastCalledWith(['entity:b']);

    await act(async () => {
      answer_deferred.resolve(
        create_detail(session_a, [
          create_message({
            id: 'message-a',
            session_id: session_a.id,
            content: 'late answer from session A',
            highlighted_node_ids: ['entity:a'],
          }),
        ]),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-session')).toHaveTextContent('session-b');
    });
    expect(screen.getByTestId('latest-message')).toHaveTextContent('latest message from session B');
    expect(props.set_highlighted_node_ids).toHaveBeenLastCalledWith(['entity:b']);
  });

  it.each([
    {
      mode: 'entity' as const,
      search_mock: search_entities_mock,
      response: [{ id: 'entity-1', display_name: 'Beta', description: null, appearance_count: 1, metadata: {}, paragraph_ids: ['paragraph-1'] }],
      expected_message: '\u5b9e\u4f53\u68c0\u7d22\u5b8c\u6210\uff0c\u5171 1 \u6761\u7ed3\u679c\u3002',
    },
    {
      mode: 'relation' as const,
      search_mock: search_relations_mock,
      response: [{ id: 'relation-1', subject_id: 'entity-1', subject_name: 'Alpha', predicate: '关联', object_id: 'entity-2', object_name: 'Beta', confidence: 0.9, source_paragraph_id: 'paragraph-1', metadata: {} }],
      expected_message: '\u5173\u7cfb\u68c0\u7d22\u5b8c\u6210\uff0c\u5171 1 \u6761\u7ed3\u679c\u3002',
    },
    {
      mode: 'source' as const,
      search_mock: search_sources_mock,
      response: [{ id: 'source-1', name: '来源一.txt', source_kind: 'text', summary: null, metadata: {}, paragraph_count: 1 }],
      expected_message: '\u6765\u6e90\u68c0\u7d22\u5b8c\u6210\uff0c\u5171 1 \u6761\u7ed3\u679c\u3002',
    },
  ])('passes scope through $mode search requests and publishes a localized status', async ({ mode, search_mock, response, expected_message }) => {
    search_mock.mockResolvedValue(response);
    const props = build_props({ query_mode: mode });

    render(<QueryExecutionHarness {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'run search' }));

    await waitFor(() => {
      expect(search_mock).toHaveBeenCalledWith({
        query: 'Beta',
        scope: DEFAULT_SCOPE,
        limit: 20,
      });
    });
    await waitFor(() => {
      expect(props.set_message).toHaveBeenLastCalledWith(expected_message);
    });
  });
});
