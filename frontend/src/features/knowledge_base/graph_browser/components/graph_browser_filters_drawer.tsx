import type { GraphDataView, SourceRecord } from '../../shared/types/knowledge_base_types';
import { DENSITY_PRESETS, format_source_display_name } from './graph_browser_utils';

interface GraphBrowserFiltersDrawerProps {
  source_scope_label: string;
  source_keyword: string;
  filtered_sources: SourceRecord[];
  sources: SourceRecord[];
  selected_source_ids: string[];
  graph_data_view: GraphDataView;
  density: number;
  on_close: () => void;
  on_source_keyword_change: (value: string) => void;
  on_toggle_source: (source_id: string) => void;
  on_select_graph_data_view: (view: Extract<GraphDataView, 'semantic' | 'structure'>) => void;
  on_set_density: (value: number) => void;
  on_clear_source_filters: () => void;
  on_reset_graph_filters: () => void;
}

export function GraphBrowserFiltersDrawer(props: GraphBrowserFiltersDrawerProps) {
  const {
    source_scope_label,
    source_keyword,
    filtered_sources,
    sources,
    selected_source_ids,
    graph_data_view,
    density,
    on_close,
    on_source_keyword_change,
    on_toggle_source,
    on_select_graph_data_view,
    on_set_density,
    on_clear_source_filters,
    on_reset_graph_filters,
  } = props;

  const active_view_summary =
    graph_data_view === 'structure'
      ? '结构图谱'
      : graph_data_view === 'evidence'
        ? '证据子图'
        : '语义图谱';

  const selected_scope_summary = selected_source_ids.length
    ? `已选 ${selected_source_ids.length} 个来源`
    : '当前查看全部来源';

  return (
    <>
      <div className='kb-graph-drawer-head'>
        <div>
          <span className='kb-context-label'>筛选与显示</span>
          <h3>图谱范围</h3>
          <p>{source_scope_label}</p>
        </div>
        <button className='kb-secondary-button' onClick={on_close} type='button'>
          关闭
        </button>
      </div>

      <section className='kb-graph-filter-summary'>
        <div className='kb-graph-filter-stat'>
          <span>来源范围</span>
          <strong>{selected_scope_summary}</strong>
        </div>
        <div className='kb-graph-filter-stat'>
          <span>图谱视图</span>
          <strong>{active_view_summary}</strong>
        </div>
        <div className='kb-graph-filter-stat'>
          <span>语义密度</span>
          <strong>{`${density}%`}</strong>
        </div>
      </section>

      <section className='kb-graph-filter-section'>
        <label className='kb-form-field'>
          <span>来源搜索</span>
          <input
            onChange={(event) => on_source_keyword_change(event.target.value)}
            placeholder='按名称、摘要或类型搜索来源'
            value={source_keyword}
          />
        </label>

        <div className='kb-button-row'>
          <button className='kb-secondary-button' onClick={on_clear_source_filters} type='button'>
            清空来源
          </button>
          <span className='kb-helper-text'>{`当前匹配 ${filtered_sources.length} 个来源`}</span>
        </div>

        <div className='kb-graph-source-list'>
          {filtered_sources.map((source) => (
            <label className='kb-graph-source-option' key={source.id}>
              <input
                checked={selected_source_ids.includes(source.id)}
                onChange={() => on_toggle_source(source.id)}
                type='checkbox'
              />
              <div>
                <strong>{format_source_display_name(source, sources)}</strong>
                <span>{source.summary || source.source_kind}</span>
              </div>
            </label>
          ))}
          {!filtered_sources.length ? <div className='kb-helper-text'>没有匹配的来源。</div> : null}
        </div>
      </section>

      <section className='kb-graph-filter-section kb-graph-form'>
        <strong>图谱视图</strong>

        <label className='kb-check-field'>
          <input
            checked={graph_data_view === 'semantic'}
            name='graph-data-view'
            onChange={() => on_select_graph_data_view('semantic')}
            type='radio'
          />
          <span>语义图谱</span>
        </label>

        <label className='kb-check-field'>
          <input
            checked={graph_data_view === 'structure'}
            name='graph-data-view'
            onChange={() => on_select_graph_data_view('structure')}
            type='radio'
          />
          <span>结构图谱</span>
        </label>

        {graph_data_view === 'evidence' ? (
          <span className='kb-helper-text'>证据子图只能从节点或关系详情中打开。</span>
        ) : null}
      </section>

      <section className='kb-graph-filter-section'>
        <label className='kb-form-field'>
          <span>{`语义密度 ${density}%`}</span>
          <input
            disabled={graph_data_view !== 'semantic'}
            max={100}
            min={12}
            onChange={(event) => on_set_density(Number(event.target.value))}
            type='range'
            value={density}
          />
        </label>

        <span className='kb-helper-text'>密度仅影响语义图谱；100% 表示完整语义图。</span>

        <div className='kb-button-row'>
          {DENSITY_PRESETS.map((value) => (
            <button className='kb-chip' key={value} onClick={() => on_set_density(value)} type='button'>
              {`${value}%`}
            </button>
          ))}
        </div>
      </section>

      <div className='kb-button-row'>
        <button className='kb-secondary-button' onClick={on_reset_graph_filters} type='button'>
          重置筛选
        </button>
      </div>
    </>
  );
}
