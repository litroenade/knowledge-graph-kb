import { describe, expect, it } from 'vitest';

import { build_layout_storage_key } from '../src/features/graph-workbench/model/layoutPersistence';
import type { KBScope } from '../src/shared/types/kb';

const scope: KBScope = {
  mode: 'all',
  source_ids: [],
  version_mode: 'latest',
  version_id: null,
  excluded_source_ids: [],
};

describe('layout persistence keys', () => {
  it('separates graph contexts that render different node sets', () => {
    const global_key = build_layout_storage_key({
      density: 100,
      graph_mode: 'global',
      local_depth: 1,
      scope,
      search: '',
      selected: null,
      view: 'semantic',
    });
    const local_key = build_layout_storage_key({
      density: 100,
      graph_mode: 'local',
      local_depth: 2,
      scope,
      search: 'alpha',
      selected: { type: 'node', id: 'node-alpha' },
      view: 'semantic',
    });

    expect(local_key).not.toBe(global_key);
  });
});
