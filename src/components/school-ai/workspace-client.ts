import type { AiWorkspaceRecord, WorkspaceKind } from "@/lib/school-ai/types";
import { interpolateAI, type SchoolAICopy, type SchoolAICopyKey } from "@/lib/school-ai/copy";

export class WorkspaceRequestError extends Error {
  constructor(message: string, readonly fields: string[] = [], readonly code?: string) { super(message); }
}

export function workspaceErrorText(error: unknown, copy: SchoolAICopy) {
  if (error instanceof WorkspaceRequestError && error.code && error.code in copy) return copy[error.code as SchoolAICopyKey];
  if (error instanceof Error && error.message === "conflict") return copy.conflict;
  if (error instanceof Error && error.message === "unavailable") return copy.serviceUnavailable;
  if (error instanceof WorkspaceRequestError && error.fields.length) {
    const labels = [...new Set(error.fields.map(path => {
      const key = path.split(".").reverse().find(part => part in copy) as SchoolAICopyKey | undefined;
      return key ? copy[key] : copy.formDetails;
    }))];
    return interpolateAI(copy.checkFields, { fields: labels.join(" · ") });
  }
  return copy.failed;
}

export async function workspaceRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { details?: { path?: string }[]; code?: string } | null;
    const fields = Array.isArray(body?.details) ? body.details.flatMap(issue => typeof issue.path === "string" ? [issue.path] : []) : [];
    throw new WorkspaceRequestError(response.status === 409 ? "conflict" : response.status === 503 ? "unavailable" : "failed", fields, typeof body?.code === "string" ? body.code : undefined);
  }
  return response.json() as Promise<T>;
}
export type SaveRecord = (kind: WorkspaceKind, title: string, data: Record<string, unknown>, existing?: AiWorkspaceRecord, idempotencyKey?: string) => Promise<AiWorkspaceRecord>;
export type RecordAction = (record: AiWorkspaceRecord, action: "review" | "approve" | "archive") => Promise<AiWorkspaceRecord>;
export interface AIFeatureCapabilities { documentUpload: boolean; documentExtraction: boolean; voiceTranscription: boolean; assistant: boolean; paperGeneration: boolean; secureBrowser: boolean; proctoring: boolean; optionalRecording: boolean }
export const UNCONFIGURED_CAPABILITIES: AIFeatureCapabilities = { documentUpload: false, documentExtraction: false, voiceTranscription: false, assistant: false, paperGeneration: false, secureBrowser: false, proctoring: false, optionalRecording: false };
