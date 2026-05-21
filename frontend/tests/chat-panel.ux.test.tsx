import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPanel } from '../src/features/graph-workbench/components/panels/ChatPanel';
import type { KBScope } from '../src/shared/types/kb';
import {
  fetch_chat_sessions,
  search_records,
} from '../src/shared/api/kb';

vi.mock('../src/shared/api/kb', () => ({
  create_chat_session: vi.fn(),
  fetch_chat_session: vi.fn(),
  fetch_chat_sessions: vi.fn(),
  search_entities: vi.fn(),
  search_records: vi.fn(),
  search_relations: vi.fn(),
  search_sources: vi.fn(),
  send_chat_message: vi.fn(),
}));

const scope: KBScope = {
  excluded_source_ids: [],
  mode: 'all',
  source_ids: [],
  version_id: null,
  version_mode: 'latest',
};

describe('ChatPanel UX guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetch_chat_sessions).mockResolvedValue([]);
    vi.mocked(search_records).mockResolvedValue([]);
  });

  it('keeps empty chat and search actions disabled until the user enters input', async () => {
    render(<ChatPanel on_focus_node={vi.fn()} scope={scope} />);

    await waitFor(() => expect(fetch_chat_sessions).toHaveBeenCalled());

    const send_button = screen.getByRole('button', { name: '发送到当前范围' });
    expect(send_button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('问题'), { target: { value: '如何导入知识？' } });
    expect(send_button).toBeEnabled();

    const search_button = screen.getByRole('button', { name: '检索' });
    expect(search_button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('检索词'), { target: { value: '导入' } });
    expect(search_button).toBeEnabled();

    fireEvent.click(search_button);
    await waitFor(() => expect(search_records).toHaveBeenCalledWith('导入', scope, 20));
  });
});
