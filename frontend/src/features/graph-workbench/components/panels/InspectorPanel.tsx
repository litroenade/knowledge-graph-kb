import type { GraphEdgeDetail, GraphNodeDetail } from '../../../../shared/types/kb';
import type { RenderEdge, RenderNode, Selection } from '../../model/graphModel';
import { DetailBlock, PreviewList } from './DetailBlocks';
import { preview_text } from './formatters';

interface InspectorPanelProps {
  selected: Selection;
  selected_node: RenderNode | null;
  selected_edge: RenderEdge | null;
  node_detail: GraphNodeDetail | null;
  edge_detail: GraphEdgeDetail | null;
  detail_notice: string | null;
  on_clear_selection: () => void;
}

export function InspectorPanel(props: InspectorPanelProps) {
  const {
    selected,
    selected_node,
    selected_edge,
    node_detail,
    edge_detail,
    detail_notice,
    on_clear_selection,
  } = props;

  return (
    <section className='inspector panel-body'>
      <div className='section-heading'>
        <span>检查器</span>
        {selected ? <button onClick={on_clear_selection} type='button'>清除</button> : null}
      </div>
      {!selected ? <p className='muted'>点击节点或关系查看属性；空白点击会清除焦点。</p> : null}
      {selected_node ? (
        <DetailBlock
          title={selected_node.display_name}
          rows={[
            ['类型', selected_node.kind_label ?? selected_node.type],
            ['连接数', String(selected_node.degree)],
            ['来源', selected_node.source_label ?? '无直接来源'],
            ['证据', String(selected_node.evidence_count ?? 0)],
          ]}
        />
      ) : null}
      {selected_edge ? (
        <DetailBlock
          title={selected_edge.display_name}
          rows={[
            ['起点', selected_edge.source_name_resolved],
            ['终点', selected_edge.target_name_resolved],
            ['类型', selected_edge.relation_kind_label ?? selected_edge.type],
            ['权重', String(selected_edge.weight)],
          ]}
        />
      ) : null}
      {node_detail ? (
        <PreviewList
          title='关联证据'
          items={node_detail.paragraphs.map((item, index) => preview_text(item, `证据段落 ${index + 1}`))}
        />
      ) : null}
      {edge_detail?.paragraph ? (
        <PreviewList title='关系证据' items={[preview_text(edge_detail.paragraph, '关系证据')]} />
      ) : null}
      {detail_notice ? <p className='inline-message'>{detail_notice}</p> : null}
      <div className='capability-note'>
        <strong>待后端开放</strong>
        <p>回收站、记忆强化/保护/冷冻、向量重建目前没有 HTTP 路由；前端不会伪造不可调用的操作。</p>
      </div>
    </section>
  );
}
