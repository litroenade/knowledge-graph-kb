/**
 * Import-job state and import actions.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import {
  cancel_import_job,
  list_import_jobs,
  retry_failed_job,
  submit_paste_job,
  submit_scan_job,
  submit_structured_job,
  submit_upload_job,
} from '../../api/import_api';
import { kb_query_keys } from '../../api/query_client';
import type { ImportTaskRecord } from '../../types/knowledge_base_types';
import {
  build_import_task_issue_signature,
  report_import_task_issue,
  report_import_workspace_error,
  resolve_error_message,
} from '../../utils/import_error_reporting';

const ACTIVE_JOB_STATUSES: Set<string> = new Set(['queued', 'running', 'cancelling']);

interface ImportWorkspaceStateProps {
  refresh_sources: () => Promise<void>;
  set_message: Dispatch<SetStateAction<string>>;
  set_error: Dispatch<SetStateAction<string | null>>;
}

function is_active_job_status(status: string): boolean {
  return ACTIVE_JOB_STATUSES.has(status);
}

export function use_import_workspace_state(props: ImportWorkspaceStateProps) {
  const { refresh_sources, set_message, set_error } = props;
  const query_client = useQueryClient();
  const previous_job_statuses_ref = useRef<Map<string, string>>(new Map());
  const reported_job_error_message_ref = useRef<string | null>(null);
  const reported_task_issue_signatures_ref = useRef<Map<string, string>>(new Map());

  function report_and_set_error(
    action: string,
    error: unknown,
    context?: Record<string, unknown>,
  ): void {
    set_error(report_import_workspace_error(action, error, context));
  }

  const jobs_query = useQuery({
    queryKey: kb_query_keys.import_jobs(),
    queryFn: list_import_jobs,
    refetchInterval: (query) => {
      const jobs = (query.state.data as ImportTaskRecord[] | undefined) ?? [];
      return jobs.some((job) => is_active_job_status(job.status)) ? 1200 : false;
    },
  });

  async function refresh_jobs(): Promise<void> {
    try {
      await query_client.invalidateQueries({ queryKey: kb_query_keys.import_jobs() });
      await query_client.refetchQueries({ queryKey: kb_query_keys.import_jobs() });
    } catch (refresh_error) {
      report_and_set_error('刷新导入任务失败', refresh_error);
    }
  }

  async function invalidate_related_queries(): Promise<void> {
    await Promise.all([
      query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'detail'] }),
      query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'paragraphs'] }),
      query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'worksheets'] }),
      query_client.invalidateQueries({ queryKey: ['kb', 'sources', 'worksheet-preview'] }),
      query_client.invalidateQueries({ queryKey: ['kb', 'graph'] }),
      query_client.invalidateQueries({ queryKey: kb_query_keys.manual_relations() }),
    ]);
  }

  async function refresh_related_queries(): Promise<void> {
    await Promise.all([
      refresh_jobs(),
      refresh_sources(),
      invalidate_related_queries(),
    ]);
  }

  useEffect(() => {
    if (!jobs_query.error) {
      reported_job_error_message_ref.current = null;
      return;
    }

    const message = resolve_error_message(jobs_query.error, '加载导入任务失败。');
    if (reported_job_error_message_ref.current === message) {
      return;
    }
    reported_job_error_message_ref.current = message;
    set_error(report_import_workspace_error('加载导入任务失败', jobs_query.error));
  }, [jobs_query.error, set_error]);

  useEffect(() => {
    const jobs = jobs_query.data ?? [];
    const previous_job_statuses = previous_job_statuses_ref.current;
    const reported_task_issue_signatures = reported_task_issue_signatures_ref.current;
    const terminal_jobs = jobs.filter((job) => {
      const previous_status = previous_job_statuses.get(job.id);
      return Boolean(previous_status && is_active_job_status(previous_status) && !is_active_job_status(job.status));
    });
    previous_job_statuses_ref.current = new Map(jobs.map((job) => [job.id, job.status]));
    if (!terminal_jobs.length) {
      return;
    }

    for (const job of terminal_jobs) {
      const issue_signature = build_import_task_issue_signature(job);
      if (!issue_signature || reported_task_issue_signatures.get(job.id) === issue_signature) {
        continue;
      }
      report_import_task_issue(job);
      reported_task_issue_signatures.set(job.id, issue_signature);
    }

    void (async () => {
      try {
        await Promise.all([refresh_sources(), invalidate_related_queries()]);
      } catch (refresh_error) {
        report_and_set_error('刷新导入任务关联数据失败', refresh_error);
      }
    })();
  }, [jobs_query.data, refresh_sources, set_error]);

  const upload_mutation = useMutation({
    mutationFn: ({ files, strategy }: { files: File[]; strategy: string }) => submit_upload_job(files, strategy),
    onSuccess: async (response) => {
      set_message(`已提交上传任务：${response.job.id}`);
      set_error(null);
      await refresh_related_queries();
    },
    onError: (submit_error, variables) => {
      report_and_set_error('提交上传导入失败', submit_error, {
        strategy: variables.strategy,
        file_count: variables.files.length,
        file_names: variables.files.map((file) => file.name),
      });
    },
  });

  const paste_mutation = useMutation({
    mutationFn: (payload: { title: string; content: string; strategy: string; metadata?: Record<string, unknown> }) =>
      submit_paste_job(payload),
    onSuccess: async (response) => {
      set_message(`已提交粘贴任务：${response.job.id}`);
      set_error(null);
      await refresh_related_queries();
    },
    onError: (submit_error, payload) => {
      report_and_set_error('提交粘贴导入失败', submit_error, {
        title: payload.title,
        strategy: payload.strategy,
        content_length: payload.content.length,
      });
    },
  });

  const scan_mutation = useMutation({
    mutationFn: (payload: { root_path: string; glob_pattern: string; strategy: string }) => submit_scan_job(payload),
    onSuccess: async (response) => {
      set_message(`已提交扫描任务：${response.job.id}`);
      set_error(null);
      await refresh_related_queries();
    },
    onError: (submit_error, payload) => {
      report_and_set_error('提交扫描导入失败', submit_error, {
        root_path: payload.root_path,
        glob_pattern: payload.glob_pattern,
        strategy: payload.strategy,
      });
    },
  });

  const structured_mutation = useMutation({
    mutationFn: (payload: {
      route: 'openie' | 'convert';
      title: string;
      payload: Record<string, unknown>;
      strategy: string;
    }) => submit_structured_job(payload.route, payload),
    onSuccess: async (response) => {
      set_message(`已提交结构化任务：${response.job.id}`);
      set_error(null);
      await refresh_related_queries();
    },
    onError: (submit_error, payload) => {
      report_and_set_error('提交结构化导入失败', submit_error, {
        route: payload.route,
        title: payload.title,
        strategy: payload.strategy,
        payload_keys: Object.keys(payload.payload),
      });
    },
  });

  const cancel_mutation = useMutation({
    mutationFn: (job_id: string) => cancel_import_job(job_id),
    onSuccess: async (job) => {
      set_message(`已请求取消任务：${job.id}`);
      set_error(null);
      await refresh_jobs();
    },
    onError: (cancel_error, job_id) => {
      report_and_set_error('取消导入任务失败', cancel_error, { job_id });
    },
  });

  const retry_mutation = useMutation({
    mutationFn: (job_id: string) => retry_failed_job(job_id),
    onSuccess: async (response) => {
      set_message(`已创建重试任务：${response.job.id}`);
      set_error(null);
      await refresh_related_queries();
    },
    onError: (retry_error, job_id) => {
      report_and_set_error('重试导入任务失败', retry_error, { job_id });
    },
  });

  async function upload_files(files: File[], strategy: string): Promise<void> {
    if (!files.length) {
      return;
    }
    await upload_mutation.mutateAsync({ files, strategy });
  }

  async function import_paste_text(title: string, content: string, strategy: string): Promise<void> {
    await paste_mutation.mutateAsync({ title, content, strategy });
  }

  async function import_scan_path(root_path: string, glob_pattern: string, strategy: string): Promise<void> {
    await scan_mutation.mutateAsync({ root_path, glob_pattern, strategy });
  }

  async function import_structured_payload(
    mode: 'openie' | 'convert',
    title: string,
    payload_text: string,
    strategy: string,
  ): Promise<void> {
    let payload: Record<string, unknown>;
    try {
      const parsed_payload = JSON.parse(payload_text);
      if (!parsed_payload || typeof parsed_payload !== 'object' || Array.isArray(parsed_payload)) {
        throw new Error('结构化导入 payload 必须是 JSON 对象。');
      }
      payload = parsed_payload as Record<string, unknown>;
    } catch (parse_error) {
      report_and_set_error('解析结构化导入 payload 失败', parse_error, {
        route: mode,
        title,
        strategy,
        payload_length: payload_text.length,
      });
      return;
    }

    await structured_mutation.mutateAsync({ route: mode, title, payload, strategy });
  }

  async function cancel_task(task_id: string): Promise<void> {
    await cancel_mutation.mutateAsync(task_id);
  }

  async function retry_task(task_id: string): Promise<void> {
    await retry_mutation.mutateAsync(task_id);
  }

  return {
    tasks: jobs_query.data ?? [],
    refresh_tasks: refresh_jobs,
    is_submitting_import:
      upload_mutation.isPending ||
      paste_mutation.isPending ||
      scan_mutation.isPending ||
      structured_mutation.isPending,
    upload_files,
    import_paste_text,
    import_scan_path,
    import_structured_payload,
    cancel_task,
    retry_task,
  };
}
