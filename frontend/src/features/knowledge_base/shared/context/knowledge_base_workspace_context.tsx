/**
 * Workspace provider and typed context accessors.
 */

import { createContext, type ReactNode, useContext, useMemo } from 'react';

import {
  type KnowledgeBaseWorkspaceSlices,
  type KnowledgeBaseWorkspaceStore,
  use_knowledge_base_workspace_slices,
} from '../hooks/use_knowledge_base_workspace';

const KnowledgeBaseWorkspaceContext = createContext<KnowledgeBaseWorkspaceStore | null>(null);
const WorkspaceUiContext = createContext<KnowledgeBaseWorkspaceSlices['ui'] | null>(null);
const WorkspaceImportContext = createContext<KnowledgeBaseWorkspaceSlices['imports'] | null>(null);
const WorkspaceSourceContext = createContext<KnowledgeBaseWorkspaceSlices['source'] | null>(null);
const WorkspaceModelConfigContext = createContext<KnowledgeBaseWorkspaceSlices['model_config'] | null>(null);
const WorkspaceGraphContext = createContext<KnowledgeBaseWorkspaceSlices['graph'] | null>(null);
const WorkspaceQueryContext = createContext<KnowledgeBaseWorkspaceSlices['query'] | null>(null);
const WorkspaceFocusContext = createContext<KnowledgeBaseWorkspaceSlices['focus'] | null>(null);

interface KnowledgeBaseWorkspaceProviderProps {
  children: ReactNode;
}

function require_workspace_context(
  context: KnowledgeBaseWorkspaceStore | null,
  hook_name: string,
): KnowledgeBaseWorkspaceStore {
  if (context === null) {
    throw new Error(`${hook_name} must be used within KnowledgeBaseWorkspaceProvider`);
  }
  return context;
}

function select_ui_slice(workspace: KnowledgeBaseWorkspaceStore) {
  return {
    active_workspace: workspace.active_workspace,
    set_active_workspace: workspace.set_active_workspace,
    query_mode: workspace.query_mode,
    set_query_mode: workspace.set_query_mode,
    last_query_text: workspace.last_query_text,
    set_last_query_text: workspace.set_last_query_text,
    message: workspace.message,
    set_message: workspace.set_message,
    error: workspace.error,
    set_error: workspace.set_error,
    is_settings_open: workspace.is_settings_open,
    set_is_settings_open: workspace.set_is_settings_open,
    is_source_library_open: workspace.is_source_library_open,
    set_is_source_library_open: workspace.set_is_source_library_open,
    sidebar_collapsed: workspace.sidebar_collapsed,
    set_sidebar_collapsed: workspace.set_sidebar_collapsed,
    sidebar_width: workspace.sidebar_width,
    set_sidebar_width: workspace.set_sidebar_width,
  };
}

function select_import_slice(workspace: KnowledgeBaseWorkspaceStore) {
  return {
    tasks: workspace.tasks,
    refresh_tasks: workspace.refresh_tasks,
    is_submitting_import: workspace.is_submitting_import,
    upload_files: workspace.upload_files,
    import_paste_text: workspace.import_paste_text,
    import_scan_path: workspace.import_scan_path,
    import_structured_payload: workspace.import_structured_payload,
    cancel_task: workspace.cancel_task,
    retry_task: workspace.retry_task,
  };
}

function select_source_slice(workspace: KnowledgeBaseWorkspaceStore) {
  return {
    sources: workspace.sources,
    browser_sources: workspace.browser_sources,
    refresh_sources: workspace.refresh_sources,
    update_source: workspace.update_source,
    delete_source: workspace.delete_source,
    selected_source_browser_id: workspace.selected_source_browser_id,
    set_selected_source_browser_id: workspace.set_selected_source_browser_id,
    selected_source_version_id: workspace.selected_source_version_id,
    set_selected_source_version_id: workspace.set_selected_source_version_id,
    source_detail: workspace.source_detail,
    source_versions: workspace.source_versions,
    source_paragraphs: workspace.source_paragraphs,
    source_worksheets: workspace.source_worksheets,
    worksheet_preview: workspace.worksheet_preview,
    selected_worksheet_key: workspace.selected_worksheet_key,
    set_selected_worksheet_key: workspace.set_selected_worksheet_key,
    worksheet_page: workspace.worksheet_page,
    set_worksheet_page: workspace.set_worksheet_page,
    worksheet_page_size: workspace.worksheet_page_size,
    set_worksheet_page_size: workspace.set_worksheet_page_size,
    worksheet_anchor_row: workspace.worksheet_anchor_row,
    set_worksheet_anchor_row: workspace.set_worksheet_anchor_row,
    worksheet_highlighted_columns: workspace.worksheet_highlighted_columns,
    set_worksheet_highlighted_columns: workspace.set_worksheet_highlighted_columns,
    worksheet_preview_mode: workspace.worksheet_preview_mode,
    set_worksheet_preview_mode: workspace.set_worksheet_preview_mode,
    open_source_worksheet_preview: workspace.open_source_worksheet_preview,
    is_loading_source_worksheets: workspace.is_loading_source_worksheets,
    is_loading_worksheet_preview: workspace.is_loading_worksheet_preview,
    source_worksheets_error: workspace.source_worksheets_error,
    worksheet_preview_error: workspace.worksheet_preview_error,
    is_updating_source: workspace.is_updating_source,
    is_deleting_source: workspace.is_deleting_source,
  };
}

function select_model_config_slice(workspace: KnowledgeBaseWorkspaceStore) {
  return {
    model_configuration: workspace.model_configuration,
    model_configuration_form: workspace.model_configuration_form,
    set_model_configuration_form: workspace.set_model_configuration_form,
    refresh_model_configuration: workspace.refresh_model_configuration,
    save_model_configuration: workspace.save_model_configuration,
    run_model_configuration_test: workspace.run_model_configuration_test,
    model_configuration_test_result: workspace.model_configuration_test_result,
    has_unsaved_model_config_changes: workspace.has_unsaved_model_config_changes,
    is_model_configuration_loading: workspace.is_model_configuration_loading,
    is_saving_model_configuration: workspace.is_saving_model_configuration,
    is_testing_model_configuration: workspace.is_testing_model_configuration,
  };
}

function select_graph_slice(workspace: KnowledgeBaseWorkspaceStore) {
  return {
    graph: workspace.graph,
    refresh_graph: workspace.refresh_graph,
    manual_relations: workspace.manual_relations,
    refresh_manual_relations: workspace.refresh_manual_relations,
    selected_source_ids: workspace.selected_source_ids,
    set_selected_source_ids: workspace.set_selected_source_ids,
    graph_data_view: workspace.graph_data_view,
    set_graph_data_view: workspace.set_graph_data_view,
    graph_anchor_node_ids: workspace.graph_anchor_node_ids,
    graph_anchor_edge_ids: workspace.graph_anchor_edge_ids,
    open_evidence_graph: workspace.open_evidence_graph,
    density: workspace.density,
    set_density: workspace.set_density,
    selected_node_id: workspace.selected_node_id,
    set_selected_node_id: workspace.set_selected_node_id,
    selected_edge_id: workspace.selected_edge_id,
    set_selected_edge_id: workspace.set_selected_edge_id,
    node_detail: workspace.node_detail,
    edge_detail: workspace.edge_detail,
    is_node_detail_loading: workspace.is_node_detail_loading,
    is_edge_detail_loading: workspace.is_edge_detail_loading,
    request_node_detail: workspace.request_node_detail,
    request_edge_detail: workspace.request_edge_detail,
    clear_graph_details: workspace.clear_graph_details,
    graph_error_message: workspace.graph_error_message,
    highlighted_node_ids: workspace.highlighted_node_ids,
    set_highlighted_node_ids: workspace.set_highlighted_node_ids,
    highlighted_edge_ids: workspace.highlighted_edge_ids,
    set_highlighted_edge_ids: workspace.set_highlighted_edge_ids,
    graph_focus_command: workspace.graph_focus_command,
    set_graph_focus_command: workspace.set_graph_focus_command,
    is_graph_loading: workspace.is_graph_loading,
    is_creating_node: workspace.is_creating_node,
    is_creating_manual_relation: workspace.is_creating_manual_relation,
    is_renaming_node: workspace.is_renaming_node,
    is_deleting_node: workspace.is_deleting_node,
    is_deleting_edge: workspace.is_deleting_edge,
    create_entity: workspace.create_entity,
    create_relation: workspace.create_relation,
    remove_manual_relation: workspace.remove_manual_relation,
    rename_node: workspace.rename_node,
    delete_node: workspace.delete_node,
    delete_edge: workspace.delete_edge,
  };
}

function select_query_slice(workspace: KnowledgeBaseWorkspaceStore) {
  return {
    scope_mode: workspace.scope_mode,
    set_scope_mode: workspace.set_scope_mode,
    scope_source_ids: workspace.scope_source_ids,
    set_scope_source_ids: workspace.set_scope_source_ids,
    scope_version_id: workspace.scope_version_id,
    set_scope_version_id: workspace.set_scope_version_id,
    excluded_source_ids: workspace.excluded_source_ids,
    toggle_scope_source_id: workspace.toggle_scope_source_id,
    toggle_source_exclusion: workspace.toggle_source_exclusion,
    clear_source_exclusions: workspace.clear_source_exclusions,
    current_scope: workspace.current_scope,
    answer_sessions: workspace.answer_sessions,
    active_answer_session_id: workspace.active_answer_session_id,
    answer_messages: workspace.answer_messages,
    active_answer_message: workspace.active_answer_message,
    record_results: workspace.record_results,
    entity_results: workspace.entity_results,
    relation_results: workspace.relation_results,
    source_results: workspace.source_results,
    is_querying: workspace.is_querying,
    is_loading_answer_sessions: workspace.is_loading_answer_sessions,
    execute_query: workspace.execute_query,
    select_answer_session: workspace.select_answer_session,
    create_answer_session: workspace.create_answer_session,
  };
}

function select_focus_slice(workspace: KnowledgeBaseWorkspaceStore) {
  return {
    focus_entity: workspace.focus_entity,
    focus_relation: workspace.focus_relation,
    focus_source: workspace.focus_source,
    focus_paragraph: workspace.focus_paragraph,
    focus_citation: workspace.focus_citation,
    clear_highlights: workspace.clear_highlights,
    select_node: workspace.select_node,
    select_edge: workspace.select_edge,
    clear_graph_selection: workspace.clear_graph_selection,
    clear_source_filters: workspace.clear_source_filters,
    reset_graph_filters: workspace.reset_graph_filters,
  };
}

export function KnowledgeBaseWorkspaceProvider(props: KnowledgeBaseWorkspaceProviderProps) {
  const { children } = props;
  const slices = use_knowledge_base_workspace_slices();
  const workspace = useMemo(
    () => ({
      ...slices.ui,
      ...slices.imports,
      ...slices.source,
      ...slices.model_config,
      ...slices.graph,
      ...slices.query,
      ...slices.focus,
    }),
    [slices],
  );

  return (
    <KnowledgeBaseWorkspaceContext.Provider value={workspace}>
      <WorkspaceUiContext.Provider value={slices.ui}>
        <WorkspaceImportContext.Provider value={slices.imports}>
          <WorkspaceSourceContext.Provider value={slices.source}>
            <WorkspaceModelConfigContext.Provider value={slices.model_config}>
              <WorkspaceGraphContext.Provider value={slices.graph}>
                <WorkspaceQueryContext.Provider value={slices.query}>
                  <WorkspaceFocusContext.Provider value={slices.focus}>
                    {children}
                  </WorkspaceFocusContext.Provider>
                </WorkspaceQueryContext.Provider>
              </WorkspaceGraphContext.Provider>
            </WorkspaceModelConfigContext.Provider>
          </WorkspaceSourceContext.Provider>
        </WorkspaceImportContext.Provider>
      </WorkspaceUiContext.Provider>
    </KnowledgeBaseWorkspaceContext.Provider>
  );
}

export function use_knowledge_base_workspace_context(): KnowledgeBaseWorkspaceStore {
  return require_workspace_context(
    useContext(KnowledgeBaseWorkspaceContext),
    'use_knowledge_base_workspace_context',
  );
}

export function use_workspace_ui_context(): KnowledgeBaseWorkspaceSlices['ui'] {
  const context = useContext(WorkspaceUiContext);
  if (context) {
    return context;
  }
  return select_ui_slice(use_knowledge_base_workspace_context());
}

export function use_workspace_import_context(): KnowledgeBaseWorkspaceSlices['imports'] {
  const context = useContext(WorkspaceImportContext);
  if (context) {
    return context;
  }
  return select_import_slice(use_knowledge_base_workspace_context());
}

export function use_workspace_source_context(): KnowledgeBaseWorkspaceSlices['source'] {
  const context = useContext(WorkspaceSourceContext);
  if (context) {
    return context;
  }
  return select_source_slice(use_knowledge_base_workspace_context());
}

export function use_workspace_model_config_context(): KnowledgeBaseWorkspaceSlices['model_config'] {
  const context = useContext(WorkspaceModelConfigContext);
  if (context) {
    return context;
  }
  return select_model_config_slice(use_knowledge_base_workspace_context());
}

export function use_workspace_graph_context(): KnowledgeBaseWorkspaceSlices['graph'] {
  const context = useContext(WorkspaceGraphContext);
  if (context) {
    return context;
  }
  return select_graph_slice(use_knowledge_base_workspace_context());
}

export function use_workspace_query_context(): KnowledgeBaseWorkspaceSlices['query'] {
  const context = useContext(WorkspaceQueryContext);
  if (context) {
    return context;
  }
  return select_query_slice(use_knowledge_base_workspace_context());
}

export function use_workspace_focus_context(): KnowledgeBaseWorkspaceSlices['focus'] {
  const context = useContext(WorkspaceFocusContext);
  if (context) {
    return context;
  }
  return select_focus_slice(use_knowledge_base_workspace_context());
}
