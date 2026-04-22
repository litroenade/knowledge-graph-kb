import { useEffect, useState } from 'react';

import type { SystemReady } from '../../../../shared/types/kb';
import { ModelConfigPanel } from '../panels/ModelConfigPanel';
import type { ModelConfigMode } from '../../model/workspaceExperience';

interface ModelConfigPopoverProps {
  button_label: string;
  dialog_label: string;
  mode: ModelConfigMode;
  on_saved: () => void;
  ready: SystemReady | null;
}

export function ModelConfigPopover(props: ModelConfigPopoverProps) {
  const [is_open, set_is_open] = useState(false);

  useEffect(() => {
    if (!is_open) return;

    function handle_keydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') set_is_open(false);
    }

    window.addEventListener('keydown', handle_keydown);
    return () => window.removeEventListener('keydown', handle_keydown);
  }, [is_open]);

  return (
    <>
      <button className='workspace-action-button' onClick={() => set_is_open(true)} type='button'>
        {props.button_label}
      </button>

      {is_open ? (
        <div
          className='model-config-overlay'
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) set_is_open(false);
          }}
        >
          <section aria-label={props.dialog_label} aria-modal='true' className='model-config-popover' role='dialog'>
            <header className='model-config-popover-header'>
              <div>
                <span>Model</span>
                <strong>{props.dialog_label}</strong>
              </div>
              <button onClick={() => set_is_open(false)} type='button'>关闭</button>
            </header>
            <ModelConfigPanel mode={props.mode} on_saved={props.on_saved} ready={props.ready} />
          </section>
        </div>
      ) : null}
    </>
  );
}
