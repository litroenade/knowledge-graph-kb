import { useEffect, useRef, useState } from 'react';

import type { ResolvedTheme } from '../../../../theme';
import type {
  GraphReadingLens,
  GraphViewMode,
  GraphViewportMode,
  GraphViewportRequest,
} from '../../shared/types/knowledge_base_types';
import type { HoverCardState } from './graph_canvas_tooltip';
import type { RenderEdge, RenderNode } from './graph_render_types';
import { GraphRuntime } from './graph_runtime';

interface PixiKnowledgeGraphCanvasProps {
  nodes: RenderNode[];
  edges: RenderEdge[];
  layout_revision: number;
  graph_view_mode: GraphViewMode;
  reading_lens: GraphReadingLens;
  viewport_mode: GraphViewportMode;
  viewport_request: GraphViewportRequest | null;
  selected_node_id: string | null;
  selected_edge_id: string | null;
  highlighted_node_ids: string[];
  highlighted_edge_ids: string[];
  resolved_theme: ResolvedTheme;
  on_select_node: (node_id: string) => void;
  on_select_edge: (edge_id: string) => void;
  on_clear_selection: () => void;
}

export function PixiKnowledgeGraphCanvas(props: PixiKnowledgeGraphCanvasProps) {
  const {
    nodes,
    edges,
    layout_revision,
    graph_view_mode,
    reading_lens,
    viewport_mode,
    viewport_request,
    selected_node_id,
    selected_edge_id,
    highlighted_node_ids,
    highlighted_edge_ids,
    resolved_theme,
    on_select_node,
    on_select_edge,
    on_clear_selection,
  } = props;

  const container_ref = useRef<HTMLDivElement | null>(null);
  const runtime_ref = useRef<GraphRuntime | null>(null);
  const resize_observer_ref = useRef<ResizeObserver | null>(null);
  const last_viewport_request_id_ref = useRef<number | null>(null);
  const has_applied_initial_view_ref = useRef(false);
  const [is_runtime_ready, set_is_runtime_ready] = useState(false);
  const [hover_card, set_hover_card] = useState<HoverCardState | null>(null);
  const [render_error, set_render_error] = useState<string | null>(null);

  useEffect(() => {
    const container = container_ref.current;
    if (!container || runtime_ref.current) {
      return;
    }
    let disposed = false;

    const runtime = new GraphRuntime({
      container,
      resolved_theme,
      on_select_node,
      on_select_edge,
      on_clear_selection,
      on_hover_change: set_hover_card,
    });
    runtime_ref.current = runtime;

    void runtime
      .init()
      .then(() => {
        if (disposed || runtime_ref.current !== runtime) {
          return;
        }
        set_render_error(null);
        set_is_runtime_ready(true);
      })
      .catch((current_error) => {
        if (disposed || runtime_ref.current !== runtime) {
          return;
        }
        set_render_error((current_error as Error).message || '图谱渲染失败。');
      });

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        runtime_ref.current?.resize(viewport_mode);
      });
      observer.observe(container);
      resize_observer_ref.current = observer;
    }

    return () => {
      disposed = true;
      resize_observer_ref.current?.disconnect();
      resize_observer_ref.current = null;
      runtime.destroy();
      if (runtime_ref.current === runtime) {
        runtime_ref.current = null;
      }
      has_applied_initial_view_ref.current = false;
      set_is_runtime_ready(false);
      set_hover_card(null);
    };
  }, []);

  useEffect(() => {
    runtime_ref.current?.set_theme(resolved_theme);
  }, [resolved_theme]);

  useEffect(() => {
    const runtime = runtime_ref.current;
    if (!runtime || !is_runtime_ready) {
      return;
    }
    runtime.set_scene(
      {
        graph_view_mode,
        reading_lens,
        nodes,
        edges,
        selected_node_id,
        selected_edge_id,
        highlighted_node_ids,
        highlighted_edge_ids,
      },
      layout_revision,
    );
    if (!has_applied_initial_view_ref.current && nodes.length) {
      runtime.restore_view(viewport_mode);
      has_applied_initial_view_ref.current = true;
    }
  }, [
    edges,
    graph_view_mode,
    is_runtime_ready,
    reading_lens,
    highlighted_edge_ids,
    highlighted_node_ids,
    layout_revision,
    nodes,
    selected_edge_id,
    selected_node_id,
    viewport_mode,
  ]);

  useEffect(() => {
    const runtime = runtime_ref.current;
    if (!runtime || !viewport_request) {
      return;
    }
    if (last_viewport_request_id_ref.current === viewport_request.id) {
      return;
    }
    last_viewport_request_id_ref.current = viewport_request.id;
    runtime.run_viewport_command(viewport_request.type);
  }, [viewport_request]);

  return (
    <div className='kb-graph-canvas'>
      <div className='kb-graph-surface' ref={container_ref} />
      {!nodes.length ? <div className='kb-graph-empty'>当前图谱还没有可展示的数据。</div> : null}
      {render_error ? <div className='kb-graph-empty kb-graph-empty-error'>{render_error}</div> : null}
      {hover_card ? (
        <div className='kb-graph-tooltip' style={{ left: `${hover_card.x}px`, top: `${hover_card.y}px` }}>
          <strong>{hover_card.title}</strong>
          <span>{hover_card.subtitle}</span>
          {hover_card.metadata_lines.length ? (
            <div className='kb-graph-tooltip-metadata'>
              {hover_card.metadata_lines.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
