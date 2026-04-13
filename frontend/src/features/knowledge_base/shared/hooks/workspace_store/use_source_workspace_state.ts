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
  list_source_paragraphs,
  list_sources,
  update_source,
} from '../../api/source_api';
import type {
  ParagraphRecord,
  SourceDetailRecord,
  SourceRecord,
  WorkspaceTab,
} from '../../types/knowledge_base_types';

interface SourceWorkspaceStateProps {
  active_workspace: WorkspaceTab;
  is_source_library_open: boolean;
  set_message: Dispatch<SetStateAction<string>>;
  set_error: Dispatch<SetStateAction<string | null>>;
}

export function use_source_workspace_state(props: SourceWorkspaceStateProps) {
  const { active_workspace, is_source_library_open, set_message, set_error } = props;
  const query_client = useQueryClient();
  const [selected_source_browser_id, set_selected_source_browser_id] = useState<string | null>(null);
  const [selected_source_version_id, set_selected_source_version_id] = useState<string | null>(null);

  const update_selected_source_browser_id = useCallback((next_value: SetStateAction<string | null>): void => {
    set_selected_source_version_id(null);
    set_selected_source_browser_id(next_value);
  }, []);

  const sources_query = useQuery({
    queryKey: kb_query_keys.source_list(),
    queryFn: () => list_sources(),
  });

  const source_detail_query = useQuery({
    queryKey: kb_query_keys.source_detail(selected_source_browser_id, selected_source_version_id),
    queryFn: () => get_source_detail(selected_source_browser_id!, selected_source_version_id),
    enabled: Boolean(selected_source_browser_id),
  });

  const source_paragraphs_query = useQuery({
    queryKey: kb_query_keys.source_paragraphs(selected_source_browser_id, selected_source_version_id),
    queryFn: () => list_source_paragraphs(selected_source_browser_id!, selected_source_version_id),
    enabled: Boolean(selected_source_browser_id),
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
        query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'detail', source.id] }),
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
      set_selected_source_browser_id((current) => (current === source_id ? null : current));
      set_selected_source_version_id((current) =>
        selected_source_browser_id === source_id ? null : current,
      );
      set_message('来源已删除。');
      set_error(null);
      await Promise.all([
        query_client.invalidateQueries({ queryKey: kb_query_keys.source_list() }),
        query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'detail'] }),
        query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'paragraphs'] }),
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
    const sources = sources_query.data ?? [];
    if (active_workspace !== 'chat' || !is_source_library_open || selected_source_browser_id || !sources.length) {
      return;
    }
    update_selected_source_browser_id(sources[0].id);
  }, [
    active_workspace,
    is_source_library_open,
    selected_source_browser_id,
    sources_query.data,
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
        set_selected_source_version_id(null);
      }
      return;
    }
    if (
      selected_source_version_id &&
      versions.some((version) => version.id === selected_source_version_id)
    ) {
      return;
    }
    set_selected_source_version_id(selected_version?.id ?? versions[0]?.id ?? null);
  }, [selected_source_version_id, source_detail_query.data]);

  return useMemo(
    () => ({
      sources: (sources_query.data ?? []) as SourceRecord[],
      refresh_sources,
      update_source: save_source,
      delete_source: remove_source,
      selected_source_browser_id,
      set_selected_source_browser_id: update_selected_source_browser_id,
      selected_source_version_id,
      set_selected_source_version_id,
      source_detail: (source_detail_query.data ?? null) as SourceDetailRecord | null,
      source_versions: (source_detail_query.data?.versions ?? []) as SourceDetailRecord['versions'],
      source_paragraphs: (source_paragraphs_query.data ?? []) as ParagraphRecord[],
      is_updating_source: update_source_mutation.isPending,
      is_deleting_source: delete_source_mutation.isPending,
    }),
    [
      delete_source_mutation.isPending,
      refresh_sources,
      remove_source,
      save_source,
      selected_source_browser_id,
      selected_source_version_id,
      source_detail_query.data,
      source_paragraphs_query.data,
      sources_query.data,
      update_selected_source_browser_id,
      update_source_mutation.isPending,
    ],
  );
}
