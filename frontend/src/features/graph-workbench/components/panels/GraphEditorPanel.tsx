import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  create_graph_node,
  create_manual_relation,
  delete_graph_edge,
  delete_graph_node,
  delete_manual_relation,
  fetch_manual_relations,
  rename_graph_node,
} from '../../../../shared/api/kb';
import type { KnowledgeGraph, ManualRelationItem, SourceItem } from '../../../../shared/types/kb';
import type { RenderEdge, RenderNode } from '../../model/graphModel';
import { format_date } from './formatters';

interface GraphEditorPanelProps {
  graph: KnowledgeGraph;
  sources: SourceItem[];
  selected_node: RenderNode | null;
  selected_edge: RenderEdge | null;
  on_mutation: () => Promise<void>;
  on_select_node: (node_id: string) => void;
}

export function GraphEditorPanel(props: GraphEditorPanelProps) {
  const [new_label, set_new_label] = useState('');
  const [new_description, set_new_description] = useState('');
  const [new_source_id, set_new_source_id] = useState('');
  const [rename_label, set_rename_label] = useState('');
  const [relation_source, set_relation_source] = useState('');
  const [relation_predicate, set_relation_predicate] = useState('');
  const [relation_target, set_relation_target] = useState('');
  const [relation_weight, set_relation_weight] = useState(1);
  const [manual_relations, set_manual_relations] = useState<ManualRelationItem[]>([]);
  const [busy, set_busy] = useState(false);
  const [message, set_message] = useState<string | null>(null);

  const nodes = useMemo(
    () => props.graph.nodes.slice().sort((left, right) => left.label.localeCompare(right.label)),
    [props.graph.nodes],
  );

  const load_manual_relations = useCallback(async () => {
    const relations = await fetch_manual_relations();
    set_manual_relations(relations);
  }, []);

  useEffect(() => {
    void load_manual_relations().catch((error) => set_message((error as Error).message));
  }, [load_manual_relations]);

  useEffect(() => {
    if (props.selected_node) {
      set_rename_label(props.selected_node.display_name);
      set_relation_source(props.selected_node.id);
    }
  }, [props.selected_node]);

  async function run_mutation(action: () => Promise<unknown>, success: string): Promise<void> {
    set_busy(true);
    set_message(null);
    try {
      await action();
      set_message(success);
      await load_manual_relations();
      await props.on_mutation();
    } catch (error) {
      set_message((error as Error).message);
    } finally {
      set_busy(false);
    }
  }

  async function submit_node(): Promise<void> {
    const label = new_label.trim();
    if (!label) {
      set_message('节点名称不能为空。');
      return;
    }
    await run_mutation(
      () => create_graph_node({
        label,
        description: new_description.trim(),
        source_id: new_source_id || null,
        metadata: {},
      }),
      '节点已创建。',
    );
    set_new_label('');
    set_new_description('');
  }

  async function submit_rename(): Promise<void> {
    const selected_node = props.selected_node;
    if (!selected_node) {
      set_message('请先选择一个节点。');
      return;
    }
    const label = rename_label.trim();
    if (!label) {
      set_message('新名称不能为空。');
      return;
    }
    await run_mutation(() => rename_graph_node(selected_node.id, label), '节点已重命名。');
  }

  async function submit_delete_node(): Promise<void> {
    const selected_node = props.selected_node;
    if (!selected_node) {
      return;
    }
    if (!window.confirm(`确认删除节点「${selected_node.display_name}」？`)) {
      return;
    }
    await run_mutation(() => delete_graph_node(selected_node.id), '节点已删除。');
  }

  async function submit_delete_edge(): Promise<void> {
    const selected_edge = props.selected_edge;
    if (!selected_edge) {
      return;
    }
    if (!window.confirm(`确认删除关系「${selected_edge.display_name}」？`)) {
      return;
    }
    await run_mutation(() => delete_graph_edge(selected_edge.id), '关系已删除。');
  }

  async function submit_relation(): Promise<void> {
    if (!relation_source || !relation_target || !relation_predicate.trim()) {
      set_message('手工关系需要起点、谓词和终点。');
      return;
    }
    await run_mutation(
      () => create_manual_relation({
        subject_node_id: relation_source,
        predicate: relation_predicate.trim(),
        object_node_id: relation_target,
        weight: relation_weight,
        metadata: {},
      }),
      '手工关系已创建。',
    );
    set_relation_predicate('');
  }

  async function remove_manual_relation(relation_id: string): Promise<void> {
    await run_mutation(() => delete_manual_relation(relation_id), '手工关系已删除。');
  }

  return (
    <section className='panel-body editor-panel'>
      <div className='section-heading'>
        <span>节点 / 关系编辑</span>
        <button disabled={busy} onClick={() => void load_manual_relations()} type='button'>刷新</button>
      </div>

      <div className='stacked-tool'>
        <strong>新增节点</strong>
        <label className='field'>
          <span>名称</span>
          <input onChange={(event) => set_new_label(event.target.value)} value={new_label} />
        </label>
        <label className='field'>
          <span>描述</span>
          <textarea onChange={(event) => set_new_description(event.target.value)} rows={3} value={new_description} />
        </label>
        <label className='field'>
          <span>来源绑定</span>
          <select onChange={(event) => set_new_source_id(event.target.value)} value={new_source_id}>
            <option value=''>不绑定来源</option>
            {props.sources.map((source) => (
              <option key={source.id} value={source.id}>{source.name}</option>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={() => void submit_node()} type='button'>创建节点</button>
      </div>

      <div className='stacked-tool'>
        <strong>当前选中</strong>
        <p className='muted'>
          {props.selected_node ? `节点：${props.selected_node.display_name}` : props.selected_edge ? `关系：${props.selected_edge.display_name}` : '未选择图谱元素'}
        </p>
        <label className='field'>
          <span>节点新名称</span>
          <input disabled={!props.selected_node} onChange={(event) => set_rename_label(event.target.value)} value={rename_label} />
        </label>
        <div className='button-row'>
          <button disabled={busy || !props.selected_node} onClick={() => void submit_rename()} type='button'>重命名节点</button>
          <button disabled={busy || !props.selected_node} onClick={() => void submit_delete_node()} type='button'>删除节点</button>
          <button disabled={busy || !props.selected_edge} onClick={() => void submit_delete_edge()} type='button'>删除关系</button>
        </div>
      </div>

      <div className='stacked-tool'>
        <strong>新增手工关系</strong>
        <div className='form-grid'>
          <label className='field'>
            <span>起点</span>
            <NodeSelect nodes={nodes} on_change={set_relation_source} value={relation_source} />
          </label>
          <label className='field'>
            <span>终点</span>
            <NodeSelect nodes={nodes} on_change={set_relation_target} value={relation_target} />
          </label>
        </div>
        <label className='field'>
          <span>谓词</span>
          <input onChange={(event) => set_relation_predicate(event.target.value)} placeholder='例如：依赖、属于、影响' value={relation_predicate} />
        </label>
        <label className='field'>
          <span>权重 {relation_weight.toFixed(1)}</span>
          <input max='5' min='0.1' onChange={(event) => set_relation_weight(Number(event.target.value))} step='0.1' type='range' value={relation_weight} />
        </label>
        <button disabled={busy} onClick={() => void submit_relation()} type='button'>创建手工关系</button>
      </div>

      <div className='relation-list'>
        <strong>手工关系</strong>
        {manual_relations.map((relation) => (
          <article className='relation-item' key={relation.id}>
            <button onClick={() => props.on_select_node(relation.subject_node_id)} type='button'>{relation.subject_node_id}</button>
            <span>{relation.predicate}</span>
            <button onClick={() => props.on_select_node(relation.object_node_id)} type='button'>{relation.object_node_id}</button>
            <small>{relation.weight.toFixed(1)} · {format_date(relation.updated_at)}</small>
            <button disabled={busy} onClick={() => void remove_manual_relation(relation.id)} type='button'>删除</button>
          </article>
        ))}
        {!manual_relations.length ? <p className='muted'>暂无手工关系。</p> : null}
      </div>

      {message ? <p className='inline-message'>{message}</p> : null}
    </section>
  );
}

function NodeSelect(props: {
  nodes: KnowledgeGraph['nodes'];
  value: string;
  on_change: (value: string) => void;
}) {
  return (
    <select onChange={(event) => props.on_change(event.target.value)} value={props.value}>
      <option value=''>选择节点</option>
      {props.nodes.map((node) => (
        <option key={node.id} value={node.id}>{node.display_label ?? node.label}</option>
      ))}
    </select>
  );
}
