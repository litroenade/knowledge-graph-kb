import { useEffect, useMemo, useRef, useState } from 'react';

import type { RuntimeProfile, Selection } from '../model/graphModel';
import type { Neighborhood, RenderEdge, RenderNode } from '../model/graphModel';
import { GraphRuntime, type HoverPayload } from '../runtime/graphRuntime';

interface GraphCanvasProps {
  nodes: RenderNode[];
  edges: RenderEdge[];
  selected: Selection;
  neighborhood: Neighborhood;
  profile: RuntimeProfile;
  show_labels: boolean;
  physics_running: boolean;
  link_distance: number;
  repulsion: number;
  viewport_command: { id: number; type: 'fit' | 'focus' | 'relayout' } | null;
  on_select_node: (node_id: string) => void;
  on_select_edge: (edge_id: string) => void;
  on_clear_selection: () => void;
}

export function GraphCanvas(props: GraphCanvasProps) {
  const {
    nodes,
    edges,
    selected,
    neighborhood,
    profile,
    show_labels,
    physics_running,
    link_distance,
    repulsion,
    viewport_command,
    on_select_node,
    on_select_edge,
    on_clear_selection,
  } = props;
  const container_ref = useRef<HTMLDivElement | null>(null);
  const runtime_ref = useRef<GraphRuntime | null>(null);
  const last_command_id = useRef<number | null>(null);
  const [hover, set_hover] = useState<HoverPayload | null>(null);
  const [error, set_error] = useState<string | null>(null);

  const callbacks = useMemo(
    () => ({
      on_select_node,
      on_select_edge,
      on_clear_selection,
      on_hover_change: set_hover,
    }),
    [on_clear_selection, on_select_edge, on_select_node],
  );

  useEffect(() => {
    const container = container_ref.current;
    if (!container || runtime_ref.current) {
      return;
    }
    let disposed = false;
    const runtime = new GraphRuntime(container, callbacks);
    runtime_ref.current = runtime;
    void runtime.init()
      .then(() => {
        if (!disposed) {
          runtime.fit_all();
          set_error(null);
        }
      })
      .catch((current_error) => {
        if (!disposed) {
          set_error((current_error as Error).message || '图谱渲染失败');
        }
      });

    const observer = new ResizeObserver(() => runtime.resize());
    observer.observe(container);

    return () => {
      disposed = true;
      observer.disconnect();
      runtime.destroy();
      runtime_ref.current = null;
    };
  }, []);

  useEffect(() => {
    runtime_ref.current?.set_scene({
      nodes,
      edges,
      selected,
      neighborhood,
      profile,
      show_labels,
      physics_running,
      link_distance,
      repulsion,
    });
  }, [edges, link_distance, neighborhood, nodes, physics_running, profile, repulsion, selected, show_labels]);

  useEffect(() => {
    const runtime = runtime_ref.current;
    if (!runtime || !viewport_command || last_command_id.current === viewport_command.id) {
      return;
    }
    last_command_id.current = viewport_command.id;
    if (viewport_command.type === 'fit') {
      runtime.fit_all();
    } else if (viewport_command.type === 'focus') {
      runtime.focus_selection();
    } else {
      runtime.relayout();
    }
  }, [viewport_command]);

  return (
    <div className='graph-canvas-shell'>
      <div className='graph-canvas-surface' ref={container_ref} />
      {hover ? (
        <div className='graph-tooltip' style={{ left: hover.x, top: hover.y }}>
          <strong>{hover.title}</strong>
          <span>{hover.detail}</span>
        </div>
      ) : null}
      {error ? <div className='graph-overlay-message is-error'>{error}</div> : null}
      {!nodes.length && !error ? <div className='graph-overlay-message'>当前范围没有可展示的节点</div> : null}
    </div>
  );
}
