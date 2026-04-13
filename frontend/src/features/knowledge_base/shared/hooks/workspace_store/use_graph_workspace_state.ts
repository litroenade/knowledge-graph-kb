/**
 * Graph, manual-relation, selection, and highlight state.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import {
  create_graph_node,
  create_manual_relation,
  delete_graph_edge,
  delete_graph_node,
  delete_manual_relation,
  fetch_graph,
  get_graph_edge_detail,
  get_graph_node_detail,
  list_manual_relations,
  update_graph_node,
} from '../../api/graph_api';
import { kb_query_keys } from '../../api/query_client';
import type {
  GraphDataView,
  GraphEdgeDetailRecord,
  GraphFocusCommand,
  GraphNodeDetailRecord,
  KBScopeRecord,
  KnowledgeGraphRecord,
  ManualRelationRecord,
} from '../../types/knowledge_base_types';

function has_node(graph: KnowledgeGraphRecord, node_id: string): boolean {
  return graph.nodes.some((node) => node.id === node_id);
}

function has_edge(graph: KnowledgeGraphRecord, edge_id: string): boolean {
  return graph.edges.some((edge) => edge.id === edge_id);
}

const EMPTY_GRAPH: KnowledgeGraphRecord = { view: 'semantic', nodes: [], edges: [] };

interface NormalizedGraphState {
  graph: KnowledgeGraphRecord;
  dropped_edge_count: number;
}

function normalize_graph(graph: KnowledgeGraphRecord): NormalizedGraphState {
  const normalized_nodes = Array.isArray(graph.nodes) ? graph.nodes.filter(Boolean) : [];
  const visible_node_ids = new Set(normalized_nodes.map((node) => node.id));
  const normalized_edges = [];
  let dropped_edge_count = 0;

  for (const edge of Array.isArray(graph.edges) ? graph.edges : []) {
    if (!edge || !visible_node_ids.has(edge.source) || !visible_node_ids.has(edge.target)) {
      dropped_edge_count += 1;
      continue;
    }
    normalized_edges.push(edge);
  }

  return {
    graph: {
      view: graph.view ?? 'semantic',
      nodes: normalized_nodes,
      edges: normalized_edges,
    },
    dropped_edge_count,
  };
}

interface GraphWorkspaceStateProps {
  default_graph_density: number;
  selected_source_browser_id: string | null;
  selected_source_version_id: string | null;
  set_message: Dispatch<SetStateAction<string>>;
  set_error: Dispatch<SetStateAction<string | null>>;
}

export function use_graph_workspace_state(props: GraphWorkspaceStateProps) {
  const {
    default_graph_density,
    selected_source_browser_id,
    selected_source_version_id,
    set_message,
    set_error,
  } = props;
  const query_client = useQueryClient();
  const [selected_source_ids, set_selected_source_ids] = useState<string[]>([]);
  const [graph_data_view, set_graph_data_view_state] = useState<GraphDataView>('semantic');
  const [graph_anchor_node_ids, set_graph_anchor_node_ids] = useState<string[]>([]);
  const [graph_anchor_edge_ids, set_graph_anchor_edge_ids] = useState<string[]>([]);
  const [density, set_density] = useState<number>(default_graph_density);
  const [selected_node_id, set_selected_node_id] = useState<string | null>(null);
  const [selected_edge_id, set_selected_edge_id] = useState<string | null>(null);
  const [inspected_node_id, set_inspected_node_id] = useState<string | null>(null);
  const [inspected_edge_id, set_inspected_edge_id] = useState<string | null>(null);
  const [highlighted_node_ids, set_highlighted_node_ids] = useState<string[]>([]);
  const [highlighted_edge_ids, set_highlighted_edge_ids] = useState<string[]>([]);
  const [graph_focus_command, set_graph_focus_command] = useState<GraphFocusCommand | null>(null);
  const graph_version_id =
    selected_source_ids.length === 1 && selected_source_browser_id === selected_source_ids[0]
      ? selected_source_version_id
      : null;
  const graph_scope: KBScopeRecord = {
    mode: selected_source_ids.length ? 'subset' : 'all',
    source_ids: selected_source_ids,
    version_mode: graph_version_id ? 'specific' : 'latest',
    version_id: graph_version_id,
    excluded_source_ids: [],
  };
  const is_evidence_graph_ready =
    graph_data_view !== 'evidence' ||
    graph_anchor_node_ids.length > 0 ||
    graph_anchor_edge_ids.length > 0;

  const graph_query = useQuery({
    queryKey: kb_query_keys.graph({
      scope: graph_scope,
      view: graph_data_view,
      density,
      anchor_node_ids: graph_anchor_node_ids,
      anchor_edge_ids: graph_anchor_edge_ids,
    }),
    queryFn: () =>
      fetch_graph({
        scope: graph_scope,
        view: graph_data_view,
        density,
        anchor_node_ids: graph_anchor_node_ids,
        anchor_edge_ids: graph_anchor_edge_ids,
      }),
    enabled: is_evidence_graph_ready,
  });

  const manual_relations_query = useQuery({
    queryKey: kb_query_keys.manual_relations(),
    queryFn: list_manual_relations,
  });

  const node_detail_query = useQuery({
    queryKey: kb_query_keys.node_detail(inspected_node_id, graph_version_id),
    queryFn: () => get_graph_node_detail(inspected_node_id!, graph_version_id),
    enabled: Boolean(inspected_node_id),
  });

  const edge_detail_query = useQuery({
    queryKey: kb_query_keys.edge_detail(inspected_edge_id),
    queryFn: () => get_graph_edge_detail(inspected_edge_id!),
    enabled: Boolean(inspected_edge_id),
  });

  const normalized_graph_state = useMemo<NormalizedGraphState>(
    () => normalize_graph((graph_query.data ?? EMPTY_GRAPH) as KnowledgeGraphRecord),
    [graph_query.data],
  );
  const graph = normalized_graph_state.graph;
  const scoped_manual_relations = useMemo(
    () => {
      const visible_node_ids = new Set(graph.nodes.map((node) => node.id));
      return ((manual_relations_query.data ?? []) as ManualRelationRecord[]).filter(
        (relation) =>
          visible_node_ids.has(relation.subject_node_id) && visible_node_ids.has(relation.object_node_id),
      );
    },
    [graph.nodes, manual_relations_query.data],
  );
  const node_detail =
    inspected_node_id && inspected_node_id === selected_node_id
      ? ((node_detail_query.data ?? null) as GraphNodeDetailRecord | null)
      : null;
  const edge_detail =
    inspected_edge_id && inspected_edge_id === selected_edge_id
      ? ((edge_detail_query.data ?? null) as GraphEdgeDetailRecord | null)
      : null;
  const is_node_detail_loading =
    inspected_node_id === selected_node_id && Boolean(inspected_node_id) && node_detail_query.isFetching;
  const is_edge_detail_loading =
    inspected_edge_id === selected_edge_id && Boolean(inspected_edge_id) && edge_detail_query.isFetching;
  const graph_error_message =
    (!is_evidence_graph_ready ? 'Select a node or edge to open the evidence subgraph.' : null) ??
    (graph_query.error as Error | null)?.message ??
    (manual_relations_query.error as Error | null)?.message ??
    (node_detail_query.error as Error | null)?.message ??
    (edge_detail_query.error as Error | null)?.message ??
    null;

  const set_graph_data_view = useCallback((next_view: GraphDataView): void => {
    set_graph_data_view_state(next_view);
    if (next_view !== 'evidence') {
      set_graph_anchor_node_ids([]);
      set_graph_anchor_edge_ids([]);
    }
  }, []);

  const open_evidence_graph = useCallback((payload?: {
    node_ids?: string[];
    edge_ids?: string[];
  }): void => {
    const next_node_ids = Array.from(new Set((payload?.node_ids ?? []).filter(Boolean)));
    const next_edge_ids = Array.from(new Set((payload?.edge_ids ?? []).filter(Boolean)));
    if (!next_node_ids.length && !next_edge_ids.length) {
      return;
    }
    set_graph_anchor_node_ids(next_node_ids);
    set_graph_anchor_edge_ids(next_edge_ids);
    set_graph_data_view_state('evidence');
  }, []);

  const refresh_graph = useCallback(async (): Promise<void> => {
    try {
      await query_client.invalidateQueries({ queryKey: ['kb', 'graph'] });
    } catch (refresh_error) {
      set_error((refresh_error as Error).message);
    }
  }, [query_client, set_error]);

  const refresh_manual_relations = useCallback(async (): Promise<void> => {
    try {
      await query_client.invalidateQueries({ queryKey: kb_query_keys.manual_relations() });
    } catch (refresh_error) {
      set_error((refresh_error as Error).message);
    }
  }, [query_client, set_error]);

  const refresh_graph_details = useCallback(async (): Promise<void> => {
    try {
      await Promise.all([
        query_client.invalidateQueries({ queryKey: ['kb', 'graph', 'node-detail'] }),
        query_client.invalidateQueries({ queryKey: ['kb', 'graph', 'edge-detail'] }),
      ]);
    } catch (refresh_error) {
      set_error((refresh_error as Error).message);
    }
  }, [query_client, set_error]);

  const refresh_source_queries = useCallback(async (): Promise<void> => {
    try {
      await Promise.all([
        query_client.invalidateQueries({ queryKey: kb_query_keys.source_list() }),
        query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'detail'] }),
        query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'paragraphs'] }),
      ]);
    } catch (refresh_error) {
      set_error((refresh_error as Error).message);
    }
  }, [query_client, set_error]);

  const create_node_mutation = useMutation({
    mutationFn: (payload: {
      label: string;
      description?: string;
      source_id?: string | null;
      version_id?: string | null;
      metadata?: Record<string, unknown>;
    }) =>
      create_graph_node(payload),
    onSuccess: async (node) => {
      set_message(`已创建实体：${node.label}`);
      set_error(null);
      set_selected_node_id(node.id);
      set_selected_edge_id(null);
      set_highlighted_node_ids([node.id]);
      set_highlighted_edge_ids([]);
      await Promise.all([refresh_graph(), refresh_graph_details(), refresh_manual_relations()]);
    },
    onError: (graph_error) => {
      set_error((graph_error as Error).message);
    },
  });

  const create_relation_mutation = useMutation({
    mutationFn: (payload: {
      subject_node_id: string;
      predicate: string;
      object_node_id: string;
      weight: number;
    }) => create_manual_relation(payload),
    onSuccess: async () => {
      set_message('已创建手工关系。');
      set_error(null);
      await Promise.all([refresh_graph(), refresh_manual_relations()]);
    },
    onError: (relation_error) => {
      set_error((relation_error as Error).message);
    },
  });

  const remove_relation_mutation = useMutation({
    mutationFn: (relation_id: string) => delete_manual_relation(relation_id),
    onSuccess: async () => {
      set_message('已移除手工关系。');
      set_error(null);
      await Promise.all([refresh_graph(), refresh_manual_relations()]);
    },
    onError: (relation_error) => {
      set_error((relation_error as Error).message);
    },
  });

  const rename_node_mutation = useMutation({
    mutationFn: (payload: { node_id: string; label: string }) => update_graph_node(payload.node_id, { label: payload.label }),
    onSuccess: async () => {
      set_message('已更新节点名称。');
      set_error(null);
      await Promise.all([refresh_graph(), refresh_graph_details(), refresh_source_queries()]);
    },
    onError: (graph_error) => {
      set_error((graph_error as Error).message);
    },
  });

  const delete_node_mutation = useMutation({
    mutationFn: (node_id: string) => delete_graph_node(node_id),
    onSuccess: async (_result, node_id) => {
      set_selected_node_id((current) => (current === node_id ? null : current));
      set_highlighted_node_ids((current) => current.filter((item) => item !== node_id));
      if (node_id.startsWith('source:')) {
        const source_id = node_id.split(':')[1] ?? '';
        set_selected_source_ids((current) => current.filter((item) => item !== source_id));
      }
      set_message('已删除节点。');
      set_error(null);
      await Promise.all([refresh_graph(), refresh_manual_relations(), refresh_source_queries()]);
    },
    onError: (graph_error) => {
      set_error((graph_error as Error).message);
    },
  });

  const delete_edge_mutation = useMutation({
    mutationFn: (edge_id: string) => delete_graph_edge(edge_id),
    onSuccess: async (_result, edge_id) => {
      set_selected_edge_id((current) => (current === edge_id ? null : current));
      set_highlighted_edge_ids((current) => current.filter((item) => item !== edge_id));
      set_message('已删除关系。');
      set_error(null);
      await Promise.all([refresh_graph(), refresh_manual_relations(), refresh_source_queries()]);
    },
    onError: (graph_error) => {
      set_error((graph_error as Error).message);
    },
  });

  const create_entity = useCallback(async (
    label: string,
    options?: {
      description?: string;
      source_id?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> => {
    await create_node_mutation.mutateAsync({
      label,
      description: options?.description,
      source_id: options?.source_id,
      version_id:
        options?.source_id &&
        selected_source_ids.length === 1 &&
        selected_source_browser_id === options.source_id
          ? selected_source_version_id
          : null,
      metadata: options?.metadata,
    });
  }, [
    create_node_mutation,
    selected_source_browser_id,
    selected_source_ids,
    selected_source_version_id,
  ]);

  const create_relation = useCallback(async (
    subject_node_id: string,
    predicate: string,
    object_node_id: string,
    weight: number,
  ): Promise<void> => {
    await create_relation_mutation.mutateAsync({
      subject_node_id,
      predicate,
      object_node_id,
      weight,
    });
  }, [create_relation_mutation]);

  const remove_manual_relation = useCallback(async (relation_id: string): Promise<void> => {
    await remove_relation_mutation.mutateAsync(relation_id);
  }, [remove_relation_mutation]);

  const rename_node = useCallback(async (node_id: string, label: string): Promise<void> => {
    await rename_node_mutation.mutateAsync({ node_id, label });
  }, [rename_node_mutation]);

  const delete_node = useCallback(async (node_id: string): Promise<void> => {
    await delete_node_mutation.mutateAsync(node_id);
  }, [delete_node_mutation]);

  const delete_edge = useCallback(async (edge_id: string): Promise<void> => {
    await delete_edge_mutation.mutateAsync(edge_id);
  }, [delete_edge_mutation]);

  const request_node_detail = useCallback((node_id?: string | null): void => {
    set_inspected_edge_id(null);
    set_inspected_node_id(node_id ?? selected_node_id ?? null);
  }, [selected_node_id]);

  const request_edge_detail = useCallback((edge_id?: string | null): void => {
    set_inspected_node_id(null);
    set_inspected_edge_id(edge_id ?? selected_edge_id ?? null);
  }, [selected_edge_id]);

  const clear_graph_details = useCallback((): void => {
    set_inspected_node_id(null);
    set_inspected_edge_id(null);
  }, []);

  useEffect(() => {
    if (normalized_graph_state.dropped_edge_count <= 0) {
      return;
    }
    console.warn(
      `知识图谱已忽略 ${normalized_graph_state.dropped_edge_count} 条缺少端点节点的关系边。`,
    );
  }, [normalized_graph_state.dropped_edge_count]);

  useEffect(() => {
    if (selected_node_id && !has_node(graph, selected_node_id)) {
      set_selected_node_id(null);
    }
    if (selected_edge_id && !has_edge(graph, selected_edge_id)) {
      set_selected_edge_id(null);
    }
  }, [graph, selected_edge_id, selected_node_id]);

  useEffect(() => {
    if (inspected_node_id && inspected_node_id !== selected_node_id) {
      set_inspected_node_id(null);
    }
  }, [inspected_node_id, selected_node_id]);

  useEffect(() => {
    if (inspected_edge_id && inspected_edge_id !== selected_edge_id) {
      set_inspected_edge_id(null);
    }
  }, [inspected_edge_id, selected_edge_id]);

  return useMemo(
    () => ({
      graph,
      refresh_graph,
      manual_relations: scoped_manual_relations,
      refresh_manual_relations,
      selected_source_ids,
      set_selected_source_ids,
      graph_data_view,
      set_graph_data_view,
      graph_anchor_node_ids,
      graph_anchor_edge_ids,
      open_evidence_graph,
      density,
      set_density,
      selected_node_id,
      set_selected_node_id,
      selected_edge_id,
      set_selected_edge_id,
      node_detail,
      edge_detail,
      is_node_detail_loading,
      is_edge_detail_loading,
      request_node_detail,
      request_edge_detail,
      clear_graph_details,
      graph_error_message,
      highlighted_node_ids,
      set_highlighted_node_ids,
      highlighted_edge_ids,
      set_highlighted_edge_ids,
      graph_focus_command,
      set_graph_focus_command,
      is_graph_loading: graph_query.isFetching,
      is_creating_node: create_node_mutation.isPending,
      is_creating_manual_relation: create_relation_mutation.isPending,
      is_renaming_node: rename_node_mutation.isPending,
      is_deleting_node: delete_node_mutation.isPending,
      is_deleting_edge: delete_edge_mutation.isPending,
      create_entity,
      create_relation,
      remove_manual_relation,
      rename_node,
      delete_node,
      delete_edge,
    }),
    [
      create_entity,
      create_node_mutation.isPending,
      create_relation,
      create_relation_mutation.isPending,
      delete_edge,
      delete_edge_mutation.isPending,
      delete_node,
      delete_node_mutation.isPending,
      density,
      edge_detail,
      graph_anchor_edge_ids,
      graph_anchor_node_ids,
      graph_data_view,
      graph,
      graph_error_message,
      graph_focus_command,
      graph_query.isFetching,
      highlighted_edge_ids,
      highlighted_node_ids,
      is_edge_detail_loading,
      is_node_detail_loading,
      manual_relations_query.data,
      scoped_manual_relations,
      node_detail,
      request_edge_detail,
      request_node_detail,
      clear_graph_details,
      refresh_graph,
      refresh_manual_relations,
      remove_manual_relation,
      rename_node,
      rename_node_mutation.isPending,
      selected_edge_id,
      selected_node_id,
      selected_source_ids,
      set_graph_data_view,
      open_evidence_graph,
    ],
  );
}
