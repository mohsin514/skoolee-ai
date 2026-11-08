export class MfaRequestError extends Error {
  constructor(readonly status: number, readonly reason?: string, message?: string) { super(message ?? ""); }
}

/**
 * Every MFA call goes through one place so status, reason and fallback text are
 * read the same way. A fetch that never reaches the server is status 0 /
 * `network`. A 403 with an `error` but no `reason` comes from the proxy's
 * must-change-password gate, so the user is sent to set a new password first.
 */
export async function callMfaApi<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new MfaRequestError(0, "network");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = typeof data.reason === "string" ? data.reason : undefined;
    if (response.status === 403 && !reason && typeof data.error === "string") window.location.assign("/first-login");
    throw new MfaRequestError(response.status, reason, typeof data.error === "string" ? data.error : undefined);
  }
  return data as T;
}

/** Normalises anything thrown by `callMfaApi` (or a bug) into a request error. */
export function toMfaRequestError(failure: unknown) {
  return failure instanceof MfaRequestError ? failure : new MfaRequestError(0, "server_error");
}
