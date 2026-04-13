import { Suspense, lazy, useMemo } from 'react';

import type { ResolvedTheme } from '../../../../theme';
import { WORKSPACE_TABS } from '../config/ui_constants';
import { use_workspace_shell } from '../hooks/use_workspace_shell';
import type { WorkspaceTab } from '../types/knowledge_base_types';
import { WorkspaceLoadingState } from './workspace_loading_state';

interface WorkspaceBodyProps {
  resolved_theme: ResolvedTheme;
}

const GraphBrowserPanel = lazy(async () => ({
  default: (await import('../../graph_browser/components/graph_browser_panel')).GraphBrowserPanel,
}));

const QueryStudioPanel = lazy(async () => ({
  default: (await import('../../query_studio/components/query_studio_panel')).QueryStudioPanel,
}));

const ImportCenterPanel = lazy(async () => ({
  default: (await import('../../import_center/components/import_center_panel')).ImportCenterPanel,
}));

export function WorkspaceBody(props: WorkspaceBodyProps) {
  const { resolved_theme } = props;
  const { active_workspace } = use_workspace_shell();

  const panels: Record<WorkspaceTab, JSX.Element> = useMemo(
    () => ({
      chat: <QueryStudioPanel />,
      import: <ImportCenterPanel />,
      graph: <GraphBrowserPanel resolved_theme={resolved_theme} />,
    }),
    [resolved_theme],
  );

  return (
    <div className='kb-workspace-stack'>
      {WORKSPACE_TABS.map((tab) => {
        if (active_workspace !== tab.id) {
          return null;
        }

        return (
          <section aria-hidden='false' className='kb-workspace-view' key={tab.id}>
            <Suspense fallback={<WorkspaceLoadingState description={tab.description} title={tab.label} />}>
              {panels[tab.id]}
            </Suspense>
          </section>
        );
      })}
    </div>
  );
}
