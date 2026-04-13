import type { FormEvent, ReactNode } from 'react';

import type {
  GraphEdgeDetailRecord,
  GraphNodeDetailRecord,
  KnowledgeGraphNodeRecord,
} from '../../shared/types/knowledge_base_types';
import { JsonDetails, MetadataRows } from './graph_browser_detail_blocks';
import type { PreviewCardRecord } from './graph_browser_view_types';

interface NodeActionCopy {
  rename_allowed: boolean;
  relation_allowed: boolean;
  delete_allowed: boolean;
  delete_label: string;
}

interface EdgeActionCopy {
  copy_allowed: boolean;
  delete_allowed: boolean;
}

interface GraphBrowserInspectorProps {
  inspector_open: boolean;
  node_detail: GraphNodeDetailRecord | null;
  edge_detail: GraphEdgeDetailRecord | null;
  selected_edge_source_label: string;
  selected_edge_target_label: string;
  node_kind_label: (node: KnowledgeGraphNodeRecord) => string;
  summary_value: (value: string | number | null | undefined, fallback?: string) => string;
  current_paragraph_label: string | null;
  evidence_layer_active: boolean;
  node_source_label: string;
  selected_node_copy: NodeActionCopy | null;
  selected_edge_copy: EdgeActionCopy | null;
  selected_node_rows: [string, string][];
  selected_edge_rows: [string, string][];
  node_relation_previews: PreviewCardRecord[];
  node_paragraph_previews: PreviewCardRecord[];
  node_source_previews: PreviewCardRecord[];
  edge_paragraph_preview: PreviewCardRecord | null;
  edge_source_preview: PreviewCardRecord | null;
  rename_value: string;
  is_renaming_node: boolean;
  is_deleting_node: boolean;
  is_deleting_edge: boolean;
  on_close: () => void;
  on_open_evidence_entry: () => void;
  on_rename_value_change: (value: string) => void;
  on_submit_rename: (event: FormEvent<HTMLFormElement>) => void;
  on_assign_subject: () => void;
  on_assign_object: () => void;
  on_start_relation_from_current_node: () => void;
  on_focus_selected: () => void;
  on_clear_highlights: () => void;
  on_clear_selection: () => void;
  on_delete_selected_node: () => void;
  on_delete_selected_edge: () => void;
  on_copy_edge_to_relation_form: () => void;
  on_focus_evidence_paragraph: (paragraph_id: string) => void;
  on_open_evidence_source: (source_id: string) => void;
  on_highlight_current_evidence: (source_id?: string | null, paragraph_id?: string | null) => void;
}

interface PreviewListProps {
  title: string;
  items: PreviewCardRecord[];
  empty_label: string;
  render_actions?: (item: PreviewCardRecord) => ReactNode;
}

function to_record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function PreviewList(props: PreviewListProps) {
  const { title, items, empty_label, render_actions } = props;

  return (
    <section className='kb-graph-summary-card'>
      <strong>{title}</strong>
      {items.length ? (
        <div className='kb-graph-summary-preview-list'>
          {items.map((item) => (
            <div className='kb-graph-summary-preview' key={item.key}>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
              {render_actions ? <div className='kb-button-row kb-graph-action-grid'>{render_actions(item)}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className='kb-graph-summary-item'>
          <span>{empty_label}</span>
        </div>
      )}
    </section>
  );
}

export function GraphBrowserInspector(props: GraphBrowserInspectorProps) {
  const {
    inspector_open,
    node_detail,
    edge_detail,
    selected_edge_source_label,
    selected_edge_target_label,
    node_kind_label,
    summary_value,
    current_paragraph_label,
    evidence_layer_active,
    node_source_label,
    selected_node_copy,
    selected_edge_copy,
    selected_node_rows,
    selected_edge_rows,
    node_relation_previews,
    node_paragraph_previews,
    node_source_previews,
    edge_paragraph_preview,
    edge_source_preview,
    rename_value,
    is_renaming_node,
    is_deleting_node,
    is_deleting_edge,
    on_close,
    on_open_evidence_entry,
    on_rename_value_change,
    on_submit_rename,
    on_assign_subject,
    on_assign_object,
    on_start_relation_from_current_node,
    on_focus_selected,
    on_clear_highlights,
    on_clear_selection,
    on_delete_selected_node,
    on_delete_selected_edge,
    on_copy_edge_to_relation_form,
    on_focus_evidence_paragraph,
    on_open_evidence_source,
    on_highlight_current_evidence,
  } = props;

  if (!inspector_open) {
    return null;
  }

  if (!node_detail && !edge_detail) {
    return (
      <div className='kb-graph-drawer-loading'>
        <span className='kb-context-label'>属性面板</span>
        <strong>正在加载详情...</strong>
        <span className='kb-helper-text'>详情会跟随当前选中的节点或关系切换。</span>
      </div>
    );
  }

  if (node_detail) {
    const node = node_detail.node;
    return (
      <div className='kb-graph-inspector-content'>
        <div className='kb-graph-drawer-head'>
          <div>
            <span className='kb-context-label'>节点</span>
            <h3>{node.display_label ?? node.label}</h3>
            <p>{node_kind_label(node)}</p>
          </div>
          <button className='kb-secondary-button' onClick={on_close} type='button'>
            关闭
          </button>
        </div>

        <div className='kb-graph-summary-grid'>
          <section className='kb-graph-summary-card'>
            <strong>节点摘要</strong>
            <div className='kb-graph-summary-list'>
              <div className='kb-graph-summary-item'>
                <span>类型</span>
                <strong>{node_kind_label(node)}</strong>
              </div>
              <div className='kb-graph-summary-item'>
                <span>来源</span>
                <strong>{node_source_label}</strong>
              </div>
              <div className='kb-graph-summary-item'>
                <span>段落</span>
                <strong>{node_detail.paragraphs.length}</strong>
              </div>
              <div className='kb-graph-summary-item'>
                <span>关系</span>
                <strong>{node_detail.relations.length}</strong>
              </div>
            </div>
          </section>

          <section className='kb-graph-summary-card'>
            <strong>证据入口</strong>
            <div className='kb-graph-summary-list'>
              <div className='kb-graph-summary-item'>
                <span>证据子图</span>
                <strong>{evidence_layer_active ? '已打开' : '未打开'}</strong>
              </div>
              {current_paragraph_label ? (
                <div className='kb-graph-summary-item'>
                  <span>当前段落</span>
                  <strong>{current_paragraph_label}</strong>
                </div>
              ) : null}
            </div>
            <div className='kb-button-row kb-graph-action-grid'>
              <button className='kb-secondary-button' onClick={on_open_evidence_entry} type='button'>
                打开证据子图
              </button>
              <button className='kb-secondary-button' onClick={on_focus_selected} type='button'>
                聚焦当前选择
              </button>
            </div>
          </section>
        </div>

        {selected_node_copy?.rename_allowed ? (
          <form className='kb-graph-inline-form' onSubmit={on_submit_rename}>
            <input
              onChange={(event) => on_rename_value_change(event.target.value)}
              placeholder='重命名节点'
              value={rename_value}
            />
            <button className='kb-secondary-button' disabled={is_renaming_node || !rename_value.trim()} type='submit'>
              {is_renaming_node ? '保存中...' : '保存名称'}
            </button>
          </form>
        ) : null}

        <section className='kb-graph-summary-card'>
          <strong>操作</strong>
          <div className='kb-button-row kb-graph-action-grid'>
            {selected_node_copy?.relation_allowed ? (
              <>
                <button className='kb-secondary-button' onClick={on_assign_subject} type='button'>
                  设为主语
                </button>
                <button className='kb-secondary-button' onClick={on_assign_object} type='button'>
                  设为宾语
                </button>
                <button className='kb-secondary-button' onClick={on_start_relation_from_current_node} type='button'>
                  新建关系
                </button>
              </>
            ) : null}
            <button className='kb-secondary-button' onClick={on_clear_highlights} type='button'>
              清除高亮
            </button>
            <button className='kb-secondary-button' onClick={on_clear_selection} type='button'>
              清除选择
            </button>
            {selected_node_copy?.delete_allowed ? (
              <button className='kb-danger-button' disabled={is_deleting_node} onClick={on_delete_selected_node} type='button'>
                {is_deleting_node ? '删除中...' : selected_node_copy.delete_label || '删除节点'}
              </button>
            ) : null}
          </div>
        </section>

        <PreviewList
          empty_label='暂无来源预览。'
          items={node_source_previews}
          render_actions={(item) => (
            <>
              {item.source_id ? (
                <button
                  className='kb-secondary-button'
                  onClick={() => on_open_evidence_source(item.source_id!)}
                  type='button'
                >
                  在来源中查看
                </button>
              ) : null}
              {(item.source_id || item.paragraph_id) ? (
                <button
                  className='kb-secondary-button'
                  onClick={() => on_highlight_current_evidence(item.source_id ?? null, item.paragraph_id ?? null)}
                  type='button'
                >
                  在图谱中高亮当前证据
                </button>
              ) : null}
            </>
          )}
          title='来源'
        />
        <PreviewList
          empty_label='暂无段落预览。'
          items={node_paragraph_previews}
          render_actions={(item) => (
            <>
              {item.paragraph_id ? (
                <button
                  className='kb-secondary-button'
                  onClick={() => on_focus_evidence_paragraph(item.paragraph_id!)}
                  type='button'
                >
                  定位段落
                </button>
              ) : null}
              {(item.source_id || item.paragraph_id) ? (
                <button
                  className='kb-secondary-button'
                  onClick={() => on_highlight_current_evidence(item.source_id ?? null, item.paragraph_id ?? null)}
                  type='button'
                >
                  在图谱中高亮当前证据
                </button>
              ) : null}
            </>
          )}
          title='段落'
        />
        <PreviewList
          empty_label='暂无关系预览。'
          items={node_relation_previews}
          title='关系'
        />

        <MetadataRows rows={selected_node_rows} />
        <JsonDetails title='节点元数据' value={to_record(node.metadata)} />
        <JsonDetails title='来源载荷' value={to_record(node_detail.source)} />
      </div>
    );
  }

  if (!edge_detail) {
    return null;
  }

  const edge = edge_detail.edge;
  const edgeParagraphs = edge_paragraph_preview ? [edge_paragraph_preview] : [];
  const edgeSources = edge_source_preview ? [edge_source_preview] : [];

  return (
    <div className='kb-graph-inspector-content'>
      <div className='kb-graph-drawer-head'>
        <div>
          <span className='kb-context-label'>关系</span>
          <h3>{edge.display_label ?? edge.label}</h3>
          <p>
            {selected_edge_source_label} -&gt; {selected_edge_target_label}
          </p>
        </div>
        <button className='kb-secondary-button' onClick={on_close} type='button'>
          关闭
        </button>
      </div>

      <div className='kb-graph-summary-grid'>
        <section className='kb-graph-summary-card'>
          <strong>关系摘要</strong>
          <div className='kb-graph-summary-list'>
            <div className='kb-graph-summary-item'>
              <span>类型</span>
              <strong>{summary_value(edge.relation_kind_label, edge.type)}</strong>
            </div>
            <div className='kb-graph-summary-item'>
              <span>权重</span>
              <strong>{summary_value(edge.weight, '-')}</strong>
            </div>
            <div className='kb-graph-summary-item'>
              <span>起点</span>
              <strong>{selected_edge_source_label}</strong>
            </div>
            <div className='kb-graph-summary-item'>
              <span>终点</span>
              <strong>{selected_edge_target_label}</strong>
            </div>
          </div>
        </section>

        <section className='kb-graph-summary-card'>
          <strong>证据入口</strong>
          <div className='kb-graph-summary-list'>
            <div className='kb-graph-summary-item'>
              <span>证据子图</span>
              <strong>{evidence_layer_active ? '已打开' : '未打开'}</strong>
            </div>
            {current_paragraph_label ? (
              <div className='kb-graph-summary-item'>
                <span>当前段落</span>
                <strong>{current_paragraph_label}</strong>
              </div>
            ) : null}
          </div>
          <div className='kb-button-row kb-graph-action-grid'>
            <button className='kb-secondary-button' onClick={on_open_evidence_entry} type='button'>
              打开证据子图
            </button>
            <button className='kb-secondary-button' onClick={on_focus_selected} type='button'>
              聚焦当前选择
            </button>
          </div>
        </section>
      </div>

      <section className='kb-graph-summary-card'>
        <strong>操作</strong>
        <div className='kb-button-row kb-graph-action-grid'>
          {selected_edge_copy?.copy_allowed ? (
            <button className='kb-secondary-button' onClick={on_copy_edge_to_relation_form} type='button'>
              复制到关系表单
            </button>
          ) : null}
          <button className='kb-secondary-button' onClick={on_clear_highlights} type='button'>
            清除高亮
          </button>
          <button className='kb-secondary-button' onClick={on_clear_selection} type='button'>
            清除选择
          </button>
          {selected_edge_copy?.delete_allowed ? (
            <button className='kb-danger-button' disabled={is_deleting_edge} onClick={on_delete_selected_edge} type='button'>
              {is_deleting_edge ? '删除中...' : '删除关系'}
            </button>
          ) : null}
        </div>
      </section>

      <PreviewList
        empty_label='暂无来源预览。'
        items={edgeSources}
        render_actions={(item) => (
          <>
            {item.source_id ? (
              <button
                className='kb-secondary-button'
                onClick={() => on_open_evidence_source(item.source_id!)}
                type='button'
              >
                在来源中查看
              </button>
            ) : null}
            {(item.source_id || item.paragraph_id) ? (
              <button
                className='kb-secondary-button'
                onClick={() => on_highlight_current_evidence(item.source_id ?? null, item.paragraph_id ?? null)}
                type='button'
              >
                在图谱中高亮当前证据
              </button>
            ) : null}
          </>
        )}
        title='来源'
      />
      <PreviewList
        empty_label='暂无段落预览。'
        items={edgeParagraphs}
        render_actions={(item) => (
          <>
            {item.paragraph_id ? (
              <button
                className='kb-secondary-button'
                onClick={() => on_focus_evidence_paragraph(item.paragraph_id!)}
                type='button'
              >
                定位段落
              </button>
            ) : null}
            {(item.source_id || item.paragraph_id) ? (
              <button
                className='kb-secondary-button'
                onClick={() => on_highlight_current_evidence(item.source_id ?? null, item.paragraph_id ?? null)}
                type='button'
              >
                在图谱中高亮当前证据
              </button>
            ) : null}
          </>
        )}
        title='段落'
      />

      <MetadataRows rows={selected_edge_rows} />
      <JsonDetails title='关系元数据' value={to_record(edge.metadata)} />
      <JsonDetails title='来源载荷' value={to_record(edge_detail.source)} />
      <JsonDetails title='段落载荷' value={to_record(edge_detail.paragraph)} />
    </div>
  );
}
