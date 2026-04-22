import type { JsonRecord } from '../../../../shared/types/kb';

export function format_date(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function format_percent(value: number): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function preview_text(value: JsonRecord, fallback: string): string {
  for (const key of ['content', 'excerpt', 'summary', 'display_label', 'label', 'name']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return fallback;
}

export function stringify_detail(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'string') {
    return value.trim() || '-';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
