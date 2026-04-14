import { vi } from 'vitest';

import type { KnowledgeBaseWorkspaceSlices } from '../hooks/use_knowledge_base_workspace';
import type {
  AnswerCitationRecord,
  GraphEdgeDetailRecord,
  GraphNodeDetailRecord,
  KBScopeRecord,
  KnowledgeGraphRecord,
  ParagraphRecord,
  SourceDetailRecord,
  SourceRecord,
  SourceVersionRecord,
  WorksheetPreviewRecord,
  WorksheetSummaryRecord,
} from '../types/knowledge_base_types';

const FIXTURE_TIME = '2026-04-01T00:00:00Z';

export function create_scope_record(overrides: Partial<KBScopeRecord> = {}): KBScopeRecord {
  return {
    mode: 'all',
    source_ids: [],
    version_mode: 'latest',
    version_id: null,
    excluded_source_ids: [],
    ...overrides,
  };
}

export function create_source_version_record(
  overrides: Partial<SourceVersionRecord> = {},
): SourceVersionRecord {
  return {
    id: overrides.id ?? 'version-1',
    source_id: overrides.source_id ?? 'source-1',
    version_number: overrides.version_number ?? 1,
    status: overrides.status ?? 'ready',
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? FIXTURE_TIME,
    activated_at: overrides.activated_at ?? FIXTURE_TIME,
    updated_at: overrides.updated_at ?? FIXTURE_TIME,
  };
}

export function create_source_record(overrides: Partial<SourceRecord> = {}): SourceRecord {
  const active_version_id = overrides.active_version_id ?? 'version-1';
  const active_version_number = overrides.active_version_number ?? 1;

  return {
    id: overrides.id ?? 'source-1',
    name: overrides.name ?? '来源一.txt',
    source_kind: overrides.source_kind ?? 'text',
    input_mode: overrides.input_mode ?? 'upload',
    file_type: overrides.file_type ?? 'txt',
    storage_path: overrides.storage_path ?? null,
    strategy: overrides.strategy ?? 'summary',
    status: overrides.status ?? 'ready',
    summary: overrides.summary ?? '默认来源摘要',
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? FIXTURE_TIME,
    updated_at: overrides.updated_at ?? FIXTURE_TIME,
    active_version_id,
    active_version_number,
    version_count: overrides.version_count ?? 1,
  };
}

export function create_source_detail_record(
  overrides: Partial<SourceDetailRecord> = {},
): SourceDetailRecord {
  const source = overrides.source ?? create_source_record();
  const selected_version =
    overrides.selected_version === undefined
      ? create_source_version_record({
          id: source.active_version_id ?? 'version-1',
          source_id: source.id,
          version_number: source.active_version_number ?? 1,
        })
      : overrides.selected_version;
  const versions =
    overrides.versions ??
    (selected_version
      ? [selected_version]
      : [
          create_source_version_record({
            id: source.active_version_id ?? 'version-1',
            source_id: source.id,
            version_number: source.active_version_number ?? 1,
          }),
        ]);

  return {
    source,
    paragraph_count: overrides.paragraph_count ?? 1,
    entity_count: overrides.entity_count ?? 1,
    relation_count: overrides.relation_count ?? 1,
    selected_version,
    versions,
  };
}

export function create_paragraph_record(overrides: Partial<ParagraphRecord> = {}): ParagraphRecord {
  return {
    id: overrides.id ?? 'paragraph-1',
    source_id: overrides.source_id ?? 'source-1',
    version_id: overrides.version_id ?? 'version-1',
    position: overrides.position ?? 0,
    content: overrides.content ?? '默认段落内容',
    knowledge_type: overrides.knowledge_type ?? 'text',
    token_count: overrides.token_count ?? 32,
    vector_state: overrides.vector_state ?? 'ready',
    metadata: overrides.metadata ?? {},
    render_kind: overrides.render_kind ?? 'text',
    rendered_html: overrides.rendered_html ?? null,
    render_metadata: overrides.render_metadata ?? {},
    created_at: overrides.created_at ?? FIXTURE_TIME,
    updated_at: overrides.updated_at ?? FIXTURE_TIME,
  };
}

export function create_answer_citation_record(
  overrides: Partial<AnswerCitationRecord> = {},
): AnswerCitationRecord {
  return {
    paragraph_id: overrides.paragraph_id ?? 'paragraph-1',
    chunk_id: overrides.chunk_id ?? null,
    source_id: overrides.source_id ?? 'source-1',
    version_id: overrides.version_id ?? 'version-1',
    source_name: overrides.source_name ?? '来源一.txt',
    file_path: overrides.file_path ?? null,
    excerpt: overrides.excerpt ?? '默认证据摘录',
    snippet: overrides.snippet ?? null,
    score: overrides.score ?? 0.82,
    match_reason: overrides.match_reason ?? '命中当前问题',
    matched_fields: overrides.matched_fields ?? [],
    source_kind: overrides.source_kind ?? 'text',
    worksheet_name: overrides.worksheet_name ?? null,
    worksheet_key: overrides.worksheet_key ?? null,
    row_index: overrides.row_index ?? null,
    anchor_row_index: overrides.anchor_row_index ?? overrides.row_index ?? null,
    page_number: overrides.page_number ?? 1,
    paragraph_position: overrides.paragraph_position ?? 0,
    winning_lane: overrides.winning_lane ?? 'fusion',
    start_offset: overrides.start_offset ?? null,
    end_offset: overrides.end_offset ?? null,
    anchor_node_ids: overrides.anchor_node_ids ?? [],
    preferred_anchor_node_id: overrides.preferred_anchor_node_id ?? null,
    render_kind: overrides.render_kind ?? 'text',
    rendered_html: overrides.rendered_html ?? null,
    render_metadata: overrides.render_metadata ?? {},
  };
}

export function create_worksheet_summary_record(
  overrides: Partial<WorksheetSummaryRecord> = {},
): WorksheetSummaryRecord {
  return {
    worksheet_key: overrides.worksheet_key ?? 'sheet-1',
    worksheet_name: overrides.worksheet_name ?? '工作表一',
    row_count: overrides.row_count ?? 12,
    headers: overrides.headers ?? ['名称', '值'],
    column_keys: overrides.column_keys ?? ['ming_cheng', 'zhi'],
  };
}

export function create_worksheet_preview_record(
  overrides: Partial<WorksheetPreviewRecord> = {},
): WorksheetPreviewRecord {
  const worksheet = create_worksheet_summary_record({
    worksheet_key: overrides.worksheet_key ?? 'sheet-1',
    worksheet_name: overrides.worksheet_name ?? '工作表一',
    headers: overrides.headers ?? ['名称', '值'],
    column_keys: overrides.column_keys ?? ['ming_cheng', 'zhi'],
  });
  return {
    source_id: overrides.source_id ?? 'source-1',
    version_id: overrides.version_id ?? 'version-1',
    worksheet_key: overrides.worksheet_key ?? worksheet.worksheet_key,
    worksheet_name: overrides.worksheet_name ?? worksheet.worksheet_name,
    headers: overrides.headers ?? worksheet.headers,
    column_keys: overrides.column_keys ?? worksheet.column_keys,
    items:
      overrides.items ??
      [
        {
          paragraph_id: 'paragraph-1',
          row_index: 3,
          record_key: 'row-3',
          cells: {
            [worksheet.column_keys[0] ?? 'ming_cheng']: '孙子兵法',
            [worksheet.column_keys[1] ?? 'zhi']: '支形',
          },
        },
      ],
    render_kind: 'worksheet_preview',
    rendered_html: overrides.rendered_html ?? '<div>worksheet preview</div>',
    render_metadata: overrides.render_metadata ?? {},
    page: overrides.page ?? 1,
    page_size: overrides.page_size ?? 40,
    total_rows: overrides.total_rows ?? 12,
    has_prev: overrides.has_prev ?? false,
    has_next: overrides.has_next ?? false,
    row_range_start: overrides.row_range_start ?? 1,
    row_range_end: overrides.row_range_end ?? 12,
    anchor_row_index: overrides.anchor_row_index ?? 3,
    highlighted_row_indexes: overrides.highlighted_row_indexes ?? [3],
    highlighted_columns: overrides.highlighted_columns ?? [worksheet.column_keys[1] ?? 'zhi'],
  };
}

export function create_graph_slice_fixture(
  overrides: Partial<KnowledgeBaseWorkspaceSlices['graph']> = {},
): KnowledgeBaseWorkspaceSlices['graph'] {
  const empty_graph: KnowledgeGraphRecord = { view: 'semantic', nodes: [], edges: [] };

  return {
    graph: overrides.graph ?? empty_graph,
    refresh_graph: overrides.refresh_graph ?? vi.fn(async () => {}),
    manual_relations: overrides.manual_relations ?? [],
    refresh_manual_relations: overrides.refresh_manual_relations ?? vi.fn(async () => {}),
    selected_source_ids: overrides.selected_source_ids ?? [],
    set_selected_source_ids: overrides.set_selected_source_ids ?? vi.fn(),
    graph_data_view: overrides.graph_data_view ?? 'semantic',
    set_graph_data_view: overrides.set_graph_data_view ?? vi.fn(),
    graph_anchor_node_ids: overrides.graph_anchor_node_ids ?? [],
    graph_anchor_edge_ids: overrides.graph_anchor_edge_ids ?? [],
    open_evidence_graph: overrides.open_evidence_graph ?? vi.fn(),
    density: overrides.density ?? 88,
    set_density: overrides.set_density ?? vi.fn(),
    selected_node_id: overrides.selected_node_id ?? null,
    set_selected_node_id: overrides.set_selected_node_id ?? vi.fn(),
    selected_edge_id: overrides.selected_edge_id ?? null,
    set_selected_edge_id: overrides.set_selected_edge_id ?? vi.fn(),
    node_detail: overrides.node_detail ?? null,
    edge_detail: overrides.edge_detail ?? null,
    is_node_detail_loading: overrides.is_node_detail_loading ?? false,
    is_edge_detail_loading: overrides.is_edge_detail_loading ?? false,
    request_node_detail: overrides.request_node_detail ?? vi.fn(),
    request_edge_detail: overrides.request_edge_detail ?? vi.fn(),
    clear_graph_details: overrides.clear_graph_details ?? vi.fn(),
    graph_error_message: overrides.graph_error_message ?? null,
    highlighted_node_ids: overrides.highlighted_node_ids ?? [],
    set_highlighted_node_ids: overrides.set_highlighted_node_ids ?? vi.fn(),
    highlighted_edge_ids: overrides.highlighted_edge_ids ?? [],
    set_highlighted_edge_ids: overrides.set_highlighted_edge_ids ?? vi.fn(),
    graph_focus_command: overrides.graph_focus_command ?? null,
    set_graph_focus_command: overrides.set_graph_focus_command ?? vi.fn(),
    is_graph_loading: overrides.is_graph_loading ?? false,
    is_creating_node: overrides.is_creating_node ?? false,
    is_creating_manual_relation: overrides.is_creating_manual_relation ?? false,
    is_renaming_node: overrides.is_renaming_node ?? false,
    is_deleting_node: overrides.is_deleting_node ?? false,
    is_deleting_edge: overrides.is_deleting_edge ?? false,
    create_entity: overrides.create_entity ?? vi.fn(async () => {}),
    create_relation: overrides.create_relation ?? vi.fn(async () => {}),
    remove_manual_relation: overrides.remove_manual_relation ?? vi.fn(async () => {}),
    rename_node: overrides.rename_node ?? vi.fn(async () => {}),
    delete_node: overrides.delete_node ?? vi.fn(async () => {}),
    delete_edge: overrides.delete_edge ?? vi.fn(async () => {}),
  };
}

export function create_query_slice_fixture(
  overrides: Partial<KnowledgeBaseWorkspaceSlices['query']> = {},
): KnowledgeBaseWorkspaceSlices['query'] {
  return {
    scope_mode: overrides.scope_mode ?? 'all',
    set_scope_mode: overrides.set_scope_mode ?? vi.fn(),
    scope_source_ids: overrides.scope_source_ids ?? [],
    set_scope_source_ids: overrides.set_scope_source_ids ?? vi.fn(),
    scope_version_id: overrides.scope_version_id ?? null,
    set_scope_version_id: overrides.set_scope_version_id ?? vi.fn(),
    excluded_source_ids: overrides.excluded_source_ids ?? [],
    toggle_scope_source_id: overrides.toggle_scope_source_id ?? vi.fn(),
    toggle_source_exclusion: overrides.toggle_source_exclusion ?? vi.fn(),
    clear_source_exclusions: overrides.clear_source_exclusions ?? vi.fn(),
    current_scope: overrides.current_scope ?? create_scope_record(),
    answer_sessions: overrides.answer_sessions ?? [],
    active_answer_session_id: overrides.active_answer_session_id ?? null,
    answer_messages: overrides.answer_messages ?? [],
    active_answer_message: overrides.active_answer_message ?? null,
    record_results: overrides.record_results ?? [],
    entity_results: overrides.entity_results ?? [],
    relation_results: overrides.relation_results ?? [],
    source_results: overrides.source_results ?? [],
    is_querying: overrides.is_querying ?? false,
    is_loading_answer_sessions: overrides.is_loading_answer_sessions ?? false,
    execute_query: overrides.execute_query ?? vi.fn(async () => {}),
    select_answer_session: overrides.select_answer_session ?? vi.fn(async () => {}),
    create_answer_session: overrides.create_answer_session ?? vi.fn(async () => {}),
  };
}

export function create_source_slice_fixture(
  overrides: Partial<KnowledgeBaseWorkspaceSlices['source']> = {},
): KnowledgeBaseWorkspaceSlices['source'] {
  const source = overrides.sources?.[0] ?? create_source_record();
  const detail =
    overrides.source_detail !== undefined
      ? overrides.source_detail
      : create_source_detail_record({ source });

  return {
    sources: overrides.sources ?? [source],
    refresh_sources: overrides.refresh_sources ?? vi.fn(async () => {}),
    update_source: overrides.update_source ?? vi.fn(async () => {}),
    delete_source: overrides.delete_source ?? vi.fn(async () => {}),
    selected_source_browser_id: overrides.selected_source_browser_id ?? source.id,
    set_selected_source_browser_id: overrides.set_selected_source_browser_id ?? vi.fn(),
    selected_source_version_id:
      overrides.selected_source_version_id ?? detail?.selected_version?.id ?? null,
    set_selected_source_version_id: overrides.set_selected_source_version_id ?? vi.fn(),
    source_detail: detail,
    source_versions: overrides.source_versions ?? detail?.versions ?? [],
    source_paragraphs:
      overrides.source_paragraphs ??
      [
        create_paragraph_record({
          source_id: source.id,
          version_id: detail?.selected_version?.id ?? detail?.versions[0]?.id ?? 'version-1',
        }),
      ],
    source_worksheets:
      overrides.source_worksheets ??
      [create_worksheet_summary_record()],
    worksheet_preview:
      overrides.worksheet_preview ??
      create_worksheet_preview_record({
        source_id: source.id,
        version_id: detail?.selected_version?.id ?? detail?.versions[0]?.id ?? 'version-1',
      }),
    selected_worksheet_key: overrides.selected_worksheet_key ?? 'sheet-1',
    set_selected_worksheet_key: overrides.set_selected_worksheet_key ?? vi.fn(),
    worksheet_page: overrides.worksheet_page ?? 1,
    set_worksheet_page: overrides.set_worksheet_page ?? vi.fn(),
    worksheet_page_size: overrides.worksheet_page_size ?? 40,
    set_worksheet_page_size: overrides.set_worksheet_page_size ?? vi.fn(),
    worksheet_anchor_row: overrides.worksheet_anchor_row ?? 3,
    set_worksheet_anchor_row: overrides.set_worksheet_anchor_row ?? vi.fn(),
    worksheet_highlighted_columns: overrides.worksheet_highlighted_columns ?? ['zhi'],
    set_worksheet_highlighted_columns: overrides.set_worksheet_highlighted_columns ?? vi.fn(),
    worksheet_preview_mode: overrides.worksheet_preview_mode ?? 'page',
    set_worksheet_preview_mode: overrides.set_worksheet_preview_mode ?? vi.fn(),
    open_source_worksheet_preview: overrides.open_source_worksheet_preview ?? vi.fn(),
    is_loading_source_worksheets: overrides.is_loading_source_worksheets ?? false,
    is_loading_worksheet_preview: overrides.is_loading_worksheet_preview ?? false,
    source_worksheets_error: overrides.source_worksheets_error ?? null,
    worksheet_preview_error: overrides.worksheet_preview_error ?? null,
    is_updating_source: overrides.is_updating_source ?? false,
    is_deleting_source: overrides.is_deleting_source ?? false,
  };
}

export function create_focus_slice_fixture(
  overrides: Partial<KnowledgeBaseWorkspaceSlices['focus']> = {},
): KnowledgeBaseWorkspaceSlices['focus'] {
  return {
    focus_entity: overrides.focus_entity ?? vi.fn(),
    focus_relation: overrides.focus_relation ?? vi.fn(),
    focus_source: overrides.focus_source ?? vi.fn(),
    focus_paragraph: overrides.focus_paragraph ?? vi.fn(),
    focus_citation: overrides.focus_citation ?? vi.fn(),
    clear_highlights: overrides.clear_highlights ?? vi.fn(),
    select_node: overrides.select_node ?? vi.fn(),
    select_edge: overrides.select_edge ?? vi.fn(),
    clear_graph_selection: overrides.clear_graph_selection ?? vi.fn(),
    clear_source_filters: overrides.clear_source_filters ?? vi.fn(),
    reset_graph_filters: overrides.reset_graph_filters ?? vi.fn(),
  };
}

export function create_ui_slice_fixture(
  overrides: Partial<KnowledgeBaseWorkspaceSlices['ui']> = {},
): KnowledgeBaseWorkspaceSlices['ui'] {
  return {
    active_workspace: overrides.active_workspace ?? 'chat',
    set_active_workspace: overrides.set_active_workspace ?? vi.fn(),
    query_mode: overrides.query_mode ?? 'answer',
    set_query_mode: overrides.set_query_mode ?? vi.fn(),
    last_query_text: overrides.last_query_text ?? '',
    set_last_query_text: overrides.set_last_query_text ?? vi.fn(),
    message: overrides.message ?? '',
    set_message: overrides.set_message ?? vi.fn(),
    error: overrides.error ?? null,
    set_error: overrides.set_error ?? vi.fn(),
    is_settings_open: overrides.is_settings_open ?? false,
    set_is_settings_open: overrides.set_is_settings_open ?? vi.fn(),
    is_source_library_open: overrides.is_source_library_open ?? false,
    set_is_source_library_open: overrides.set_is_source_library_open ?? vi.fn(),
    sidebar_collapsed: overrides.sidebar_collapsed ?? false,
    set_sidebar_collapsed: overrides.set_sidebar_collapsed ?? vi.fn(),
    sidebar_width: overrides.sidebar_width ?? 360,
    set_sidebar_width: overrides.set_sidebar_width ?? vi.fn(),
  };
}

export function create_import_slice_fixture(
  overrides: Partial<KnowledgeBaseWorkspaceSlices['imports']> = {},
): KnowledgeBaseWorkspaceSlices['imports'] {
  return {
    tasks: overrides.tasks ?? [],
    refresh_tasks: overrides.refresh_tasks ?? vi.fn(async () => {}),
    is_submitting_import: overrides.is_submitting_import ?? false,
    upload_files: overrides.upload_files ?? vi.fn(async () => {}),
    import_paste_text: overrides.import_paste_text ?? vi.fn(async () => {}),
    import_scan_path: overrides.import_scan_path ?? vi.fn(async () => {}),
    import_structured_payload: overrides.import_structured_payload ?? vi.fn(async () => {}),
    cancel_task: overrides.cancel_task ?? vi.fn(async () => {}),
    retry_task: overrides.retry_task ?? vi.fn(async () => {}),
  };
}

export function create_graph_node_detail_record(
  overrides: Partial<GraphNodeDetailRecord> = {},
): GraphNodeDetailRecord {
  return {
    node: overrides.node ?? {
      id: 'entity-1',
      type: 'entity',
      label: '默认节点',
      display_label: '默认节点',
      kind_label: '实体',
      size: 1,
      score: null,
      source_name: '来源一.txt',
      evidence_count: 1,
      metadata: {},
    },
    source: overrides.source ?? { id: 'source-1', name: '来源一.txt', summary: '默认来源摘要' },
    paragraphs: overrides.paragraphs ?? [],
    relations: overrides.relations ?? [],
  };
}

export function create_graph_edge_detail_record(
  overrides: Partial<GraphEdgeDetailRecord> = {},
): GraphEdgeDetailRecord {
  return {
    edge: overrides.edge ?? {
      id: 'edge-1',
      source: 'entity-1',
      target: 'entity-2',
      type: 'relation',
      label: '关联',
      display_label: '关联',
      weight: 0.9,
      metadata: {},
    },
    source: overrides.source ?? { id: 'source-1', name: '来源一.txt' },
    paragraph: overrides.paragraph ?? null,
  };
}
