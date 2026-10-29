/**
 * SKAI-1163: client-side readers for API bodies. They accept both the envelope
 * (`{ data }` / `{ error: { code, message, fields? } }`) and the legacy shapes
 * (`{ success, data }`, `{ error: "message" }`), so a caller can switch before
 * or after its route migrates.
 */

export function readApiError(body: unknown, fallback = "Request failed"): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" && message ? message : fallback;
}

export function readApiErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const error = (body as { error?: unknown }).error;
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function readApiFields(body: unknown): Record<string, string[]> | undefined {
  if (!body || typeof body !== "object") return undefined;
  const error = (body as { error?: unknown }).error;
  if (error && typeof error === "object" && "fields" in error) return (error as { fields?: Record<string, string[]> }).fields;
  return undefined;
}

/** `data` from a success body, or `fallback` when the body is an error or has none. */
export function readApiData<T>(body: unknown, fallback: T): T {
  if (!body || typeof body !== "object") return fallback;
  if ("error" in body && (body as { error?: unknown }).error) return fallback;
  if ((body as { success?: unknown }).success === false) return fallback;
  return "data" in body && (body as { data?: unknown }).data !== undefined ? (body as { data: T }).data : fallback;
}
