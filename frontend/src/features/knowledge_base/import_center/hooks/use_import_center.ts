/**
 * 导入中心状态切片。
 */

import { use_workspace_import_context } from '../../shared/context/knowledge_base_workspace_context';

export function use_import_center() {
  return use_workspace_import_context();
}
