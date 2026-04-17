import { beforeEach, describe, expect, it, vi } from 'vitest';

const pixi_mocks = vi.hoisted(() => {
  class MockContainer {
    parent: MockContainer | null = null;
    children: MockContainer[] = [];
    x = 0;
    y = 0;
    alpha = 1;
    eventMode = 'auto';
    forceHitArea: unknown = null;
    removeAllListeners = vi.fn();
    on = vi.fn();
    destroy = vi.fn((_: unknown = undefined) => {
      this.removeChildren();
      this.parent?.removeChild(this);
      this.parent = null;
    });

    addChild<T extends MockContainer>(child: T): T {
      child.parent = this;
      this.children.push(child);
      return child;
    }

    removeChild<T extends MockContainer>(child: T): T {
      this.children = this.children.filter((item) => item !== child);
      if (child.parent === this) {
        child.parent = null;
      }
      return child;
    }

    removeChildren(): MockContainer[] {
      const removed = [...this.children];
      this.children = [];
      removed.forEach((child) => {
        if (child.parent === this) {
          child.parent = null;
        }
      });
      return removed;
    }
  }

  class MockGraphics extends MockContainer {
    clear() { return this; }
    setStrokeStyle(_: unknown) { return this; }
    beginPath() { return this; }
    moveTo(_: number, __: number) { return this; }
    lineTo(_: number, __: number) { return this; }
    stroke(_: unknown = undefined) { return this; }
    circle(_: number, __: number, ___: number) { return this; }
    fill(_: unknown) { return this; }
    roundRect(_: number, __: number, ___: number, ____: number, _____: number) { return this; }
  }

  class MockText extends MockContainer {
    text: string;
    style: unknown;
    width: number;
    height = 16;

    constructor(options: { text: string; style: unknown }) {
      super();
      this.text = options.text;
      this.style = options.style;
      this.width = Math.max(12, options.text.length * 8);
    }
  }

  class MockTextStyle {
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  }

  class MockRectangle {
    constructor(
      public readonly x: number,
      public readonly y: number,
      public readonly width: number,
      public readonly height: number,
    ) {}
  }

  const application_instances: MockApplication[] = [];
  const viewport_instances: MockViewport[] = [];

  class MockApplication {
    canvas: HTMLCanvasElement;
    stage = new MockContainer();
    renderer = {
      events: { domElement: { addEventListener: vi.fn(), removeEventListener: vi.fn() } },
      destroy: vi.fn(),
      resize: vi.fn(),
    };
    ticker = { add: vi.fn(), remove: vi.fn(), elapsedMS: 16 };
    destroy = vi.fn((renderer_destroy_options?: unknown, options?: unknown) => {
      this.stage.destroy(options);
      this.renderer.destroy(renderer_destroy_options);
    });

    constructor() {
      this.canvas = document.createElement('canvas');
      application_instances.push(this);
    }

    async init(_: unknown): Promise<void> {}
  }

  class MockViewport extends MockContainer {
    screenWidth: number;
    screenHeight: number;
    scaled = 1;

    constructor(options: { screenWidth: number; screenHeight: number }) {
      super();
      this.screenWidth = options.screenWidth;
      this.screenHeight = options.screenHeight;
      viewport_instances.push(this);
    }

    drag() { return this; }
    pinch() { return this; }
    wheel(_: unknown = undefined) { return this; }
    decelerate() { return this; }
    clampZoom(_: unknown) { return this; }
    resize(width: number, height: number) {
      this.screenWidth = width;
      this.screenHeight = height;
    }
    setZoom = vi.fn();
    toWorld(point: { x: number; y: number }) {
      return point;
    }
  }

  return {
    Application: MockApplication,
    CanvasTextMetrics: {
      measureText: vi.fn((value: string) => ({
        width: Math.max(12, value.length * 8),
        height: 16,
      })),
    },
    Container: MockContainer,
    Graphics: MockGraphics,
    Rectangle: MockRectangle,
    Text: MockText,
    TextStyle: MockTextStyle,
    application_instances,
    viewport_instances,
    Viewport: MockViewport,
  };
});

vi.mock('pixi.js', () => ({
  Application: pixi_mocks.Application,
  CanvasTextMetrics: pixi_mocks.CanvasTextMetrics,
  Container: pixi_mocks.Container,
  Graphics: pixi_mocks.Graphics,
  Rectangle: pixi_mocks.Rectangle,
  Text: pixi_mocks.Text,
  TextStyle: pixi_mocks.TextStyle,
}));

vi.mock('pixi-viewport', () => ({
  Viewport: pixi_mocks.Viewport,
}));

import { GraphRuntime } from './graph_runtime';

describe('GraphRuntime', () => {
  beforeEach(() => {
    pixi_mocks.application_instances.length = 0;
    pixi_mocks.viewport_instances.length = 0;
    vi.clearAllMocks();
  });

  it('detaches and destroys the viewport before tearing down the application renderer', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 960 });
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 540 });

    const runtime = new GraphRuntime({
      container,
      resolved_theme: 'dark',
      on_select_node: vi.fn(),
      on_select_edge: vi.fn(),
      on_clear_selection: vi.fn(),
      on_hover_change: vi.fn(),
    });

    await runtime.init();

    expect(pixi_mocks.application_instances).toHaveLength(1);
    expect(pixi_mocks.viewport_instances).toHaveLength(1);

    const app = pixi_mocks.application_instances[0];
    const viewport = pixi_mocks.viewport_instances[0];

    expect(app.stage.children).toContain(viewport);

    runtime.destroy();
    runtime.destroy();

    expect(viewport.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(viewport.destroy).toHaveBeenCalledTimes(1);
    expect(viewport.destroy).toHaveBeenCalledWith({ children: true });
    expect(app.destroy).toHaveBeenCalledTimes(1);
    expect(app.destroy).toHaveBeenCalledWith({ removeView: true }, false);
    expect(viewport.parent).toBeNull();
    expect(app.stage.children).not.toContain(viewport);
    expect(viewport.destroy.mock.invocationCallOrder[0]).toBeLessThan(app.destroy.mock.invocationCallOrder[0]);
  });
});
