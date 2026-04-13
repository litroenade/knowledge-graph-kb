import { useMemo, useState } from 'react';

import type {
  AnswerExecutionRecord,
  RetrievalTraceLaneRecord,
  RetrievalTraceRecord,
} from '../../shared/types/knowledge_base_types';

interface ChatDiagnosticsSectionProps {
  execution: AnswerExecutionRecord | null;
  retrieval_trace: RetrievalTraceRecord | null;
}

const TRACE_LABELS: Record<keyof Omit<RetrievalTraceRecord, 'total_ms'>, string> = {
  structured: 'Structured',
  vector: 'Vector',
  fusion: 'Fusion',
  ppr: 'Graph rerank',
};

function lane_status(lane: RetrievalTraceLaneRecord): string {
  if (lane.executed) {
    return 'Executed';
  }
  if (!lane.skipped_reason) {
    return 'Skipped';
  }
  return `Skipped: ${lane.skipped_reason}`;
}

function lane_summary(lane: RetrievalTraceLaneRecord): string {
  const paragraph_text = lane.top_paragraph_ids.length
    ? `Top ids: ${lane.top_paragraph_ids.join(', ')}`
    : 'No paragraph hits';
  return `${lane.hit_count} hit(s), ${lane.latency_ms} ms. ${paragraph_text}`;
}

export function ChatDiagnosticsSection(props: ChatDiagnosticsSectionProps) {
  const { execution, retrieval_trace } = props;
  const [open, set_open] = useState(false);

  const trace_rows = useMemo(
    () =>
      retrieval_trace
        ? (Object.entries(TRACE_LABELS).map(([key, label]) => ({
            key,
            label,
            lane: retrieval_trace[key as keyof typeof TRACE_LABELS],
          })) as Array<{ key: string; label: string; lane: RetrievalTraceLaneRecord }>)
        : [],
    [retrieval_trace],
  );

  if (!execution && !retrieval_trace) {
    return null;
  }

  return (
    <section className='kb-chat-diagnostics'>
      <button className='kb-chat-sources-toggle' onClick={() => set_open((current) => !current)} type='button'>
        <strong>{open ? 'Hide diagnostics' : 'Show diagnostics'}</strong>
        <span>Trace</span>
      </button>

      {open ? (
        <div className='kb-chat-diagnostics-body'>
          {execution ? (
            <article className='kb-chat-diagnostics-trace-row'>
              <strong>Execution</strong>
              <span>{`Status: ${execution.status}`}</span>
              <span>{`Matches: ${execution.matched_paragraph_count}`}</span>
              <span>{execution.model_invoked ? 'Model invoked' : 'No model call'}</span>
              <span>{execution.message}</span>
            </article>
          ) : null}

          {trace_rows.length ? (
            <section className='kb-chat-diagnostics-trace'>
              <strong>Retrieval lanes</strong>
              {trace_rows.map(({ key, label, lane }) => (
                <article className='kb-chat-diagnostics-trace-row' key={key}>
                  <strong>{label}</strong>
                  <span>{lane_status(lane)}</span>
                  <span>{lane_summary(lane)}</span>
                </article>
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
