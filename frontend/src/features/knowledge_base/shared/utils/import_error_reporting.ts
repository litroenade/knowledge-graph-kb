import type { ImportTaskRecord } from '../types/knowledge_base_types';

const IMPORT_TASK_ISSUE_STATUSES: ReadonlySet<string> = new Set(['failed', 'partial', 'cancelled', 'aborted']);

export interface ImportTaskIssueItem {
  file_id: string;
  name: string;
  status: string;
  failure_stage: string | null;
  error: string | null;
}

function normalize_text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function serialize_error(error: unknown): unknown {
  if (error instanceof Error) {
    const record = error as Error & { code?: unknown; status?: unknown };
    return {
      name: record.name,
      message: record.message,
      stack: record.stack,
      code: normalize_text(record.code),
      status: typeof record.status === 'number' ? record.status : null,
    };
  }

  if (error && typeof error === 'object') {
    return error;
  }

  return { value: error };
}

function build_file_issue_line(issue: ImportTaskIssueItem): string {
  const stage_suffix = issue.failure_stage ? ` · ${issue.failure_stage}` : '';
  const issue_message = issue.error ?? `文件状态 ${issue.status}`;
  return `${issue.name}${stage_suffix}：${issue_message}`;
}

export function resolve_error_message(error: unknown, fallback: string): string {
  if (error instanceof Error && normalize_text(error.message)) {
    return error.message.trim();
  }

  if (typeof error === 'string' && normalize_text(error)) {
    return error.trim();
  }

  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; detail?: unknown };
    const nested_detail =
      record.detail && typeof record.detail === 'object' && !Array.isArray(record.detail)
        ? (record.detail as { message?: unknown })
        : null;

    return (
      normalize_text(record.message) ??
      normalize_text(record.detail) ??
      normalize_text(nested_detail?.message) ??
      fallback
    );
  }

  return fallback;
}

export function get_import_task_issue_items(
  task: ImportTaskRecord,
  options?: { limit?: number },
): ImportTaskIssueItem[] {
  const limit = options?.limit ?? Number.POSITIVE_INFINITY;

  return task.files
    .filter(
      (file) => IMPORT_TASK_ISSUE_STATUSES.has(file.status) || Boolean(normalize_text(file.error)),
    )
    .map((file) => ({
      file_id: file.id,
      name: normalize_text(file.name) ?? '未命名文件',
      status: file.status,
      failure_stage: normalize_text(file.failure_stage),
      error: normalize_text(file.error),
    }))
    .slice(0, limit);
}

export function get_import_task_issue_lines(task: ImportTaskRecord, limit = 3): string[] {
  const lines: string[] = [];
  const task_error = normalize_text(task.error);

  if (task_error) {
    lines.push(task_error);
  }

  for (const issue of get_import_task_issue_items(task)) {
    const line = build_file_issue_line(issue);
    if (lines.includes(line)) {
      continue;
    }
    lines.push(line);
    if (lines.length >= limit) {
      return lines.slice(0, limit);
    }
  }

  if (!lines.length && (IMPORT_TASK_ISSUE_STATUSES.has(task.status) || task.failed_files > 0)) {
    const stage_suffix = normalize_text(task.failure_stage) ? `，阶段：${task.failure_stage}` : '';
    lines.push(`导入任务异常，失败文件 ${task.failed_files}${stage_suffix}。`);
  }

  return lines.slice(0, limit);
}

export function build_import_task_issue_signature(task: ImportTaskRecord): string | null {
  const issue_lines = get_import_task_issue_lines(task, 5);
  if (!issue_lines.length) {
    return null;
  }

  return JSON.stringify({
    status: task.status,
    failure_stage: normalize_text(task.failure_stage),
    issue_lines,
    file_issues: get_import_task_issue_items(task, { limit: 5 }),
  });
}

export function report_import_workspace_error(
  action: string,
  error: unknown,
  context?: Record<string, unknown>,
): string {
  const message = resolve_error_message(error, '导入操作失败。');
  console.error(`[kb.import] ${action}: ${message}`, {
    action,
    message,
    ...context,
    error: serialize_error(error),
  });
  return message;
}

export function report_import_task_issue(task: ImportTaskRecord): void {
  const issue_lines = get_import_task_issue_lines(task, 5);
  if (!issue_lines.length) {
    return;
  }

  console.error(`[kb.import] 导入任务异常: ${issue_lines[0]}`, {
    job_id: task.id,
    source: task.source,
    status: task.status,
    current_step: task.current_step,
    failure_stage: normalize_text(task.failure_stage),
    failed_files: task.failed_files,
    failed_chunks: task.failed_chunks,
    issue_lines,
    file_issues: get_import_task_issue_items(task, { limit: 5 }),
  });
}
