import type { FormEvent } from 'react';

import { PREDICATE_SUGGESTIONS } from '../../shared/config/ui_constants';
import type { KnowledgeGraphRecord, KnowledgeGraphNodeRecord } from '../../shared/types/knowledge_base_types';
import { DEFAULT_PREDICATE, node_option_label } from './graph_browser_utils';
import type { GraphBrowserRelationDraft } from './graph_browser_view_types';

interface GraphBrowserRelationDrawerProps {
  graph: KnowledgeGraphRecord;
  relation_draft: GraphBrowserRelationDraft;
  relation_node_options: KnowledgeGraphNodeRecord[];
  manual_relation_count: number;
  selected_node: KnowledgeGraphNodeRecord | null;
  is_creating_manual_relation: boolean;
  on_close: () => void;
  on_submit: (event: FormEvent<HTMLFormElement>) => void;
  on_assign_subject: () => void;
  on_assign_object: () => void;
  on_relation_draft_change: (next_draft: GraphBrowserRelationDraft | ((current: GraphBrowserRelationDraft) => GraphBrowserRelationDraft)) => void;
}

export function GraphBrowserRelationDrawer(props: GraphBrowserRelationDrawerProps) {
  const {
    graph,
    relation_draft,
    relation_node_options,
    manual_relation_count,
    selected_node,
    is_creating_manual_relation,
    on_close,
    on_submit,
    on_assign_subject,
    on_assign_object,
    on_relation_draft_change,
  } = props;

  return (
    <form className='kb-graph-form' onSubmit={on_submit}>
      <div className='kb-graph-drawer-head'>
        <div>
          <span className='kb-context-label'>补关系</span>
          <h3>实体到实体</h3>
          <p>手动补边仅允许实体与实体之间建立关系。</p>
        </div>
        <button className='kb-secondary-button' onClick={on_close} type='button'>
          关闭
        </button>
      </div>

      {selected_node?.type === 'entity' ? (
        <div className='kb-button-row'>
          <button className='kb-chip' onClick={on_assign_subject} type='button'>
            用当前节点作为起点
          </button>
          <button className='kb-chip' onClick={on_assign_object} type='button'>
            用当前节点作为终点
          </button>
        </div>
      ) : null}

      <label className='kb-form-field'>
        <span>起点实体</span>
        <select
          onChange={(event) =>
            on_relation_draft_change((current) => ({ ...current, subject_node_id: event.target.value }))
          }
          value={relation_draft.subject_node_id}
        >
          <option value=''>请选择起点实体</option>
          {relation_node_options.map((node) => (
            <option key={node.id} value={node.id}>
              {node_option_label(node.id, graph)}
            </option>
          ))}
        </select>
      </label>

      <label className='kb-form-field'>
        <span>关系谓词</span>
        <input
          list='kb-graph-predicate-options'
          onChange={(event) =>
            on_relation_draft_change((current) => ({ ...current, predicate: event.target.value }))
          }
          placeholder='例如：依赖 / 属于 / 引用'
          value={relation_draft.predicate}
        />
        <datalist id='kb-graph-predicate-options'>
          {[DEFAULT_PREDICATE, ...PREDICATE_SUGGESTIONS].map((predicate) => (
            <option key={predicate} value={predicate} />
          ))}
        </datalist>
      </label>

      <label className='kb-form-field'>
        <span>终点实体</span>
        <select
          onChange={(event) =>
            on_relation_draft_change((current) => ({ ...current, object_node_id: event.target.value }))
          }
          value={relation_draft.object_node_id}
        >
          <option value=''>请选择终点实体</option>
          {relation_node_options.map((node) => (
            <option key={node.id} value={node.id}>
              {node_option_label(node.id, graph)}
            </option>
          ))}
        </select>
      </label>

      <label className='kb-form-field'>
        <span>{`关系权重 ${relation_draft.weight.toFixed(2)}`}</span>
        <input
          max={1}
          min={0.1}
          onChange={(event) =>
            on_relation_draft_change((current) => ({ ...current, weight: Number(event.target.value) }))
          }
          step={0.05}
          type='range'
          value={relation_draft.weight}
        />
      </label>

      <div className='kb-helper-text'>{`当前共有 ${manual_relation_count} 条手工关系。`}</div>

      <div className='kb-button-row'>
        <button
          className='kb-primary-button'
          disabled={
            is_creating_manual_relation ||
            !relation_draft.subject_node_id ||
            !relation_draft.object_node_id ||
            !relation_draft.predicate.trim() ||
            relation_draft.subject_node_id === relation_draft.object_node_id
          }
          type='submit'
        >
          {is_creating_manual_relation ? '提交中…' : '创建关系'}
        </button>
      </div>
    </form>
  );
}
