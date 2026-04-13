import { useRef, type FocusEvent, type FormEvent, type KeyboardEvent, type RefObject } from 'react';

import type { GraphViewMode } from '../../shared/types/knowledge_base_types';
import type { GraphSearchCandidateRecord } from './graph_browser_utils';

interface GraphBrowserToolbarProps {
  source_scope_label: string;
  visible_summary_label: string;
  graph_view_mode: GraphViewMode;
  can_enter_local_graph: boolean;
  has_focus_target: boolean;
  node_keyword: string;
  search_shell_ref: RefObject<HTMLDivElement>;
  search_results_visible: boolean;
  node_matches: GraphSearchCandidateRecord[];
  active_search_index: number;
  active_search_candidate: GraphSearchCandidateRecord | null;
  on_node_keyword_change: (value: string) => void;
  on_search_focus: () => void;
  on_search_key_down: (event: KeyboardEvent<HTMLInputElement>) => void;
  on_search_shell_blur: (event: FocusEvent<HTMLDivElement>) => void;
  on_choose_search_candidate: (candidate: GraphSearchCandidateRecord) => void;
  on_apply_search: (event: FormEvent<HTMLFormElement>) => void;
  on_open_filters: () => void;
  on_open_create_node: () => void;
  on_open_relation: () => void;
  on_enter_global_graph: () => void;
  on_enter_local_graph: () => void;
  on_refresh_graph: () => void;
  on_fit_all: () => void;
  on_focus_selected: () => void;
  on_zoom_in: () => void;
  on_zoom_out: () => void;
  on_relayout_graph: () => void;
}

export function GraphBrowserToolbar(props: GraphBrowserToolbarProps) {
  const {
    source_scope_label,
    visible_summary_label,
    graph_view_mode,
    can_enter_local_graph,
    has_focus_target,
    node_keyword,
    search_shell_ref,
    search_results_visible,
    node_matches,
    active_search_index,
    active_search_candidate,
    on_node_keyword_change,
    on_search_focus,
    on_search_key_down,
    on_search_shell_blur,
    on_choose_search_candidate,
    on_apply_search,
    on_open_filters,
    on_open_create_node,
    on_open_relation,
    on_enter_global_graph,
    on_enter_local_graph,
    on_refresh_graph,
    on_fit_all,
    on_focus_selected,
    on_zoom_in,
    on_zoom_out,
    on_relayout_graph,
  } = props;
  const edit_actions_ref = useRef<HTMLDetailsElement | null>(null);
  const more_actions_ref = useRef<HTMLDetailsElement | null>(null);

  function close_action_menus(): void {
    edit_actions_ref.current?.removeAttribute('open');
    more_actions_ref.current?.removeAttribute('open');
  }

  function run_menu_action(action: () => void): void {
    close_action_menus();
    action();
  }

  return (
    <section className='kb-graph-toolbar'>
      <div className='kb-graph-toolbar-row is-summary'>
        <div className='kb-graph-toolbar-copy'>
          <span className='kb-context-label'>知识图谱</span>
          <strong>语义主图</strong>
          <span className='kb-helper-text'>
            默认先阅读实体关系；证据和结构放到筛选抽屉与属性面板里下钻。
          </span>

          <div className='kb-graph-toolbar-meta'>
            <span className='kb-meta-pill'>{source_scope_label}</span>
            <span className='kb-meta-pill'>{visible_summary_label}</span>
          </div>
        </div>

        <div className='kb-graph-toolbar-primary-actions'>
          <button className='kb-secondary-button' onClick={on_open_filters} type='button'>
            筛选与显示
          </button>
          <details className='kb-graph-toolbar-menu' ref={edit_actions_ref}>
            <summary className='kb-secondary-button'>编辑图谱</summary>
            <div className='kb-graph-toolbar-menu-panel'>
              <button
                className='kb-secondary-button'
                onClick={() => run_menu_action(on_open_create_node)}
                type='button'
              >
                新建实体
              </button>
              <button
                className='kb-secondary-button'
                onClick={() => run_menu_action(on_open_relation)}
                type='button'
              >
                补关系
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className='kb-graph-toolbar-row is-controls'>
        <section className='kb-graph-toolbar-search-panel'>
          <span className='kb-graph-toolbar-group-label'>快速定位</span>
          <form className='kb-graph-search-form' onSubmit={on_apply_search}>
            <div className='kb-graph-search-shell' onBlur={on_search_shell_blur} ref={search_shell_ref}>
              <label className='kb-form-field kb-graph-search-field'>
                <span className='sr-only'>快速定位</span>
                <input
                  onChange={(event) => on_node_keyword_change(event.target.value)}
                  onFocus={on_search_focus}
                  onKeyDown={on_search_key_down}
                  placeholder='搜索实体名称、类型或来源'
                  value={node_keyword}
                />
              </label>

              {search_results_visible ? (
                <div className='kb-graph-search-results'>
                  {node_matches.length ? (
                    node_matches.map((candidate, index) => (
                      <button
                        className={`kb-graph-search-result ${index === active_search_index ? 'is-active' : ''}`}
                        key={candidate.id}
                        onClick={() => on_choose_search_candidate(candidate)}
                        tabIndex={0}
                        type='button'
                      >
                        <div className='kb-graph-search-result-head'>
                          <strong>{candidate.label}</strong>
                          <span>{candidate.kind_label}</span>
                        </div>
                        <span>{candidate.description}</span>
                      </button>
                    ))
                  ) : (
                    <div className='kb-graph-search-result'>
                      <strong>没有匹配的语义节点</strong>
                      <span>尝试更换关键词，或调整筛选范围。</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <button className='kb-secondary-button' disabled={!active_search_candidate} type='submit'>
              定位
            </button>
          </form>
        </section>

        <section className='kb-graph-toolbar-controls-panel'>
          <div className='kb-graph-toolbar-clusters'>
            <div className='kb-graph-toolbar-cluster'>
              <span className='kb-graph-toolbar-group-label'>视图</span>
              <div className='kb-button-row kb-graph-toolbar-button-strip'>
                <button
                  aria-pressed={graph_view_mode === 'global'}
                  className='kb-secondary-button'
                  onClick={on_enter_global_graph}
                  type='button'
                >
                  全局图
                </button>
                <button
                  aria-pressed={graph_view_mode === 'local'}
                  className='kb-secondary-button'
                  disabled={!can_enter_local_graph}
                  onClick={on_enter_local_graph}
                  type='button'
                >
                  局部图
                </button>
              </div>
            </div>

            <div className='kb-graph-toolbar-cluster'>
              <span className='kb-graph-toolbar-group-label'>浏览</span>
              <div className='kb-button-row kb-graph-toolbar-button-strip'>
                <button className='kb-secondary-button' onClick={on_fit_all} type='button'>
                  适配全图
                </button>
                <details className='kb-graph-toolbar-menu' ref={more_actions_ref}>
                  <summary className='kb-secondary-button'>更多操作</summary>
                  <div className='kb-graph-toolbar-menu-panel'>
                    <button
                      className='kb-secondary-button'
                      disabled={!has_focus_target}
                      onClick={() => run_menu_action(on_focus_selected)}
                      type='button'
                    >
                      聚焦选中
                    </button>
                    <button
                      className='kb-secondary-button'
                      onClick={() => run_menu_action(on_refresh_graph)}
                      type='button'
                    >
                      刷新图谱
                    </button>
                    <button
                      className='kb-secondary-button'
                      onClick={() => run_menu_action(on_relayout_graph)}
                      type='button'
                    >
                      重新布局
                    </button>
                    <button
                      className='kb-secondary-button'
                      onClick={() => run_menu_action(on_zoom_in)}
                      type='button'
                    >
                      放大
                    </button>
                    <button
                      className='kb-secondary-button'
                      onClick={() => run_menu_action(on_zoom_out)}
                      type='button'
                    >
                      缩小
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
