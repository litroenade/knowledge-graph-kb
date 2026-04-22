import type { KBScope, SystemReady } from '../../../../shared/types/kb';
import type { WorkspaceView } from '../../model/workspaceLayout';
import { ChatWorkspace } from './ChatWorkspace';
import { ImportWorkspace } from './ImportWorkspace';

type PrimaryWorkspaceView = Exclude<WorkspaceView, 'graph'>;

interface PrimaryWorkspaceProps {
  ready: SystemReady | null;
  scope: KBScope;
  workspace_view: PrimaryWorkspaceView;
  on_focus_node: (node_id: string) => void;
  on_import_finished: () => void;
}

export function PrimaryWorkspace(props: PrimaryWorkspaceProps) {
  if (props.workspace_view === 'import') {
    return <ImportWorkspace on_import_finished={props.on_import_finished} ready={props.ready} />;
  }

  return (
    <ChatWorkspace
      on_focus_node={props.on_focus_node}
      on_saved={props.on_import_finished}
      ready={props.ready}
      scope={props.scope}
    />
  );
}
