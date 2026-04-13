import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  create_focus_slice_fixture,
  create_graph_slice_fixture,
  create_import_slice_fixture,
  create_query_slice_fixture,
  create_source_slice_fixture,
  create_ui_slice_fixture,
} from '../../shared/test_helpers/workspace_slice_fixtures';
import { QueryStudioPanel } from './query_studio_panel';

const {
  use_query_studio_mock,
  use_workspace_ui_context_mock,
  use_workspace_source_context_mock,
  use_workspace_graph_context_mock,
  use_workspace_import_context_mock,
  use_workspace_focus_context_mock,
} = vi.hoisted(() => ({
  use_query_studio_mock: vi.fn(),
  use_workspace_ui_context_mock: vi.fn(),
  use_workspace_source_context_mock: vi.fn(),
  use_workspace_graph_context_mock: vi.fn(),
  use_workspace_import_context_mock: vi.fn(),
  use_workspace_focus_context_mock: vi.fn(),
}));

vi.mock('../hooks/use_query_studio', () => ({
  use_query_studio: use_query_studio_mock,
}));

vi.mock('../../shared/context/knowledge_base_workspace_context', () => ({
  use_workspace_ui_context: use_workspace_ui_context_mock,
  use_workspace_source_context: use_workspace_source_context_mock,
  use_workspace_graph_context: use_workspace_graph_context_mock,
  use_workspace_import_context: use_workspace_import_context_mock,
  use_workspace_focus_context: use_workspace_focus_context_mock,
}));

vi.mock('./chat_diagnostics_section', () => ({
  ChatDiagnosticsSection: () => <div data-testid='chat-diagnostics-section' />,
}));

vi.mock('./chat_sources_section', () => ({
  ChatSourcesSection: () => <div data-testid='chat-sources-section' />,
}));

vi.mock('./source_library_drawer', () => ({
  SourceLibraryDrawer: () => null,
}));

vi.mock('../../model_config/components/model_config_modal', () => ({
  ModelConfigModal: () => null,
}));

describe('QueryStudioPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    use_workspace_graph_context_mock.mockReturnValue(create_graph_slice_fixture());
    use_workspace_import_context_mock.mockReturnValue(create_import_slice_fixture());
    use_workspace_source_context_mock.mockReturnValue(create_source_slice_fixture());
    use_workspace_focus_context_mock.mockReturnValue(create_focus_slice_fixture());
  });

  it('shows non-answer search results and hides unsupported scope controls in entity mode', () => {
    const ui = create_ui_slice_fixture({ query_mode: 'entity' });
    const query = create_query_slice_fixture({
      entity_results: [
        {
          id: 'entity-1',
          display_name: '支形',
          description: '孙子兵法中的一个实体节点',
          appearance_count: 3,
          metadata: {},
          paragraph_ids: ['paragraph-1'],
        },
      ],
    });
    const focus = create_focus_slice_fixture();

    use_workspace_ui_context_mock.mockReturnValue(ui);
    use_workspace_focus_context_mock.mockReturnValue(focus);
    use_query_studio_mock.mockReturnValue({
      query_mode: ui.query_mode,
      set_query_mode: ui.set_query_mode,
      ...query,
    });

    render(<QueryStudioPanel />);

    expect(screen.getByText('当前模式不支持来源范围过滤')).toBeInTheDocument();
    expect(screen.getByText('支形')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '在图谱中查看' }));

    expect(focus.focus_entity).toHaveBeenCalledWith('entity-1');
  });

  it('submits the current question on Enter in answer mode', async () => {
    const ui = create_ui_slice_fixture({ query_mode: 'answer' });
    const execute_query = vi.fn(async () => {});

    use_workspace_ui_context_mock.mockReturnValue(ui);
    use_query_studio_mock.mockReturnValue({
      query_mode: ui.query_mode,
      set_query_mode: ui.set_query_mode,
      ...create_query_slice_fixture({
        execute_query,
      }),
    });

    render(<QueryStudioPanel />);

    const textarea = screen.getByRole('textbox', { name: '问题' });
    fireEvent.change(textarea, { target: { value: '测试问题' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(execute_query).toHaveBeenCalledWith('测试问题');
    });
  });
});
