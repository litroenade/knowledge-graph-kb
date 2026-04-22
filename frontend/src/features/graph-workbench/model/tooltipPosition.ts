export type TooltipPlacement = 'top' | 'bottom';

export interface TooltipTargetRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface FloatingTooltipPositionInput {
  target_rect: TooltipTargetRect;
  viewport_height: number;
  viewport_width: number;
  tooltip_height?: number;
  tooltip_width?: number;
}

export interface FloatingTooltipPosition {
  arrow_left: number;
  left: number;
  placement: TooltipPlacement;
  top: number;
  width: number;
}

const DEFAULT_GAP = 10;
const DEFAULT_MARGIN = 12;
const DEFAULT_TOOLTIP_HEIGHT = 58;
const DEFAULT_TOOLTIP_WIDTH = 280;
const MIN_ARROW_INSET = 14;

export function resolve_floating_tooltip_position(input: FloatingTooltipPositionInput): FloatingTooltipPosition {
  const viewport_width = Math.max(DEFAULT_MARGIN * 2 + 1, input.viewport_width);
  const viewport_height = Math.max(DEFAULT_MARGIN * 2 + 1, input.viewport_height);
  const width = Math.min(input.tooltip_width ?? DEFAULT_TOOLTIP_WIDTH, viewport_width - DEFAULT_MARGIN * 2);
  const height = input.tooltip_height ?? DEFAULT_TOOLTIP_HEIGHT;
  const target_center = input.target_rect.left + input.target_rect.width / 2;
  const left = clamp(target_center - width / 2, DEFAULT_MARGIN, viewport_width - width - DEFAULT_MARGIN);
  const has_room_above = input.target_rect.top >= height + DEFAULT_GAP + DEFAULT_MARGIN;
  const placement: TooltipPlacement = has_room_above ? 'top' : 'bottom';
  const unclamped_top = placement === 'top'
    ? input.target_rect.top - height - DEFAULT_GAP
    : input.target_rect.bottom + DEFAULT_GAP;
  const top = clamp(unclamped_top, DEFAULT_MARGIN, viewport_height - height - DEFAULT_MARGIN);
  const arrow_left = clamp(target_center - left, MIN_ARROW_INSET, width - MIN_ARROW_INSET);

  return {
    arrow_left,
    left,
    placement,
    top,
    width,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
