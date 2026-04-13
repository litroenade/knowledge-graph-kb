import {
  use_workspace_focus_context,
  use_workspace_graph_context,
  use_workspace_source_context,
} from '../../shared/context/knowledge_base_workspace_context';

export function use_graph_browser() {
  const graph = use_workspace_graph_context();
  const source = use_workspace_source_context();
  const focus = use_workspace_focus_context();

  return {
    ...graph,
    sources: source.sources,
    select_node: focus.select_node,
    select_edge: focus.select_edge,
    clear_graph_selection: focus.clear_graph_selection,
    clear_highlights: focus.clear_highlights,
    reset_graph_filters: focus.reset_graph_filters,
    clear_source_filters: focus.clear_source_filters,
    focus_source: focus.focus_source,
    focus_paragraph: focus.focus_paragraph,
    focus_citation: focus.focus_citation,
  };
}
