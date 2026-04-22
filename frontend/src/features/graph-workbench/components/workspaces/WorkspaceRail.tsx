import type { ReactNode } from 'react';

import type { SourceItem } from '../../../../shared/types/kb';
import type { RenderNode } from '../../model/graphModel';
import {
  WORKSPACE_ICON_CLASS,
  WORKSPACE_LABELS,
  WORKSPACE_TOOLTIPS,
  type WorkspaceView,
} from '../../model/workspaceLayout';
import { hover_description } from '../hoverDescription';

interface WorkspaceRailProps {
  graph_settings_panel: ReactNode;
  left_collapsed: boolean;
  search: string;
  search_matches: RenderNode[];
  selected_node_id: string | null;
  selected_source_ids: string[];
  show_graph_controls: boolean;
  show_source_filter: boolean;
  sources: SourceItem[];
  workspace_view: WorkspaceView;
  on_clear_sources: () => void;
  on_open_left_rail: () => void;
  on_search_change: (value: string) => void;
  on_select_node: (node_id: string) => void;
  on_select_workspace: (workspace: WorkspaceView) => void;
  on_toggle_left_rail: () => void;
  on_toggle_source: (source_id: string) => void;
}

export function WorkspaceRail(props: WorkspaceRailProps) {
  const workspace_items = Object.keys(WORKSPACE_LABELS) as WorkspaceView[];

  return (
    <aside aria-label='图谱导航与控制' className='left-rail'>
      <div aria-hidden={!props.left_collapsed} className='collapsed-rail-stack'>
        <button
          aria-label='展开左侧栏'
          className='rail-icon-button'
          {...hover_description('展开左侧栏')}
          onClick={props.on_open_left_rail}
          type='button'
        >
          <span aria-hidden='true' className='rail-symbol rail-symbol-menu' />
        </button>
        {workspace_items.map((item) => (
          <button
            aria-label={`切换到${WORKSPACE_LABELS[item]}`}
            aria-pressed={props.workspace_view === item}
            className={props.workspace_view === item ? 'rail-icon-button is-active' : 'rail-icon-button'}
            key={item}
            {...hover_description(WORKSPACE_TOOLTIPS[item])}
            onClick={() => props.on_select_workspace(item)}
            type='button'
          >
            <span aria-hidden='true' className={WORKSPACE_ICON_CLASS[item]} />
          </button>
        ))}
      </div>
      <button
        aria-expanded={!props.left_collapsed}
        aria-label={props.left_collapsed ? '展开左侧栏' : '收起左侧栏'}
        className='rail-toggle rail-toggle-expanded'
        {...hover_description(props.left_collapsed ? '展开搜索、来源和图谱控制' : '收起左侧图谱导航与控制')}
        onClick={props.on_toggle_left_rail}
        type='button'
      >
        {props.left_collapsed ? '展开' : '收起'}
      </button>
      <div aria-hidden={props.left_collapsed} className='rail-content'>
        <section className='brand-block'>
          <strong>知识图谱</strong>
        </section>

        <section className='control-section'>
          <div className='section-heading'>
            <span>工作区</span>
          </div>
          <div className='workspace-nav-list'>
            {workspace_items.map((item) => (
              <button
                {...hover_description(WORKSPACE_TOOLTIPS[item])}
                aria-pressed={props.workspace_view === item}
                key={item}
                onClick={() => props.on_select_workspace(item)}
                type='button'
              >
                <span aria-hidden='true' className={WORKSPACE_ICON_CLASS[item]} />
                <strong>{WORKSPACE_LABELS[item]}</strong>
              </button>
            ))}
          </div>
        </section>

        {props.show_graph_controls ? (
          <section className='control-section'>
            <label className='field'>
              <span>搜索节点</span>
              <input
                onChange={(event) => props.on_search_change(event.target.value)}
                placeholder='名称、类型、来源、ID'
                value={props.search}
              />
            </label>
            <div className='search-list'>
              {props.search_matches.map((node) => (
                <button
                  className={props.selected_node_id === node.id ? 'is-active' : ''}
                  key={node.id}
                  onClick={() => props.on_select_node(node.id)}
                  type='button'
                >
                  <strong>{node.display_name}</strong>
                  <span>{node.kind_label ?? node.type} · {node.degree} 条连接</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {props.show_source_filter ? (
          <section className='control-section'>
            <div className='section-heading'>
              <span>来源范围</span>
              <button {...hover_description('清空来源过滤，恢复全部来源范围')} onClick={props.on_clear_sources} type='button'>
                全部
              </button>
            </div>
            <div className='source-list'>
              {props.sources.slice(0, 80).map((source) => (
                <label key={source.id}>
                  <input
                    checked={props.selected_source_ids.includes(source.id)}
                    onChange={() => props.on_toggle_source(source.id)}
                    type='checkbox'
                  />
                  <span>{source.name}</span>
                </label>
              ))}
            </div>
          </section>
        ) : null}
        {props.show_graph_controls ? props.graph_settings_panel : null}
      </div>
    </aside>
  );
}
