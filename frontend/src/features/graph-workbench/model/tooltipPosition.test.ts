import { describe, expect, it } from 'vitest';

import { resolve_floating_tooltip_position } from './tooltipPosition';

describe('floating tooltip positioning', () => {
  it('keeps a tooltip inside the viewport near the left edge', () => {
    const position = resolve_floating_tooltip_position({
      target_rect: { bottom: 96, height: 36, left: 2, right: 82, top: 60, width: 80 },
      viewport_height: 720,
      viewport_width: 1280,
    });

    expect(position.left).toBeGreaterThanOrEqual(12);
    expect(position.arrow_left).toBeGreaterThan(0);
    expect(position.arrow_left).toBeLessThan(position.width);
  });

  it('places the tooltip below the target when there is no room above', () => {
    const position = resolve_floating_tooltip_position({
      target_rect: { bottom: 48, height: 36, left: 480, right: 580, top: 12, width: 100 },
      viewport_height: 720,
      viewport_width: 1280,
    });

    expect(position.placement).toBe('bottom');
    expect(position.top).toBeGreaterThan(48);
  });
});
