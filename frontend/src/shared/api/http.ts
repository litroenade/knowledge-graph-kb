export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function request_json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let message = response.statusText || '请求失败';
  let code: string | null = null;
  try {
    const payload = await response.json() as {
      detail?: string | { message?: string; code?: string };
      message?: string;
      code?: string;
    };
    if (typeof payload.detail === 'string') {
      message = payload.detail;
    } else if (payload.detail?.message) {
      message = payload.detail.message;
      code = payload.detail.code ?? null;
    } else if (payload.message) {
      message = payload.message;
      code = payload.code ?? null;
    }
  } catch {
    const text = await response.text();
    if (text.trim()) {
      message = text.trim();
    }
  }
  throw new ApiError(message, response.status, code);
}
