import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  create_answer_citation_record,
  create_scope_record,
} from '../../shared/test_helpers/workspace_slice_fixtures';
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
  chat_sources_section_props_mock,
} = vi.hoisted(() => ({
  use_query_studio_mock: vi.fn(),
  use_workspace_ui_context_mock: vi.fn(),
  use_workspace_source_context_mock: vi.fn(),
  use_workspace_graph_context_mock: vi.fn(),
  use_workspace_import_context_mock: vi.fn(),
  use_workspace_focus_context_mock: vi.fn(),
  chat_sources_section_props_mock: vi.fn(),
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
  ChatSourcesSection: (props: unknown) => {
    chat_sources_section_props_mock(props);
    return <div data-testid='chat-sources-section' />;
  },
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

  it('keeps source scope controls enabled in entity mode and renders entity results', () => {
    const ui = create_ui_slice_fixture({ query_mode: 'entity' });
    const query = create_query_slice_fixture({
      scope_mode: 'subset',
      current_scope: create_scope_record({ mode: 'subset', source_ids: ['source-1'] }),
      scope_source_ids: ['source-1'],
      entity_results: [
        {
          id: 'entity-1',
          display_name: '\u652f\u5f62',
          description: '\u5b59\u5b50\u5175\u6cd5\u4e2d\u7684\u4e00\u4e2a\u5b9e\u4f53\u8282\u70b9',
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

    expect(screen.getByRole('button', { name: '\u6765\u6e90\u8303\u56f4' })).toBeInTheDocument();
    expect(screen.queryByText('\u5f53\u524d\u6a21\u5f0f\u4e0d\u652f\u6301\u6765\u6e90\u8303\u56f4\u8fc7\u6ee4')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u6765\u6e90\u4e00.txt' })).toBeInTheDocument();
    expect(screen.getByText('\u652f\u5f62')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '\u5728\u56fe\u8c31\u4e2d\u67e5\u770b' }));

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

    const textarea = screen.getByRole('textbox', { name: '\u95ee\u9898' });
    fireEvent.change(textarea, { target: { value: '\u6d4b\u8bd5\u95ee\u9898' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(execute_query).toHaveBeenCalledWith('\u6d4b\u8bd5\u95ee\u9898');
    });
  });

  it('opens worksheet preview from citations with stable worksheet anchors', () => {
    const ui = create_ui_slice_fixture({ query_mode: 'answer' });
    const focus = create_focus_slice_fixture();
    const citation = create_answer_citation_record({
      source_id: 'source-1',
      version_id: 'version-1',
      worksheet_key: 'sheet-1',
      row_index: 7,
      anchor_row_index: 7,
      matched_fields: ['zhi'],
    });

    use_workspace_ui_context_mock.mockReturnValue(ui);
    use_workspace_focus_context_mock.mockReturnValue(focus);
    use_query_studio_mock.mockReturnValue({
      query_mode: ui.query_mode,
      set_query_mode: ui.set_query_mode,
      ...create_query_slice_fixture({
        answer_messages: [
          {
            id: 'message-1',
            session_id: 'session-1',
            role: 'assistant',
            content: '测试回答',
            turn_index: 1,
            citations: [citation],
            scope: create_scope_record(),
            sources: [],
            execution: null,
            retrieval_trace: null,
            highlighted_node_ids: [],
            highlighted_edge_ids: [],
            error: null,
            created_at: '2026-04-01T00:00:00Z',
            updated_at: '2026-04-01T00:00:00Z',
          },
        ],
      }),
    });

    render(<QueryStudioPanel />);

    const latest_props = chat_sources_section_props_mock.mock.calls.at(-1)?.[0] as {
      citations: typeof citation[];
      on_open_source_preview: (citation: typeof citation) => void;
    };
    latest_props.on_open_source_preview(latest_props.citations[0]);

    expect(focus.focus_source).toHaveBeenCalledWith('source-1', {
      version_id: 'version-1',
      worksheet_key: 'sheet-1',
      anchor_row_index: 7,
      highlighted_columns: ['zhi'],
    });
  });

  it('submits quick-upload files with the auto strategy and switches to import workspace', async () => {
    const ui = create_ui_slice_fixture({ query_mode: 'answer' });
    const upload_files = vi.fn(async () => {});

    use_workspace_ui_context_mock.mockReturnValue(ui);
    use_workspace_import_context_mock.mockReturnValue(create_import_slice_fixture({ upload_files }));
    use_query_studio_mock.mockReturnValue({
      query_mode: ui.query_mode,
      set_query_mode: ui.set_query_mode,
      ...create_query_slice_fixture(),
    });

    const { container } = render(<QueryStudioPanel />);
    const file_input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(file_input).not.toBeNull();

    const file = new File(['alpha'], 'alpha.txt', { type: 'text/plain' });
    fireEvent.change(file_input!, { target: { files: [file] } });

    await waitFor(() => {
      expect(upload_files).toHaveBeenCalledWith([expect.any(File)], 'auto');
    });
    expect(ui.set_active_workspace).toHaveBeenCalledWith('import');
  });
});
