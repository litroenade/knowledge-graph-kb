import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  create_chat_session,
  fetch_chat_session,
  fetch_chat_sessions,
  search_entities,
  search_records,
  search_relations,
  search_sources,
  send_chat_message,
} from '../../../../shared/api/kb';
import type {
  ChatMessageItem,
  ChatSessionItem,
  EntitySearchItem,
  KBScope,
  RecordSearchItem,
  RelationSearchItem,
  SourceSearchItem,
} from '../../../../shared/types/kb';
import { format_date } from './formatters';

type SearchKind = 'records' | 'entities' | 'relations' | 'sources';
type SearchResult = RecordSearchItem | EntitySearchItem | RelationSearchItem | SourceSearchItem;

interface ChatPanelProps {
  scope: KBScope;
  on_focus_node: (node_id: string) => void;
}

export function ChatPanel(props: ChatPanelProps) {
  const [sessions, set_sessions] = useState<ChatSessionItem[]>([]);
  const [active_session_id, set_active_session_id] = useState<string | null>(null);
  const [messages, set_messages] = useState<ChatMessageItem[]>([]);
  const [draft, set_draft] = useState('');
  const [search_query, set_search_query] = useState('');
  const [search_kind, set_search_kind] = useState<SearchKind>('records');
  const [search_results, set_search_results] = useState<SearchResult[]>([]);
  const [busy, set_busy] = useState(false);
  const [message, set_message] = useState<string | null>(null);

  const load_sessions = useCallback(async () => {
    const next_sessions = await fetch_chat_sessions(50);
    set_sessions(next_sessions);
    if (!active_session_id && next_sessions[0]) {
      set_active_session_id(next_sessions[0].id);
    }
  }, [active_session_id]);

  useEffect(() => {
    void load_sessions().catch((error) => set_message((error as Error).message));
  }, [load_sessions]);

  useEffect(() => {
    if (!active_session_id) {
      set_messages([]);
      return;
    }
    let cancelled = false;
    void fetch_chat_session(active_session_id)
      .then((detail) => {
        if (!cancelled) {
          set_messages(detail.messages);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          set_message((error as Error).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active_session_id]);

  const active_session = useMemo(
    () => sessions.find((session) => session.id === active_session_id) ?? null,
    [active_session_id, sessions],
  );

  async function ensure_session(): Promise<string> {
    if (active_session_id) {
      return active_session_id;
    }
    const session = await create_chat_session('知识问答');
    set_sessions((current) => [session, ...current]);
    set_active_session_id(session.id);
    return session.id;
  }

  async function new_session(): Promise<void> {
    set_busy(true);
    set_message(null);
    try {
      const session = await create_chat_session('新会话');
      set_sessions((current) => [session, ...current]);
      set_active_session_id(session.id);
      set_messages([]);
    } catch (error) {
      set_message((error as Error).message);
    } finally {
      set_busy(false);
    }
  }

  async function submit_message(): Promise<void> {
    const content = draft.trim();
    if (!content) {
      return;
    }
    set_busy(true);
    set_message(null);
    try {
      const session_id = await ensure_session();
      set_draft('');
      const detail = await send_chat_message({ session_id, content, scope: props.scope, top_k: 8 });
      set_sessions((current) => [detail.session, ...current.filter((session) => session.id !== detail.session.id)]);
      set_active_session_id(detail.session.id);
      set_messages(detail.messages);
      const latest_message = detail.messages[detail.messages.length - 1];
      const highlight = latest_message?.highlighted_node_ids[0];
      if (highlight) {
        props.on_focus_node(highlight);
      }
    } catch (error) {
      set_message((error as Error).message);
    } finally {
      set_busy(false);
    }
  }

  async function submit_search(): Promise<void> {
    const query = search_query.trim();
    if (!query) {
      set_search_results([]);
      return;
    }
    set_busy(true);
    set_message(null);
    try {
      const results = await run_search(search_kind, query, props.scope);
      set_search_results(results);
    } catch (error) {
      set_message((error as Error).message);
    } finally {
      set_busy(false);
    }
  }

  return (
    <section className='panel-body chat-panel'>
      <div className='section-heading'>
        <span>问答 / 检索</span>
        <button disabled={busy} onClick={() => void new_session()} type='button'>新会话</button>
      </div>

      <div className='session-strip'>
        {sessions.slice(0, 8).map((session) => (
          <button
            className={session.id === active_session_id ? 'is-active' : ''}
            key={session.id}
            onClick={() => set_active_session_id(session.id)}
            type='button'
          >
            {session.title || '未命名会话'}
          </button>
        ))}
      </div>

      <div className='chat-thread'>
        {active_session ? <p className='muted'>当前会话：{active_session.title || active_session.id} · {format_date(active_session.updated_at)}</p> : null}
        {messages.map((item) => (
          <article className={`chat-message is-${item.role}`} key={item.id}>
            <strong>{item.role === 'user' ? '我' : 'A_Memorix'}</strong>
            <p>{item.content}</p>
            {item.error ? <p className='is-danger'>{item.error}</p> : null}
            {item.citations.length ? (
              <div className='citation-list'>
                {item.citations.slice(0, 3).map((citation) => (
                  <span key={`${item.id}-${citation.paragraph_id}`}>{citation.source_name} · {citation.score.toFixed(2)}</span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {!messages.length ? <p className='muted'>暂无消息。发送问题后会使用当前来源范围进行检索增强回答。</p> : null}
      </div>

      <label className='field'>
        <span>问题</span>
        <textarea onChange={(event) => set_draft(event.target.value)} rows={4} value={draft} />
      </label>
      <button disabled={busy} onClick={() => void submit_message()} type='button'>发送到当前范围</button>

      <div className='stacked-tool'>
        <strong>结构化检索</strong>
        <div className='form-grid'>
          <select onChange={(event) => set_search_kind(event.target.value as SearchKind)} value={search_kind}>
            <option value='records'>段落/表格记录</option>
            <option value='entities'>实体</option>
            <option value='relations'>关系</option>
            <option value='sources'>来源</option>
          </select>
          <button disabled={busy} onClick={() => void submit_search()} type='button'>检索</button>
        </div>
        <input onChange={(event) => set_search_query(event.target.value)} placeholder='输入检索词' value={search_query} />
        <div className='search-result-list'>
          {search_results.map((item, index) => (
            <SearchResultRow item={item} key={search_result_key(item, index)} on_focus_node={props.on_focus_node} />
          ))}
        </div>
      </div>

      {message ? <p className='inline-message'>{message}</p> : null}
    </section>
  );
}

async function run_search(kind: SearchKind, query: string, scope: KBScope): Promise<SearchResult[]> {
  if (kind === 'records') {
    return search_records(query, scope, 20);
  }
  if (kind === 'entities') {
    return search_entities(query, scope, 20);
  }
  if (kind === 'relations') {
    return search_relations(query, scope, 20);
  }
  return search_sources(query, scope, 20);
}

function search_result_key(item: SearchResult, index: number): string {
  if ('paragraph_id' in item) {
    return item.paragraph_id;
  }
  return `${item.id}-${index}`;
}

function SearchResultRow(props: { item: SearchResult; on_focus_node: (node_id: string) => void }) {
  const { item } = props;
  if ('paragraph_id' in item) {
    return (
      <article className='search-result-item'>
        <strong>{item.source_name} · {item.score.toFixed(2)}</strong>
        <p>{item.content}</p>
      </article>
    );
  }
  if ('display_name' in item) {
    return (
      <article className='search-result-item'>
        <button onClick={() => props.on_focus_node(item.id)} type='button'>{item.display_name}</button>
        <p>{item.description ?? `出现 ${item.appearance_count} 次`}</p>
      </article>
    );
  }
  if ('predicate' in item) {
    return (
      <article className='search-result-item'>
        <strong>{item.subject_name} - {item.predicate} - {item.object_name}</strong>
        <p>置信度 {item.confidence.toFixed(2)}</p>
      </article>
    );
  }
  return (
    <article className='search-result-item'>
      <strong>{item.name}</strong>
      <p>{item.summary ?? `${item.source_kind} · ${item.paragraph_count} 段`}</p>
    </article>
  );
}
