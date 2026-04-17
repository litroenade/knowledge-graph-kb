/**
 * Source-related API helpers.
 */

import type {
  KBScopeRecord,
  ParagraphRecord,
  SourceDetailRecord,
  SourceRecord,
  WorksheetPreviewRecord,
  WorksheetSummaryRecord,
} from '../types/knowledge_base_types';
import { build_query_string, request_json } from './http_client';

interface SourceParagraphsResponse {
  items: ParagraphRecord[];
}

interface SourceWorksheetsResponse {
  items: WorksheetSummaryRecord[];
}

interface ListSourcesOptions {
  keyword?: string;
  limit?: number;
  scope?: KBScopeRecord | null;
}

export function list_sources(options: ListSourcesOptions = {}): Promise<SourceRecord[]> {
  const { keyword, limit = 100, scope } = options;
  return request_json<SourceRecord[]>(
    `/api/kb/sources${build_query_string({
      keyword,
      limit,
      mode: scope?.mode,
      source_ids: scope?.source_ids?.length ? scope.source_ids : undefined,
      version_mode: scope?.version_mode,
      version_id: scope?.version_id ?? undefined,
      excluded_source_ids: scope?.excluded_source_ids?.length ? scope.excluded_source_ids : undefined,
    })}`,
  );
}

export function get_source_detail(
  source_id: string,
  version_id?: string | null,
): Promise<SourceDetailRecord> {
  return request_json<SourceDetailRecord>(
    `/api/kb/sources/${source_id}${build_query_string({ version_id: version_id ?? undefined })}`,
  );
}

export function update_source(
  source_id: string,
  payload: {
    name?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<SourceRecord> {
  return request_json<SourceRecord>(`/api/kb/sources/${source_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function delete_source(source_id: string): Promise<{ status: string }> {
  return request_json<{ status: string }>(`/api/kb/sources/${source_id}`, {
    method: 'DELETE',
  });
}

export async function list_source_paragraphs(
  source_id: string,
  version_id?: string | null,
): Promise<ParagraphRecord[]> {
  const response = await request_json<SourceParagraphsResponse>(
    `/api/kb/sources/${source_id}/paragraphs${build_query_string({ version_id: version_id ?? undefined })}`,
  );
  return response.items;
}

export async function list_source_worksheets(
  source_id: string,
  version_id?: string | null,
): Promise<WorksheetSummaryRecord[]> {
  const response = await request_json<SourceWorksheetsResponse>(
    `/api/kb/sources/${source_id}/worksheets${build_query_string({ version_id: version_id ?? undefined })}`,
  );
  return response.items;
}

export function get_source_worksheet_preview(
  source_id: string,
  worksheet_key: string,
  options: {
    version_id?: string | null;
    page?: number;
    page_size?: number;
    anchor_row?: number | null;
    highlighted_columns?: string[];
  } = {},
): Promise<WorksheetPreviewRecord> {
  return request_json<WorksheetPreviewRecord>(
    `/api/kb/sources/${source_id}/worksheets/${worksheet_key}/preview${build_query_string({
      version_id: options.version_id ?? undefined,
      page: options.page ?? 1,
      page_size: options.page_size ?? 50,
      anchor_row: options.anchor_row ?? undefined,
      highlighted_columns: options.highlighted_columns?.length ? options.highlighted_columns : undefined,
    })}`,
  );
}
