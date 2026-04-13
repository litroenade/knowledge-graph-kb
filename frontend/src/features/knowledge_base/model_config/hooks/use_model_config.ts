/**
 * 模型配置状态切片。
 */

import { use_workspace_model_config_context } from '../../shared/context/knowledge_base_workspace_context';

export function use_model_config() {
  return use_workspace_model_config_context();
}
