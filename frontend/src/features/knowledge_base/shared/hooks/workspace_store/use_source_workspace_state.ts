import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { kb_query_keys } from '../../api/query_client';
import {
  delete_source,
  get_source_detail,
  get_source_worksheet_preview,
  list_source_paragraphs,
  list_source_worksheets,
  list_sources,
  update_source,
} from '../../api/source_api';
import type {
  KBScopeRecord,
  ParagraphRecord,
  SourceDetailRecord,
  SourceRecord,
  WorksheetPreviewRecord,
  WorksheetSummaryRecord,
  WorkspaceTab,
} from '../../types/knowledge_base_types';

const DEFAULT_WORKSHEET_PAGE_SIZE = 40;
const CONTEXT_WORKSHEET_PAGE_SIZE = 9;

type WorksheetPreviewMode = 'page' | 'context';

interface SourceWorkspaceStateProps {
  active_workspace: WorkspaceTab;
  is_source_library_open: boolean;
  browser_scope: KBScopeRecord;
  set_message: Dispatch<SetStateAction<string>>;
  set_error: Dispatch<SetStateAction<string | null>>;
}

interface OpenSourceWorksheetPreviewPayload {
  source_id: string;
  version_id?: string | null;
  worksheet_key?: string | null;
  anchor_row_index?: number | null;
  highlighted_columns?: string[];
}

function resolve_state_value<T>(next_value: SetStateAction<T>, current_value: T): T {
  return typeof next_value === 'function'
    ? (next_value as (value: T) => T)(current_value)
    : next_value;
}

function unique_columns(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function use_source_workspace_state(props: SourceWorkspaceStateProps) {
  const { active_workspace, is_source_library_open, browser_scope, set_message, set_error } = props;
  const query_client = useQueryClient();
  const [selected_source_browser_id, set_selected_source_browser_id_state] = useState<string | null>(null);
  const [selected_source_version_id, set_selected_source_version_id_state] = useState<string | null>(null);
  const [selected_worksheet_key, set_selected_worksheet_key_state] = useState<string | null>(null);
  const [worksheet_page, set_worksheet_page_state] = useState(1);
  const [worksheet_page_size, set_worksheet_page_size_state] = useState(DEFAULT_WORKSHEET_PAGE_SIZE);
  const [worksheet_anchor_row, set_worksheet_anchor_row_state] = useState<number | null>(null);
  const [worksheet_highlighted_columns, set_worksheet_highlighted_columns_state] = useState<string[]>([]);
  const [worksheet_preview_mode, set_worksheet_preview_mode_state] = useState<WorksheetPreviewMode>('page');

  const reset_worksheet_preview_state = useCallback((
    options: {
      keep_page_size?: boolean;
    } = {},
  ): void => {
    set_selected_worksheet_key_state(null);
    set_worksheet_page_state(1);
    set_worksheet_anchor_row_state(null);
    set_worksheet_highlighted_columns_state([]);
    set_worksheet_preview_mode_state('page');
    if (!options.keep_page_size) {
      set_worksheet_page_size_state(DEFAULT_WORKSHEET_PAGE_SIZE);
    }
  }, []);

  const update_selected_source_browser_id = useCallback((next_value: SetStateAction<string | null>): void => {
    set_selected_source_browser_id_state((current_value) => {
      const resolved_value = resolve_state_value(next_value, current_value);
      if (resolved_value === current_value) {
        return current_value;
      }
      set_selected_source_version_id_state(null);
      reset_worksheet_preview_state();
      return resolved_value;
    });
  }, [reset_worksheet_preview_state]);

  const update_selected_source_version_id = useCallback((next_value: SetStateAction<string | null>): void => {
    set_selected_source_version_id_state((current_value) => {
      const resolved_value = resolve_state_value(next_value, current_value);
      if (resolved_value === current_value) {
        return current_value;
      }
      reset_worksheet_preview_state();
      return resolved_value;
    });
  }, [reset_worksheet_preview_state]);

  const update_selected_worksheet_key = useCallback((next_value: SetStateAction<string | null>): void => {
    set_selected_worksheet_key_state((current_value) => {
      const resolved_value = resolve_state_value(next_value, current_value);
      if (resolved_value === current_value) {
        return current_value;
      }
      set_worksheet_page_state(1);
      set_worksheet_anchor_row_state(null);
      set_worksheet_highlighted_columns_state([]);
      set_worksheet_preview_mode_state('page');
      set_worksheet_page_size_state(DEFAULT_WORKSHEET_PAGE_SIZE);
      return resolved_value;
    });
  }, []);

  const update_worksheet_page = useCallback((next_value: SetStateAction<number>): void => {
    set_worksheet_page_state((current_value) => Math.max(1, resolve_state_value(next_value, current_value)));
  }, []);

  const update_worksheet_page_size = useCallback((next_value: SetStateAction<number>): void => {
    set_worksheet_page_size_state((current_value) =>
      Math.max(1, resolve_state_value(next_value, current_value)),
    );
  }, []);

  const update_worksheet_anchor_row = useCallback((next_value: SetStateAction<number | null>): void => {
    set_worksheet_anchor_row_state((current_value) => {
      const resolved_value = resolve_state_value(next_value, current_value);
      return resolved_value && resolved_value > 0 ? resolved_value : null;
    });
  }, []);

  const update_worksheet_highlighted_columns = useCallback((next_value: SetStateAction<string[]>): void => {
    set_worksheet_highlighted_columns_state((current_value) =>
      unique_columns(resolve_state_value(next_value, current_value)),
    );
  }, []);

  const update_worksheet_preview_mode = useCallback((next_value: SetStateAction<WorksheetPreviewMode>): void => {
    set_worksheet_preview_mode_state((current_value) => {
      const resolved_value = resolve_state_value(next_value, current_value);
      if (resolved_value === 'context') {
        set_worksheet_page_state(1);
        set_worksheet_page_size_state(CONTEXT_WORKSHEET_PAGE_SIZE);
      } else {
        set_worksheet_page_state(1);
        set_worksheet_page_size_state(DEFAULT_WORKSHEET_PAGE_SIZE);
      }
      return resolved_value;
    });
  }, []);

  const open_source_worksheet_preview = useCallback((payload: OpenSourceWorksheetPreviewPayload): void => {
    const normalized_anchor_row =
      payload.anchor_row_index && payload.anchor_row_index > 0 ? payload.anchor_row_index : null;
    update_selected_source_browser_id(payload.source_id);
    set_selected_source_version_id_state(payload.version_id ?? null);
    set_selected_worksheet_key_state(payload.worksheet_key ?? null);
    set_worksheet_page_state(1);
    set_worksheet_anchor_row_state(normalized_anchor_row);
    set_worksheet_highlighted_columns_state(unique_columns(payload.highlighted_columns ?? []));
    set_worksheet_preview_mode_state(normalized_anchor_row ? 'context' : 'page');
    set_worksheet_page_size_state(
      normalized_anchor_row ? CONTEXT_WORKSHEET_PAGE_SIZE : DEFAULT_WORKSHEET_PAGE_SIZE,
    );
  }, [update_selected_source_browser_id]);

  const sources_query = useQuery({
    queryKey: kb_query_keys.source_list({ kind: 'all' }),
    queryFn: () => list_sources(),
  });

  const browser_sources_query = useQuery({
    queryKey: kb_query_keys.source_list({ kind: 'browser', scope: browser_scope }),
    queryFn: () => list_sources({ scope: browser_scope }),
    enabled: is_source_library_open,
  });

  const source_detail_query = useQuery({
    queryKey: kb_query_keys.source_detail(selected_source_browser_id, selected_source_version_id),
    queryFn: () => get_source_detail(selected_source_browser_id!, selected_source_version_id),
    enabled: Boolean(selected_source_browser_id),
  });

  const source_paragraphs_query = useQuery({
    queryKey: kb_query_keys.source_paragraphs(selected_source_browser_id, selected_source_version_id),
    queryFn: () => list_source_paragraphs(selected_source_browser_id!, selected_source_version_id),
    enabled: Boolean(selected_source_browser_id) && is_source_library_open,
  });

  const source_worksheets_query = useQuery({
    queryKey: kb_query_keys.source_worksheets(selected_source_browser_id, selected_source_version_id),
    queryFn: () => list_source_worksheets(selected_source_browser_id!, selected_source_version_id),
    enabled: Boolean(selected_source_browser_id) && is_source_library_open,
  });

  const worksheet_preview_query = useQuery({
    queryKey: kb_query_keys.source_worksheet_preview({
      source_id: selected_source_browser_id,
      version_id: selected_source_version_id,
      worksheet_key: selected_worksheet_key,
      page: worksheet_page,
      page_size: worksheet_page_size,
      anchor_row: worksheet_preview_mode === 'context' ? worksheet_anchor_row : null,
      highlighted_columns: worksheet_highlighted_columns,
    }),
    queryFn: () => get_source_worksheet_preview(selected_source_browser_id!, selected_worksheet_key!, {
      version_id: selected_source_version_id,
      page: worksheet_page,
      page_size: worksheet_page_size,
      anchor_row: worksheet_preview_mode === 'context' ? worksheet_anchor_row : null,
      highlighted_columns: worksheet_highlighted_columns,
    }),
    enabled: Boolean(selected_source_browser_id && selected_worksheet_key) && is_source_library_open,
  });

  const refresh_sources = useCallback(async (_keyword?: string): Promise<void> => {
    try {
      await query_client.invalidateQueries({ queryKey: kb_query_keys.source_list() });
      await query_client.refetchQueries({ queryKey: kb_query_keys.source_list() });
    } catch (refresh_error) {
      set_error((refresh_error as Error).message);
    }
  }, [query_client, set_error]);

  const update_source_mutation = useMutation({
    mutationFn: (payload: { source_id: string; name?: string; summary?: string; metadata?: Record<string, unknown> }) =>
      update_source(payload.source_id, {
        name: payload.name,
        summary: payload.summary,
        metadata: payload.metadata,
      }),
    onSuccess: async (source) => {
      set_message(`来源已更新：${source.name}`);
      set_error(null);
      await Promise.all([
        query_client.invalidateQueries({ queryKey: kb_query_keys.source_list() }),
        query_client.invalidateQueries({ queryKey: kb_query_keys.source_detail(source.id) }),
        query_client.invalidateQueries({ queryKey: kb_query_keys.source_paragraphs(source.id) }),
        query_client.invalidateQueries({ queryKey: kb_query_keys.source_worksheets(source.id) }),
        query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'worksheet-preview'] }),
        query_client.invalidateQueries({ queryKey: ['kb', 'graph'] }),
      ]);
    },
    onError: (source_error) => {
      set_error((source_error as Error).message);
    },
  });

  const delete_source_mutation = useMutation({
    mutationFn: (source_id: string) => delete_source(source_id),
    onSuccess: async (_result, source_id) => {
      set_selected_source_browser_id_state((current) => (current === source_id ? null : current));
      set_selected_source_version_id_state((current) =>
        selected_source_browser_id === source_id ? null : current,
      );
      reset_worksheet_preview_state();
      set_message('来源已删除。');
      set_error(null);
      await Promise.all([
        query_client.invalidateQueries({ queryKey: kb_query_keys.source_list() }),
        query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'detail'] }),
        query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'paragraphs'] }),
        query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'worksheets'] }),
        query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'worksheet-preview'] }),
        query_client.invalidateQueries({ queryKey: ['kb', 'graph'] }),
        query_client.invalidateQueries({ queryKey: kb_query_keys.manual_relations() }),
      ]);
    },
    onError: (source_error) => {
      set_error((source_error as Error).message);
    },
  });

  const save_source = useCallback(async (
    source_id: string,
    payload: {
      name?: string;
      summary?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> => {
    await update_source_mutation.mutateAsync({ source_id, ...payload });
  }, [update_source_mutation]);

  const remove_source = useCallback(async (source_id: string): Promise<void> => {
    await delete_source_mutation.mutateAsync(source_id);
  }, [delete_source_mutation]);

  useEffect(() => {
    if (sources_query.error) {
      set_error((sources_query.error as Error).message);
    }
  }, [set_error, sources_query.error]);

  useEffect(() => {
    if (browser_sources_query.error) {
      set_error((browser_sources_query.error as Error).message);
    }
  }, [browser_sources_query.error, set_error]);

  useEffect(() => {
    if (source_detail_query.error) {
      set_error((source_detail_query.error as Error).message);
    }
  }, [set_error, source_detail_query.error]);

  useEffect(() => {
    if (source_paragraphs_query.error) {
      set_error((source_paragraphs_query.error as Error).message);
    }
  }, [set_error, source_paragraphs_query.error]);

  useEffect(() => {
    if (source_worksheets_query.error) {
      set_error((source_worksheets_query.error as Error).message);
    }
  }, [set_error, source_worksheets_query.error]);

  useEffect(() => {
    if (worksheet_preview_query.error) {
      set_error((worksheet_preview_query.error as Error).message);
    }
  }, [set_error, worksheet_preview_query.error]);

  useEffect(() => {
    const browser_sources = browser_sources_query.data ?? [];
    if (
      active_workspace !== 'chat' ||
      !is_source_library_open ||
      selected_source_browser_id ||
      !browser_sources.length
    ) {
      return;
    }
    update_selected_source_browser_id(browser_sources[0].id);
  }, [
    active_workspace,
    browser_sources_query.data,
    is_source_library_open,
    selected_source_browser_id,
    update_selected_source_browser_id,
  ]);

  useEffect(() => {
    const browser_sources = browser_sources_query.data ?? [];
    if (!is_source_library_open || !selected_source_browser_id || !browser_sources.length) {
      return;
    }
    if (browser_sources.some((source) => source.id === selected_source_browser_id)) {
      return;
    }
    update_selected_source_browser_id(browser_sources[0].id);
  }, [
    browser_sources_query.data,
    is_source_library_open,
    selected_source_browser_id,
    update_selected_source_browser_id,
  ]);

  useEffect(() => {
    const sources = sources_query.data ?? [];
    if (!selected_source_browser_id) {
      return;
    }
    if (sources.some((source) => source.id === selected_source_browser_id)) {
      return;
    }
    update_selected_source_browser_id(sources[0]?.id ?? null);
  }, [selected_source_browser_id, sources_query.data, update_selected_source_browser_id]);

  useEffect(() => {
    const versions = source_detail_query.data?.versions ?? [];
    const selected_version = source_detail_query.data?.selected_version ?? null;
    if (!versions.length) {
      if (selected_source_version_id !== null) {
        set_selected_source_version_id_state(null);
      }
      return;
    }
    if (
      selected_source_version_id &&
      versions.some((version) => version.id === selected_source_version_id)
    ) {
      return;
    }
    set_selected_source_version_id_state(selected_version?.id ?? versions[0]?.id ?? null);
  }, [selected_source_version_id, source_detail_query.data]);

  useEffect(() => {
    const worksheets = source_worksheets_query.data ?? [];
    if (!worksheets.length) {
      if (selected_worksheet_key !== null) {
        set_selected_worksheet_key_state(null);
      }
      return;
    }
    if (selected_worksheet_key && worksheets.some((item) => item.worksheet_key === selected_worksheet_key)) {
      return;
    }
    set_selected_worksheet_key_state(worksheets[0]?.worksheet_key ?? null);
  }, [selected_worksheet_key, source_worksheets_query.data]);

  return useMemo(
    () => ({
      sources: (sources_query.data ?? []) as SourceRecord[],
      browser_sources: (browser_sources_query.data ?? []) as SourceRecord[],
      refresh_sources,
      update_source: save_source,
      delete_source: remove_source,
      selected_source_browser_id,
      set_selected_source_browser_id: update_selected_source_browser_id,
      selected_source_version_id,
      set_selected_source_version_id: update_selected_source_version_id,
      source_detail: (source_detail_query.data ?? null) as SourceDetailRecord | null,
      source_versions: (source_detail_query.data?.versions ?? []) as SourceDetailRecord['versions'],
      source_paragraphs: (source_paragraphs_query.data ?? []) as ParagraphRecord[],
      source_worksheets: (source_worksheets_query.data ?? []) as WorksheetSummaryRecord[],
      worksheet_preview: (worksheet_preview_query.data ?? null) as WorksheetPreviewRecord | null,
      selected_worksheet_key,
      set_selected_worksheet_key: update_selected_worksheet_key,
      worksheet_page,
      set_worksheet_page: update_worksheet_page,
      worksheet_page_size,
      set_worksheet_page_size: update_worksheet_page_size,
      worksheet_anchor_row,
      set_worksheet_anchor_row: update_worksheet_anchor_row,
      worksheet_highlighted_columns,
      set_worksheet_highlighted_columns: update_worksheet_highlighted_columns,
      worksheet_preview_mode,
      set_worksheet_preview_mode: update_worksheet_preview_mode,
      open_source_worksheet_preview,
      is_loading_source_worksheets: source_worksheets_query.isPending,
      is_loading_worksheet_preview: worksheet_preview_query.isPending,
      source_worksheets_error: source_worksheets_query.error ? (source_worksheets_query.error as Error).message : null,
      worksheet_preview_error: worksheet_preview_query.error ? (worksheet_preview_query.error as Error).message : null,
      is_updating_source: update_source_mutation.isPending,
      is_deleting_source: delete_source_mutation.isPending,
    }),
    [
      delete_source_mutation.isPending,
      open_source_worksheet_preview,
      refresh_sources,
      remove_source,
      save_source,
      selected_source_browser_id,
      selected_source_version_id,
      selected_worksheet_key,
      source_detail_query.data,
      source_paragraphs_query.data,
      source_worksheets_query.data,
      source_worksheets_query.error,
      sources_query.data,
      browser_sources_query.data,
      update_selected_source_browser_id,
      update_selected_source_version_id,
      update_selected_worksheet_key,
      update_source_mutation.isPending,
      update_worksheet_anchor_row,
      update_worksheet_highlighted_columns,
      update_worksheet_page,
      update_worksheet_page_size,
      update_worksheet_preview_mode,
      worksheet_anchor_row,
      worksheet_highlighted_columns,
      worksheet_page,
      worksheet_page_size,
      worksheet_preview_mode,
      worksheet_preview_query.data,
      worksheet_preview_query.error,
      worksheet_preview_query.isPending,
      source_worksheets_query.isPending,
    ],
  );
}
