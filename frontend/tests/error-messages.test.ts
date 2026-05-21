import { describe, expect, it } from 'vitest';

import { to_user_error_message } from '../src/shared/api/errorMessages';

describe('to_user_error_message', () => {
  it('does not hard-code backend ports in connection failures', () => {
    const message = to_user_error_message(new TypeError('Failed to fetch'), 'graph');

    expect(message).toContain('/api');
    expect(message).not.toMatch(/\b\d{4,5}\b/);
  });
});
