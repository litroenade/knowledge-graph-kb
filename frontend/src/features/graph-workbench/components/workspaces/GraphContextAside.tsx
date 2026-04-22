import type { ReactNode } from 'react';

import {
  GRAPH_CONTEXT_PANEL_ICON_CLASS,
  GRAPH_CONTEXT_PANEL_LABELS,
  GRAPH_CONTEXT_PANEL_TOOLTIPS,
  type GraphContextPanel,
} from '../../model/workspaceLayout';
import { hover_description } from '../hoverDescription';

interface GraphContextAsideProps {
  children: ReactNode;
  right_collapsed: boolean;
  right_panel: GraphContextPanel;
  on_open_panel: (panel: GraphContextPanel) => void;
  on_select_panel: (panel: GraphContextPanel) => void;
  on_toggle_right_panel: () => void;
}

export function GraphContextAside(props: GraphContextAsideProps) {
  const context_panel_items = Object.keys(GRAPH_CONTEXT_PANEL_LABELS) as GraphContextPanel[];

  return (
    <aside aria-label='工作台面板' className='right-panel'>
      <div aria-hidden={!props.right_collapsed} className='collapsed-rail-stack'>
        <button
          aria-label='展开右侧栏'
          className='rail-icon-button'
          {...hover_description('展开右侧栏')}
          onClick={props.on_toggle_right_panel}
          type='button'
        >
          <span aria-hidden='true' className='rail-symbol rail-symbol-menu' />
        </button>
        {context_panel_items.map((item) => (
          <button
            aria-label={`打开${GRAPH_CONTEXT_PANEL_LABELS[item]}面板`}
            aria-pressed={props.right_panel === item}
            className={props.right_panel === item ? 'rail-icon-button is-active' : 'rail-icon-button'}
            key={item}
            {...hover_description(GRAPH_CONTEXT_PANEL_TOOLTIPS[item])}
            onClick={() => props.on_open_panel(item)}
            type='button'
          >
            <span aria-hidden='true' className={GRAPH_CONTEXT_PANEL_ICON_CLASS[item]} />
          </button>
        ))}
      </div>
      <button
        aria-expanded={!props.right_collapsed}
        aria-label={props.right_collapsed ? '展开右侧栏' : '收起右侧栏'}
        className='rail-toggle rail-toggle-expanded'
        {...hover_description(props.right_collapsed ? '展开图谱检查、编辑和来源面板' : '收起图谱上下文面板')}
        onClick={props.on_toggle_right_panel}
        type='button'
      >
        {props.right_collapsed ? '展开' : '收起'}
      </button>
      <div aria-hidden={props.right_collapsed} className='rail-content'>
        <nav className='panel-tabs' aria-label='工作台功能'>
          {context_panel_items.map((item) => (
            <button
              {...hover_description(GRAPH_CONTEXT_PANEL_TOOLTIPS[item])}
              aria-pressed={props.right_panel === item}
              key={item}
              onClick={() => props.on_select_panel(item)}
              type='button'
            >
              {GRAPH_CONTEXT_PANEL_LABELS[item]}
            </button>
          ))}
        </nav>

        {props.children}
      </div>
    </aside>
  );
}
