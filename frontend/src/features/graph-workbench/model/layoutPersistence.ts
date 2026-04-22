import type { GraphDataView, KBScope } from '../../../shared/types/kb';

export const GRAPH_LAYOUT_SNAPSHOT_VERSION = 1;

export interface GraphLayoutNodeSnapshot {
  id: string;
  x: number;
  y: number;
  fixed: boolean;
}

export interface GraphLayoutSnapshot {
  version: typeof GRAPH_LAYOUT_SNAPSHOT_VERSION;
  saved_at: string;
  nodes: GraphLayoutNodeSnapshot[];
}

export interface GraphLayoutKeyInput {
  view: GraphDataView;
  density: number;
  scope: KBScope;
}

export function build_layout_storage_key(input: GraphLayoutKeyInput): string {
  const canonical = JSON.stringify({
    view: input.view,
    density: Math.round(input.density),
    scope: {
      mode: input.scope.mode,
      source_ids: [...input.scope.source_ids].sort(),
      version_mode: input.scope.version_mode,
      version_id: input.scope.version_id,
      excluded_source_ids: [...input.scope.excluded_source_ids].sort(),
    },
  });
  return `amemorix:graph-layout:v${GRAPH_LAYOUT_SNAPSHOT_VERSION}:${stable_hash(canonical)}`;
}

export function create_layout_snapshot(
  nodes: GraphLayoutNodeSnapshot[],
  saved_at = new Date().toISOString(),
): GraphLayoutSnapshot {
  return {
    version: GRAPH_LAYOUT_SNAPSHOT_VERSION,
    saved_at,
    nodes: nodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      fixed: node.fixed,
    })),
  };
}

export function write_layout_snapshot(storage: Storage, key: string, snapshot: GraphLayoutSnapshot): void {
  storage.setItem(key, JSON.stringify(snapshot));
}

export function read_layout_snapshot(storage: Storage, key: string): GraphLayoutSnapshot | null {
  const raw = storage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return is_layout_snapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function delete_layout_snapshot(storage: Storage, key: string): void {
  storage.removeItem(key);
}

function is_layout_snapshot(value: unknown): value is GraphLayoutSnapshot {
  if (!is_record(value) || value.version !== GRAPH_LAYOUT_SNAPSHOT_VERSION || typeof value.saved_at !== 'string') {
    return false;
  }
  if (!Array.isArray(value.nodes)) {
    return false;
  }
  return value.nodes.every((node) =>
    is_record(node) &&
    typeof node.id === 'string' &&
    Number.isFinite(node.x) &&
    Number.isFinite(node.y) &&
    typeof node.fixed === 'boolean',
  );
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stable_hash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
