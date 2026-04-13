/**
 * 问答与检索工作台状态切片。
 */

import {
  use_workspace_focus_context,
  use_workspace_query_context,
  use_workspace_ui_context,
} from '../../shared/context/knowledge_base_workspace_context';

export function use_query_studio() {
  const query = use_workspace_query_context();
  const focus = use_workspace_focus_context();
  const ui = use_workspace_ui_context();

  return {
    query_mode: ui.query_mode,
    set_query_mode: ui.set_query_mode,
    ...query,
    ...focus,
  };
}
