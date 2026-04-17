import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  create_import_slice_fixture,
  create_source_slice_fixture,
} from '../../shared/test_helpers/workspace_slice_fixtures';
import { ImportCenterPanel } from './import_center_panel';

const {
  use_import_center_mock,
  use_workspace_source_context_mock,
} = vi.hoisted(() => ({
  use_import_center_mock: vi.fn(),
  use_workspace_source_context_mock: vi.fn(),
}));

vi.mock('../hooks/use_import_center', () => ({
  use_import_center: use_import_center_mock,
}));

vi.mock('../../shared/context/knowledge_base_workspace_context', () => ({
  use_workspace_source_context: use_workspace_source_context_mock,
}));

describe('ImportCenterPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    use_import_center_mock.mockReturnValue(create_import_slice_fixture());
    use_workspace_source_context_mock.mockReturnValue(create_source_slice_fixture());
  });

  it('shows only the supported strategies and exposes the structured import entry', () => {
    render(<ImportCenterPanel />);

    expect(screen.getByRole('option', { name: '\u81ea\u52a8\u7b56\u7565' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '\u4e8b\u5b9e\u62bd\u53d6' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '\u53d9\u4e8b\u62bd\u53d6' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '\u5f15\u7528\u62bd\u53d6' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /summary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /semantic/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /hybrid/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u9ad8\u7ea7\u7ed3\u6784\u5316\u5bfc\u5165' })).toBeInTheDocument();
  });

  it('submits structured payloads through the explicit route selector', async () => {
    const import_structured_payload = vi.fn(async () => {});
    use_import_center_mock.mockReturnValue(create_import_slice_fixture({ import_structured_payload }));

    render(<ImportCenterPanel />);

    fireEvent.click(screen.getByRole('button', { name: '\u9ad8\u7ea7\u7ed3\u6784\u5316\u5bfc\u5165' }));
    fireEvent.change(screen.getByRole('combobox', { name: '\u7ed3\u6784\u5316\u7c7b\u578b' }), {
      target: { value: 'convert' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '\u6807\u9898' }), {
      target: { value: '\u7ed3\u6784\u5316\u6570\u636e' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON Payload' }), {
      target: { value: '{"paragraphs":[]}' },
    });

    fireEvent.click(screen.getByRole('button', { name: '\u63d0\u4ea4\u7ed3\u6784\u5316\u5bfc\u5165' }));

    await waitFor(() => {
      expect(import_structured_payload).toHaveBeenCalledWith(
        'convert',
        '\u7ed3\u6784\u5316\u6570\u636e',
        '{"paragraphs":[]}',
        'auto',
      );
    });
  });
});
