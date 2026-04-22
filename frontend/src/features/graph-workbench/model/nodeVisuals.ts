import type { Neighborhood } from './graphModel';

export interface NodeVisualInput {
  active: boolean;
  color: number;
  fixed: boolean;
  secondary: boolean;
  selected: boolean;
}

export interface NodeRingVisual {
  alpha: number;
  color: number;
  offset: number;
  width: number;
}

export interface NodeVisualState {
  fill: {
    alpha: number;
    color: number;
    offset: number;
  };
  base_ring: NodeRingVisual | null;
  fixed_ring: NodeRingVisual | null;
}

export function resolve_fixed_neighborhood_node_ids(neighborhood: Neighborhood): string[] {
  return [...neighborhood.primary_node_ids];
}

export function resolve_node_visual_state(input: NodeVisualInput): NodeVisualState {
  return {
    fill: {
      color: input.selected ? 0xffffff : input.color,
      offset: input.selected ? 5 : 0,
      alpha: input.selected ? 0.98 : input.active ? (input.secondary ? 0.54 : 0.86) : 0.12,
    },
    base_ring: input.selected || input.active
      ? {
          color: input.selected ? 0xbae6fd : input.color,
          width: input.selected ? 2.4 : 1.2,
          alpha: input.selected ? 0.9 : 0.34,
          offset: 6,
        }
      : null,
    fixed_ring: input.fixed
      ? {
          color: 0xfacc15,
          width: input.selected ? 2.2 : 1.7,
          alpha: input.active || input.selected ? 0.94 : 0.24,
          offset: input.selected ? 11 : 8,
        }
      : null,
  };
}
