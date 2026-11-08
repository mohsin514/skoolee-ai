import { PublicError, logRequest, type Caller } from "./service";

// SKO-445: the public error envelope — { error: { code, message } } — with the contract version on every response.
export async function respond(request: Request, work: (setCaller: (c: Caller) => void) => Promise<{ status?: number; body: unknown; headers?: Record<string, string> }>) {
  let caller: Caller | null = null;
  const path = new URL(request.url).pathname;
  const base = { "Content-Type": "application/json", "Cache-Control": "no-store", "Skoolee-Api-Version": "v1" };
  try {
    const r = await work(c => { caller = c; });
    const status = r.status ?? 200;
    await logRequest(caller, request.method, path, status);
    return new Response(JSON.stringify(r.body), { status, headers: { ...base, ...(r.headers ?? {}) } });
  } catch (error) {
    if (error instanceof PublicError) {
      await logRequest(caller, request.method, path, error.status);
      return new Response(JSON.stringify({ error: { code: error.code, message: error.message } }), { status: error.status, headers: { ...base, ...error.headers } });
    }
    console.error("[public-api] failed", path, error);
    await logRequest(caller, request.method, path, 500);
    return new Response(JSON.stringify({ error: { code: "INTERNAL", message: "Something went wrong. Retry with the same Idempotency-Key." } }), { status: 500, headers: base });
  }
}
