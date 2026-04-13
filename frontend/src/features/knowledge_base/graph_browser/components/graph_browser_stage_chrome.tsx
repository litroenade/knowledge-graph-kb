interface GraphBrowserCompactSelection {
  title: string;
  subtitle: string;
  summary: string;
}

interface GraphBrowserStageChromeProps {
  show_status?: boolean;
  focus_label: string;
  paragraph_label: string | null;
  current_view_label: string;
  layer_summary_label: string;
  show_source_anchor_legend: boolean;
  show_provenance_legend: boolean;
  compact_selection?: GraphBrowserCompactSelection | null;
  on_open_details?: (() => void) | null;
  on_focus_selected?: (() => void) | null;
  on_clear_selection?: (() => void) | null;
}

export function GraphBrowserStageChrome(props: GraphBrowserStageChromeProps) {
  const {
    show_status,
    focus_label,
    paragraph_label,
    current_view_label,
    layer_summary_label,
    show_source_anchor_legend,
    show_provenance_legend,
    compact_selection,
    on_open_details,
    on_focus_selected,
    on_clear_selection,
  } = props;
  const is_default_view = current_view_label === '全局浏览' && layer_summary_label === '语义图谱';
  const focus_pills = [
    current_view_label !== '全局浏览' ? current_view_label : null,
    layer_summary_label !== '语义图谱' ? layer_summary_label : null,
  ].filter(Boolean) as string[];
  const show_compact_selection = Boolean(compact_selection);
  const should_show_status =
    show_status ??
    Boolean(
      compact_selection ||
        paragraph_label ||
        current_view_label !== '全局浏览' ||
        layer_summary_label !== '语义图谱' ||
        !focus_label.includes('全局图'),
    );

  return (
    <>
      {should_show_status ? (
        <section className={`kb-graph-stage-status ${show_compact_selection ? '' : 'is-minimal'}`.trim()}>
          <span className='kb-context-label'>{show_compact_selection ? '当前选中' : '阅读状态'}</span>
          {show_compact_selection ? null : paragraph_label ? (
            <span className='kb-helper-text'>{paragraph_label}</span>
          ) : null}

          {compact_selection ? (
            <div className='kb-graph-stage-focus-card'>
              <strong>{compact_selection.title}</strong>
              <span>{compact_selection.subtitle}</span>
              <span className='kb-helper-text'>{compact_selection.summary}</span>
              <div className='kb-button-row'>
                {on_open_details ? (
                  <button className='kb-secondary-button' onClick={on_open_details} type='button'>
                    {'\u67e5\u770b\u8be6\u60c5'}
                  </button>
                ) : null}
                {on_focus_selected ? (
                  <button className='kb-secondary-button' onClick={on_focus_selected} type='button'>
                    {'\u805a\u7126'}
                  </button>
                ) : null}
                {on_clear_selection ? (
                  <button className='kb-secondary-button' onClick={on_clear_selection} type='button'>
                    {'\u6e05\u9664'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!is_default_view && focus_pills.length ? (
            <div className='kb-meta-strip kb-graph-stage-status-meta'>
              {focus_pills.map((item) => (
                <span className='kb-meta-pill' key={item}>
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className='kb-graph-stage-legend'>
        <span className='kb-graph-legend-item'>
          <i className='is-entity' />
          实体节点
        </span>
        <span className='kb-graph-legend-item'>
          <i className='is-edge' />
          语义关系
        </span>
        {show_source_anchor_legend ? (
          <span className='kb-graph-legend-item'>
            <i className='is-source' />
            来源锚点
          </span>
        ) : null}
        {show_provenance_legend ? (
          <span className='kb-graph-legend-item'>
            <i className='is-source' />
            来源连接
          </span>
        ) : null}
      </div>
    </>
  );
}
