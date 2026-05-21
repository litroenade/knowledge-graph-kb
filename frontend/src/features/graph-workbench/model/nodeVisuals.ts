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
      offset: input.selected ? 6 : 0,
      alpha: input.selected ? 1.0 : input.active ? (input.secondary ? 0.6 : 0.95) : 0.15,
    },
    base_ring: input.selected || input.active
      ? {
          color: input.selected ? 0xbae6fd : input.color,
          width: input.selected ? 3 : 1.5,
          alpha: input.selected ? 0.95 : 0.45,
          offset: 7,
        }
      : null,
    fixed_ring: input.fixed
      ? {
          color: 0xfbbf24,
          width: input.selected ? 2.5 : 2,
          alpha: input.active || input.selected ? 1.0 : 0.3,
          offset: input.selected ? 12 : 9,
        }
      : null,
  };
}
