/**
 * Query execution and query-result state.
 */

import { startTransition, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { QUERY_MODE_LABELS } from '../../config/ui_constants';
import {
  create_chat_session,
  get_chat_session,
  list_chat_sessions,
  post_chat_message,
  search_entities,
  search_records,
  search_relations,
  search_sources,
} from '../../api/query_api';
import type {
  AnswerExecutionRecord,
  ChatMessageRecord,
  ChatSessionDetailRecord,
  ChatSessionRecord,
  EntitySearchItemRecord,
  KBScopeMode,
  KBScopeRecord,
  QueryMode,
  RecordSearchItemRecord,
  RelationSearchItemRecord,
  SourceSearchItemRecord,
  WorkspaceTab,
} from '../../types/knowledge_base_types';

interface QueryWorkspaceStateProps {
  active_workspace: WorkspaceTab;
  query_mode: QueryMode;
  available_source_ids: string[];
  set_active_workspace: Dispatch<SetStateAction<WorkspaceTab>>;
  set_last_query_text: Dispatch<SetStateAction<string>>;
  set_message: Dispatch<SetStateAction<string>>;
  set_error: Dispatch<SetStateAction<string | null>>;
  set_highlighted_node_ids: Dispatch<SetStateAction<string[]>>;
  set_highlighted_edge_ids: Dispatch<SetStateAction<string[]>>;
}

const DEFAULT_SESSION_TITLE = '\u65b0\u5bf9\u8bdd';

function resolve_answer_execution(message: ChatMessageRecord | null): AnswerExecutionRecord {
  if (message?.execution) {
    return message.execution;
  }
  return {
    status: 'idle',
    retrieval_mode: 'none',
    model_invoked: false,
    matched_paragraph_count: 0,
    message: '\u7b49\u5f85\u4e0b\u4e00\u4e2a\u95ee\u9898\u3002',
  };
}

function build_answer_message(message: ChatMessageRecord): string {
  const execution = resolve_answer_execution(message);
  if (execution.model_invoked) {
    return `\u56de\u7b54\u5b8c\u6210\uff0c\u5df2\u4f7f\u7528 ${execution.matched_paragraph_count} \u6761\u8bc1\u636e\u3002`;
  }
  return execution.message;
}

function latest_assistant_message(messages: ChatMessageRecord[]): ChatMessageRecord | null {
  const assistant_messages = messages.filter((message) => message.role === 'assistant');
  return assistant_messages.length ? assistant_messages[assistant_messages.length - 1] : null;
}

function normalize_scope(
  mode: KBScopeMode,
  source_ids: string[],
  excluded_source_ids: string[],
  available_source_ids: string[],
  version_id: string | null = null,
): KBScopeRecord {
  const available_set = new Set(available_source_ids);
  const next_source_ids = source_ids.filter((source_id) => available_set.has(source_id));
  const next_excluded_source_ids = excluded_source_ids.filter((source_id) => available_set.has(source_id));
  const normalized_mode = mode === 'single' && next_source_ids.length !== 1
    ? (next_source_ids.length ? 'single' : 'all')
    : mode;
  const normalized_version_id =
    normalized_mode === 'single' && next_source_ids.length === 1 ? version_id ?? null : null;
  return {
    mode: normalized_mode,
    source_ids: normalized_mode === 'all' ? [] : next_source_ids,
    version_mode: normalized_version_id ? 'specific' : 'latest',
    version_id: normalized_version_id,
    excluded_source_ids:
      normalized_mode === 'all'
        ? next_excluded_source_ids
        : next_excluded_source_ids.filter((source_id) => !next_source_ids.includes(source_id)),
  };
}

function scope_from_metadata(
  metadata: Record<string, unknown> | null | undefined,
  fallback: KBScopeRecord,
  available_source_ids: string[],
): KBScopeRecord {
  const raw_scope = metadata?.scope;
  if (!raw_scope || typeof raw_scope !== 'object') {
    return fallback;
  }
  const scope_record = raw_scope as Partial<KBScopeRecord>;
  return normalize_scope(
    (scope_record.mode as KBScopeMode) ?? fallback.mode,
    Array.isArray(scope_record.source_ids) ? scope_record.source_ids : fallback.source_ids,
    Array.isArray(scope_record.excluded_source_ids) ? scope_record.excluded_source_ids : fallback.excluded_source_ids,
    available_source_ids,
    scope_record.version_mode === 'specific' ? scope_record.version_id ?? null : null,
  );
}

export function use_query_workspace_state(props: QueryWorkspaceStateProps) {
  const {
    active_workspace,
    query_mode,
    available_source_ids,
    set_active_workspace,
    set_last_query_text,
    set_message,
    set_error,
    set_highlighted_node_ids,
    set_highlighted_edge_ids,
  } = props;

  const [scope_mode, set_scope_mode_state] = useState<KBScopeMode>('all');
  const [scope_source_ids, set_scope_source_ids] = useState<string[]>([]);
  const [scope_version_id, set_scope_version_id] = useState<string | null>(null);
  const [excluded_source_ids, set_excluded_source_ids] = useState<string[]>([]);
  const [answer_sessions, set_answer_sessions] = useState<ChatSessionRecord[]>([]);
  const [active_answer_session_id, set_active_answer_session_id] = useState<string | null>(null);
  const [answer_messages, set_answer_messages] = useState<ChatMessageRecord[]>([]);
  const [record_results, set_record_results] = useState<RecordSearchItemRecord[]>([]);
  const [entity_results, set_entity_results] = useState<EntitySearchItemRecord[]>([]);
  const [relation_results, set_relation_results] = useState<RelationSearchItemRecord[]>([]);
  const [source_results, set_source_results] = useState<SourceSearchItemRecord[]>([]);
  const [is_querying, set_is_querying] = useState<boolean>(false);
  const [has_hydrated_answer_sessions, set_has_hydrated_answer_sessions] = useState<boolean>(false);
  const [is_loading_answer_sessions, set_is_loading_answer_sessions] = useState<boolean>(false);
  const hydrate_answer_sessions_ref = useRef<Promise<void> | null>(null);
  const active_answer_session_id_ref = useRef<string | null>(null);
  const session_detail_request_id_ref = useRef(0);
  const answer_request_id_ref = useRef(0);
  const active_answer_message: ChatMessageRecord | null = latest_assistant_message(answer_messages);

  function build_scope(): KBScopeRecord {
    return normalize_scope(
      scope_mode,
      scope_source_ids,
      excluded_source_ids,
      available_source_ids,
      scope_version_id,
    );
  }

  function set_active_answer_session(next_session_id: string | null): void {
    active_answer_session_id_ref.current = next_session_id;
    startTransition(() => {
      set_active_answer_session_id(next_session_id);
    });
  }

  function set_scope_mode(next_mode: KBScopeMode): void {
    startTransition(() => {
      set_scope_mode_state(next_mode);
      if (next_mode === 'all') {
        set_scope_source_ids([]);
        set_scope_version_id(null);
        return;
      }
      if (next_mode === 'single') {
        set_scope_source_ids((current) =>
          current.length ? [current[0]] : (available_source_ids[0] ? [available_source_ids[0]] : []),
        );
        return;
      }
      set_scope_version_id(null);
    });
  }

  function apply_scope(next_scope: KBScopeRecord): void {
    startTransition(() => {
      set_scope_mode_state(next_scope.mode);
      set_scope_source_ids(next_scope.source_ids);
      set_scope_version_id(next_scope.version_mode === 'specific' ? next_scope.version_id ?? null : null);
      set_excluded_source_ids(next_scope.excluded_source_ids);
    });
  }

  function toggle_scope_source_id(source_id: string): void {
    startTransition(() => {
      if (scope_mode === 'single') {
        set_scope_source_ids([source_id]);
        set_scope_version_id(null);
        set_excluded_source_ids((current) => current.filter((item) => item !== source_id));
        return;
      }
      set_scope_source_ids((current) =>
        current.includes(source_id)
          ? current.filter((item) => item !== source_id)
          : [...current, source_id],
      );
      set_scope_version_id(null);
      set_excluded_source_ids((current) => current.filter((item) => item !== source_id));
    });
  }

  function toggle_source_exclusion(source_id: string): void {
    startTransition(() => {
      set_excluded_source_ids((current) =>
        current.includes(source_id)
          ? current.filter((item) => item !== source_id)
          : [...current, source_id],
      );
    });
  }

  function clear_source_exclusions(): void {
    startTransition(() => {
      set_excluded_source_ids([]);
    });
  }

  useEffect(() => {
    const next_scope = normalize_scope(
      scope_mode,
      scope_source_ids,
      excluded_source_ids,
      available_source_ids,
      scope_version_id,
    );
    if (
      next_scope.mode !== scope_mode ||
      next_scope.source_ids.join('|') !== scope_source_ids.join('|') ||
      next_scope.excluded_source_ids.join('|') !== excluded_source_ids.join('|') ||
      (next_scope.version_id ?? '') !== (scope_version_id ?? '')
    ) {
      apply_scope(next_scope);
    }
  }, [available_source_ids, excluded_source_ids, scope_mode, scope_source_ids, scope_version_id]);

  async function apply_session_detail(detail: ChatSessionDetailRecord): Promise<void> {
    const latest_answer_message = latest_assistant_message(detail.messages);
    const next_scope = scope_from_metadata(detail.session.metadata, build_scope(), available_source_ids);
    set_active_answer_session(detail.session.id);
    startTransition(() => {
      set_answer_messages(detail.messages);
      set_highlighted_node_ids(latest_answer_message?.highlighted_node_ids ?? []);
      set_highlighted_edge_ids(latest_answer_message?.highlighted_edge_ids ?? []);
    });
    apply_scope(next_scope);
  }

  async function hydrate_answer_sessions(preferred_session_id?: string | null): Promise<void> {
    if (hydrate_answer_sessions_ref.current && !preferred_session_id) {
      await hydrate_answer_sessions_ref.current;
      return;
    }
    if (has_hydrated_answer_sessions && !preferred_session_id) {
      return;
    }

    const hydrate_promise = (async () => {
      set_is_loading_answer_sessions(true);
      const sessions = await list_chat_sessions();
      startTransition(() => {
        set_answer_sessions(sessions);
      });
      const next_session_id =
        preferred_session_id ?? active_answer_session_id_ref.current ?? sessions[0]?.id ?? null;
      if (!next_session_id) {
        set_active_answer_session(null);
        startTransition(() => {
          set_answer_messages([]);
          set_highlighted_node_ids([]);
          set_highlighted_edge_ids([]);
        });
        set_has_hydrated_answer_sessions(true);
        return;
      }
      set_active_answer_session(next_session_id);
      const detail_request_id = session_detail_request_id_ref.current + 1;
      session_detail_request_id_ref.current = detail_request_id;
      const detail = await get_chat_session(next_session_id);
      if (
        session_detail_request_id_ref.current === detail_request_id &&
        active_answer_session_id_ref.current === next_session_id
      ) {
        await apply_session_detail(detail);
      }
      set_has_hydrated_answer_sessions(true);
    })();

    hydrate_answer_sessions_ref.current = hydrate_promise;
    try {
      await hydrate_promise;
    } finally {
      hydrate_answer_sessions_ref.current = null;
      set_is_loading_answer_sessions(false);
    }
  }

  async function ensure_answer_sessions_ready(): Promise<void> {
    await hydrate_answer_sessions();
  }

  async function ensure_active_session(): Promise<string> {
    if (active_answer_session_id_ref.current) {
      return active_answer_session_id_ref.current;
    }
    const created = await create_chat_session({
      title: DEFAULT_SESSION_TITLE,
      metadata: { scope: build_scope() },
    });
    set_active_answer_session(created.id);
    startTransition(() => {
      set_answer_sessions((current_sessions) => [created, ...current_sessions.filter((item) => item.id !== created.id)]);
    });
    return created.id;
  }

  async function select_answer_session(session_id: string): Promise<void> {
    const previous_session_id = active_answer_session_id_ref.current;
    set_active_answer_session(session_id);
    const detail_request_id = session_detail_request_id_ref.current + 1;
    session_detail_request_id_ref.current = detail_request_id;
    try {
      const detail = await get_chat_session(session_id);
      if (
        session_detail_request_id_ref.current !== detail_request_id ||
        active_answer_session_id_ref.current !== session_id
      ) {
        return;
      }
      await apply_session_detail(detail);
      set_error(null);
    } catch (session_error) {
      if (active_answer_session_id_ref.current === session_id) {
        set_active_answer_session(previous_session_id);
      }
      set_error((session_error as Error).message);
    }
  }

  async function create_answer_session(): Promise<void> {
    try {
      const session = await create_chat_session({
        title: DEFAULT_SESSION_TITLE,
        metadata: { scope: build_scope() },
      });
      set_active_answer_session(session.id);
      startTransition(() => {
        set_answer_sessions((current_sessions) => [session, ...current_sessions.filter((item) => item.id !== session.id)]);
        set_answer_messages([]);
        set_highlighted_node_ids([]);
        set_highlighted_edge_ids([]);
      });
      set_has_hydrated_answer_sessions(true);
      set_message(`\u5df2\u521b\u5efa\u4f1a\u8bdd\uff1a${session.title}`);
      set_error(null);
    } catch (session_error) {
      set_error((session_error as Error).message);
    }
  }

  useEffect(() => {
    if (active_workspace !== 'chat' || query_mode !== 'answer' || has_hydrated_answer_sessions) {
      return;
    }
    void hydrate_answer_sessions().catch((session_error) => {
      set_error((session_error as Error).message);
    });
  }, [active_workspace, query_mode, has_hydrated_answer_sessions, set_error]);

  async function execute_query(query_text: string): Promise<void> {
    const normalized_query = query_text.trim();
    if (!normalized_query) {
      return;
    }

    let answer_session_id: string | null = null;
    const scope = build_scope();

    set_is_querying(true);
    set_last_query_text(normalized_query);
    set_active_workspace('chat');
    set_error(null);
    set_message(`\u6b63\u5728\u6267\u884c${QUERY_MODE_LABELS[query_mode]}...`);

    try {
      if (query_mode === 'answer') {
        set_record_results([]);
        set_entity_results([]);
        set_relation_results([]);
        set_source_results([]);

        await ensure_answer_sessions_ready();
        const session_id = await ensure_active_session();
        answer_session_id = session_id;
        const answer_request_id = answer_request_id_ref.current + 1;
        answer_request_id_ref.current = answer_request_id;
        const detail = await post_chat_message(session_id, {
          content: normalized_query,
          scope,
          top_k: 6,
        });
        startTransition(() => {
          set_answer_sessions((current_sessions) => {
            const next_session = detail.session;
            return [next_session, ...current_sessions.filter((item) => item.id !== next_session.id)];
          });
        });
        if (
          answer_request_id_ref.current !== answer_request_id ||
          active_answer_session_id_ref.current !== session_id
        ) {
          return;
        }
        await apply_session_detail(detail);
        const latest_answer_message = latest_assistant_message(detail.messages);
        if (latest_answer_message) {
          set_message(build_answer_message(latest_answer_message));
        }
        set_error(null);
        return;
      }

      if (query_mode === 'record') {
        set_entity_results([]);
        set_relation_results([]);
        set_source_results([]);
        const items = await search_records({
          query: normalized_query,
          scope,
          limit: 20,
        });
        startTransition(() => {
          set_record_results(items);
          set_message(`\u8bb0\u5f55\u68c0\u7d22\u5b8c\u6210\uff0c\u5171 ${items.length} \u6761\u7ed3\u679c\u3002`);
          set_error(null);
        });
        return;
      }

      set_record_results([]);

      if (query_mode === 'entity') {
        set_relation_results([]);
        set_source_results([]);
        const items = await search_entities({ query: normalized_query, scope, limit: 20 });
        startTransition(() => {
          set_entity_results(items);
          set_message(`\u5b9e\u4f53\u68c0\u7d22\u5b8c\u6210\uff0c\u5171 ${items.length} \u6761\u7ed3\u679c\u3002`);
          set_error(null);
        });
        return;
      }

      set_entity_results([]);

      if (query_mode === 'relation') {
        set_source_results([]);
        const items = await search_relations({ query: normalized_query, scope, limit: 20 });
        startTransition(() => {
          set_relation_results(items);
          set_message(`\u5173\u7cfb\u68c0\u7d22\u5b8c\u6210\uff0c\u5171 ${items.length} \u6761\u7ed3\u679c\u3002`);
          set_error(null);
        });
        return;
      }

      set_relation_results([]);
      const items = await search_sources({ query: normalized_query, scope, limit: 20 });
      startTransition(() => {
        set_source_results(items);
        set_message(`\u6765\u6e90\u68c0\u7d22\u5b8c\u6210\uff0c\u5171 ${items.length} \u6761\u7ed3\u679c\u3002`);
        set_error(null);
      });
    } catch (query_error) {
      if (query_mode === 'answer' && answer_session_id) {
        try {
          const detail_request_id = session_detail_request_id_ref.current + 1;
          session_detail_request_id_ref.current = detail_request_id;
          const detail = await get_chat_session(answer_session_id);
          if (
            session_detail_request_id_ref.current === detail_request_id &&
            active_answer_session_id_ref.current === answer_session_id
          ) {
            await apply_session_detail(detail);
          }
        } catch {
          // Ignore refresh failures and surface the original request error.
        }
      }
      set_error((query_error as Error).message);
    } finally {
      set_is_querying(false);
    }
  }

  return {
    scope_mode,
    set_scope_mode,
    scope_source_ids,
    set_scope_source_ids,
    scope_version_id,
    set_scope_version_id,
    excluded_source_ids,
    toggle_scope_source_id,
    toggle_source_exclusion,
    clear_source_exclusions,
    current_scope: build_scope(),
    answer_sessions,
    active_answer_session_id,
    answer_messages,
    active_answer_message,
    record_results,
    entity_results,
    relation_results,
    source_results,
    is_querying,
    is_loading_answer_sessions,
    execute_query,
    select_answer_session,
    create_answer_session,
  };
}
