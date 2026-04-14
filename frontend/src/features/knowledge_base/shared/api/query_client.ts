import { QueryClient } from '@tanstack/react-query';

export const kb_query_client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

export const kb_query_keys = {
  model_config: () => ['kb', 'config', 'model'] as const,
  graph: (params: {
    scope: {
      mode: string;
      source_ids: string[];
      version_mode: string;
      version_id?: string | null;
      excluded_source_ids: string[];
    };
    view: string;
    density: number;
    anchor_node_ids: string[];
    anchor_edge_ids: string[];
  }) =>
    ['kb', 'graph', params] as const,
  manual_relations: () => ['kb', 'graph', 'manual-relations'] as const,
  node_detail: (node_id: string | null, version_id?: string | null) =>
    ['kb', 'graph', 'node-detail', node_id, version_id ?? null] as const,
  edge_detail: (edge_id: string | null) => ['kb', 'graph', 'edge-detail', edge_id] as const,
  import_jobs: () => ['kb', 'imports', 'jobs'] as const,
  source_list: () => ['kb', 'sources'] as const,
  source_detail: (source_id: string | null, version_id?: string | null) =>
    ['kb', 'sources', 'detail', source_id, version_id ?? null] as const,
  source_paragraphs: (source_id: string | null, version_id?: string | null) =>
    ['kb', 'sources', 'paragraphs', source_id, version_id ?? null] as const,
  source_worksheets: (source_id: string | null, version_id?: string | null) =>
    ['kb', 'sources', 'worksheets', source_id, version_id ?? null] as const,
  source_worksheet_preview: (params: {
    source_id: string | null;
    version_id?: string | null;
    worksheet_key: string | null;
    page: number;
    page_size: number;
    anchor_row: number | null;
    highlighted_columns: string[];
  }) => ['kb', 'sources', 'worksheet-preview', params] as const,
};
