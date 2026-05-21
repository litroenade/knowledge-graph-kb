import {
  WORKSPACE_ICON_CLASS,
  WORKSPACE_ITEMS,
  WORKSPACE_LABELS,
  WORKSPACE_TOOLTIPS,
  type WorkspaceView,
} from '../../model/workspaceLayout';
import { hover_description } from '../hoverDescription';

interface WorkspaceSwitcherProps {
  active_workspace: WorkspaceView;
  variant: 'icon' | 'label';
  on_select_workspace: (workspace: WorkspaceView) => void;
}

export function WorkspaceSwitcher(props: WorkspaceSwitcherProps) {
  const is_icon_variant = props.variant === 'icon';

  return (
    <nav aria-label='工作区切换' className={is_icon_variant ? 'collapsed-workspace-switcher' : 'workspace-nav-list'}>
      {WORKSPACE_ITEMS.map((item) => (
        <button
          aria-label={`切换到${WORKSPACE_LABELS[item]}`}
          aria-pressed={props.active_workspace === item}
          className={resolve_button_class(is_icon_variant, props.active_workspace === item)}
          key={item}
          {...hover_description(WORKSPACE_TOOLTIPS[item])}
          onClick={() => props.on_select_workspace(item)}
          type='button'
        >
          <span aria-hidden='true' className={WORKSPACE_ICON_CLASS[item]} />
          {is_icon_variant ? null : <strong>{WORKSPACE_LABELS[item]}</strong>}
        </button>
      ))}
    </nav>
  );
}

function resolve_button_class(is_icon_variant: boolean, is_active: boolean): string | undefined {
  if (!is_icon_variant) {
    return undefined;
  }
  return is_active ? 'rail-icon-button is-active' : 'rail-icon-button';
}
