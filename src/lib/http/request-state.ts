/** Safe, transport-independent outcomes. Never retain response bodies or URLs in errors. */
export type FailureKind = "denied" | "session" | "validation" | "conflict" | "offline" | "timeout" | "limited" | "provider" | "server";
export class RequestFailure extends Error {
  constructor(public readonly kind: FailureKind, public readonly status?: number, public readonly digest?: string) {
    super(kind); this.name = "RequestFailure";
  }
}
export function failureForStatus(status: number): FailureKind {
  if (status === 401) return "session";
  if (status === 403 || status === 404) return "denied";
  if (status === 409 || status === 412) return "conflict";
  if (status === 400 || status === 422) return "validation";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "limited";
  if (status === 502 || status === 503) return "provider";
  return "server";
}
export function requestFailure(error: unknown): RequestFailure {
  if (error instanceof RequestFailure) return error;
  if (error instanceof Error && error.name === "TimeoutError") return new RequestFailure("timeout");
  if (typeof navigator !== "undefined" && navigator.onLine === false) return new RequestFailure("offline");
  return new RequestFailure(error instanceof TypeError ? "offline" : "server");
}
export async function checkedJson<T = any>(response: Response, options: { envelope?: boolean } = {}): Promise<T> {
  const reference = response.headers.get("x-request-id");
  const digest = reference && /^[a-zA-Z0-9_-]{1,80}$/.test(reference) ? reference : undefined;
  // Check status before parsing: proxies and permission denials need not send JSON.
  if (!response.ok) throw new RequestFailure(failureForStatus(response.status), response.status, digest);
  const body = await response.json().catch(() => { throw new RequestFailure("server", response.status, digest); });
  if (!body || typeof body !== "object") throw new RequestFailure("server", response.status, digest);
  if (body?.success === false || (options.envelope !== false && body?.success !== true)) throw new RequestFailure("server", response.status, digest);
  return body as T;
}
/** Reads only: no automatic replay of mutations with uncertain outcomes. */
export function readRequest(input: string, signal?: AbortSignal): Promise<Response> {
  return fetch(input, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
}
export type ResourceState = "loading" | "no-data" | "no-match" | "failure" | "success" | "denied";
export function resourceState(input: { loading: boolean; failure?: RequestFailure | null; count: number; filtered?: boolean }): ResourceState {
  if (input.loading) return "loading";
  if (input.failure) return input.failure.kind === "denied" || input.failure.kind === "session" ? "denied" : "failure";
  return input.count > 0 ? "success" : input.filtered ? "no-match" : "no-data";
}

/** Collection endpoints must not turn a malformed success into an empty collection or render crash. */
export async function checkedListJson(response: Response) {
  const body = await checkedJson(response);
  if (!Array.isArray(body.data)) throw new RequestFailure("server", response.status);
  return body;
}
