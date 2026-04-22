import { describe, expect, it } from 'vitest';

import type { KBScope } from '../../../shared/types/kb';
import {
  build_layout_storage_key,
  create_layout_snapshot,
  delete_layout_snapshot,
  read_layout_snapshot,
  write_layout_snapshot,
} from './layoutPersistence';

const scope: KBScope = {
  mode: 'subset',
  source_ids: ['b', 'a'],
  version_mode: 'specific',
  version_id: 'v2',
  excluded_source_ids: ['z', 'x'],
};

describe('graph layout persistence', () => {
  it('builds stable keys regardless of source id order', () => {
    const key_a = build_layout_storage_key({ view: 'semantic', density: 80, scope });
    const key_b = build_layout_storage_key({
      view: 'semantic',
      density: 80,
      scope: {
        ...scope,
        source_ids: ['a', 'b'],
        excluded_source_ids: ['x', 'z'],
      },
    });

    expect(key_a).toBe(key_b);
    expect(key_a).toContain('amemorix:graph-layout:v1:');
  });

  it('round trips node positions and fixed state', () => {
    const storage = new MemoryStorage();
    const key = build_layout_storage_key({ view: 'structure', density: 60, scope });
    const snapshot = create_layout_snapshot([
      { id: 'n1', x: 12.5, y: -8, fixed: true },
      { id: 'n2', x: 0, y: 44, fixed: false },
    ], '2026-04-22T00:00:00.000Z');

    write_layout_snapshot(storage, key, snapshot);

    expect(read_layout_snapshot(storage, key)).toEqual(snapshot);
  });

  it('ignores malformed snapshots and deletes persisted layout', () => {
    const storage = new MemoryStorage();
    storage.setItem('bad', JSON.stringify({ version: 999, nodes: [{ id: 'n1', x: 'nope' }] }));

    expect(read_layout_snapshot(storage, 'bad')).toBeNull();

    const snapshot = create_layout_snapshot([{ id: 'n1', x: 1, y: 2, fixed: true }], '2026-04-22T00:00:00.000Z');
    write_layout_snapshot(storage, 'good', snapshot);
    delete_layout_snapshot(storage, 'good');

    expect(read_layout_snapshot(storage, 'good')).toBeNull();
  });
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
