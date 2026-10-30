import { ZodError } from "zod";
import { ApiError, ValidationError, errorResponse } from "@/lib/api/scope";

/**
 * SKAI-1163: the one response envelope for API routes.
 *
 *   success → `{ data }`
 *   failure → `{ error: { code, message, fields? } }`
 *
 * Routes migrate to it in domain batches; until a route does, it keeps the
 * legacy `{ error: "message" }` shape from `errorResponse`. Clients read both
 * through `readApiError` / `readApiData` in `@/lib/api/envelope-client`.
 */

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL";

export type ApiErrorBody = { error: { code: string; message: string; fields?: Record<string, string[]> } };

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export function statusForCode(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code];
}

/** The generic code for a status, used when the thrown error carries none of its own. */
export function codeForStatus(status: number): ApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status < 500) return "BAD_REQUEST";
  return "INTERNAL";
}

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ data }, init);
}

export function created<T>(data: T) {
  return ok(data, { status: 201 });
}

export function fail(code: ApiErrorCode, message: string, fields?: Record<string, string[]>, status = statusForCode(code)) {
  const error: ApiErrorBody["error"] = { code, message };
  if (fields) error.fields = fields;
  return Response.json({ error } satisfies ApiErrorBody, { status });
}

/**
 * The envelope form of `errorResponse`. It delegates to the legacy serialiser so
 * the 5xx redaction, request id and logging stay in one place, then reshapes
 * the body: a string `error` becomes `message`, a machine `code` is kept (or
 * derived from the status) and field maps land in `fields`.
 */
export async function failFrom(error: unknown, fallback = "Request failed") {
  const legacy = errorResponse(error, fallback);
  const body = (await legacy.json()) as Record<string, unknown>;
  const status = legacy.status;

  let message = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "Request failed";
  let fields: Record<string, string[]> | undefined;
  let code = typeof body.code === "string" ? body.code : codeForStatus(status);

  if (error instanceof ValidationError || error instanceof ZodError) {
    fields = body.details as Record<string, string[]>;
    code = "VALIDATION_FAILED";
  } else if (error instanceof ApiError && error.code) {
    code = error.code;
  }
  if (error instanceof ZodError && typeof body.error === "string") message = body.error;

  const envelope: ApiErrorBody["error"] = { code, message };
  if (fields) envelope.fields = fields;
  // Plan-limit errors also carry an EN key and its values for a client that formats them.
  const extra = typeof body.messageKey === "string" ? { messageKey: body.messageKey, params: body.params } : {};
  return Response.json({ error: { ...envelope, ...extra } }, { status, headers: legacy.headers });
}
