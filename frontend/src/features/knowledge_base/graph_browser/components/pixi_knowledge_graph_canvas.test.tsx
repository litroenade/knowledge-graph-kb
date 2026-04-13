import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockGraphRuntime, runtime_instances } = vi.hoisted(() => {
  interface DeferredRecord<T> {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  }

  function create_deferred<T>(): DeferredRecord<T> {
    let resolve!: DeferredRecord<T>['resolve'];
    let reject!: DeferredRecord<T>['reject'];
    const promise = new Promise<T>((next_resolve, next_reject) => {
      resolve = next_resolve;
      reject = next_reject;
    });
    return { promise, resolve, reject };
  }

  const runtime_instances: MockGraphRuntime[] = [];

  class MockGraphRuntime {
    private init_deferred = create_deferred<void>();
    destroy = vi.fn();
    resize = vi.fn();
    set_theme = vi.fn();
    set_scene = vi.fn();
    restore_view = vi.fn();
    run_viewport_command = vi.fn();

    constructor(_: unknown) {
      runtime_instances.push(this);
    }

    init(): Promise<void> {
      return this.init_deferred.promise;
    }

    resolve_init(): void {
      this.init_deferred.resolve();
    }
  }

  return { MockGraphRuntime, runtime_instances };
});

vi.mock('./graph_runtime', () => ({
  GraphRuntime: MockGraphRuntime,
}));

import { PixiKnowledgeGraphCanvas } from './pixi_knowledge_graph_canvas';

describe('PixiKnowledgeGraphCanvas', () => {
  beforeEach(() => {
    runtime_instances.length = 0;
    vi.clearAllMocks();
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver;
  });

  it('ignores stale runtime init completions after a remount', async () => {
    const props = {
      nodes: [
        {
          id: 'entity:e1',
          type: 'entity',
          label: '支形',
          display_label: '支形',
          short_label: '支形',
          kind_label: '实体',
          source_name: '孙子兵法.txt',
          evidence_count: 1,
          layer_mode: 'semantic' as const,
          is_structural: false,
          radius: 12,
          color: 0x3b82f6,
          searchable_text: '支形 实体',
          size: 10,
          score: 1,
          family: 'semantic' as const,
          metadata: {},
        },
      ],
      edges: [],
      layout_revision: 1,
      graph_view_mode: 'global' as const,
      reading_lens: {
        mode: 'overview' as const,
        anchor_node_ids: [],
        anchor_edge_ids: [],
        context_node_ids: [],
        context_edge_ids: [],
      },
      viewport_mode: 'fit-all' as const,
      viewport_request: null,
      selected_node_id: null,
      selected_edge_id: null,
      highlighted_node_ids: [],
      highlighted_edge_ids: [],
      resolved_theme: 'dark' as const,
      on_select_node: vi.fn(),
      on_select_edge: vi.fn(),
      on_clear_selection: vi.fn(),
    };

    const { rerender } = render(<PixiKnowledgeGraphCanvas key='first' {...props} />);
    expect(runtime_instances).toHaveLength(1);
    const first_runtime = runtime_instances[0];

    rerender(<PixiKnowledgeGraphCanvas key='second' {...props} />);
    expect(runtime_instances).toHaveLength(2);
    const second_runtime = runtime_instances[1];

    expect(first_runtime.destroy).toHaveBeenCalledTimes(1);

    await act(async () => {
      first_runtime.resolve_init();
      await Promise.resolve();
    });

    expect(first_runtime.destroy).toHaveBeenCalledTimes(1);
    expect(first_runtime.set_scene).not.toHaveBeenCalled();
    expect(second_runtime.set_scene).not.toHaveBeenCalled();

    await act(async () => {
      second_runtime.resolve_init();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(second_runtime.set_scene).toHaveBeenCalledTimes(1);
    });
    expect(second_runtime.restore_view).toHaveBeenCalledWith('fit-all');
  });
});
