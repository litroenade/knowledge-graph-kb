import { describe, expect, it } from 'vitest';

import type { Neighborhood } from './graphModel';
import { resolve_fixed_neighborhood_node_ids, resolve_node_visual_state } from './nodeVisuals';

describe('node visuals and fixed-node commands', () => {
  it('fixes only the primary neighborhood around the current selection', () => {
    const neighborhood: Neighborhood = {
      primary_node_ids: new Set(['focus', 'first-degree']),
      secondary_node_ids: new Set(['second-degree']),
      edge_ids: new Set(['edge-a', 'edge-b']),
    };

    expect(resolve_fixed_neighborhood_node_ids(neighborhood).sort()).toEqual(['first-degree', 'focus']);
  });

  it('adds a visible fixed ring without replacing selected-node styling', () => {
    const state = resolve_node_visual_state({
      active: true,
      color: 0x38bdf8,
      fixed: true,
      secondary: false,
      selected: true,
    });

    expect(state.fill.color).toBe(0xffffff);
    expect(state.base_ring?.width).toBeGreaterThan(2);
    expect(state.fixed_ring).toEqual({
      alpha: 0.94,
      color: 0xfacc15,
      offset: 11,
      width: 2.2,
    });
  });

  it('does not draw a fixed ring for free-moving nodes', () => {
    const state = resolve_node_visual_state({
      active: true,
      color: 0x38bdf8,
      fixed: false,
      secondary: false,
      selected: false,
    });

    expect(state.fixed_ring).toBeNull();
  });
});
