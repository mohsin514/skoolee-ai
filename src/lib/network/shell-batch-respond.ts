// SKAI-1975: how /api/shell answers. Kept apart from the route so it can be tested without the route handlers.
export type ShellResult = { s: number; h: Record<string, string>; b: string };

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Runs each distinct path + query ONCE (a repeated path shares the first run's result) and answers either:
 * - `stream: true`: NDJSON, one `{ i, s, h, b }` line per requested index, written as soon as that path settles, so
 *   a quick read (session, profile) is not held behind the slowest badge;
 * - otherwise the original `{ r: [...] }` JSON, in request order (browsers still running the earlier client).
 * `run` must not reject: the route turns a handler failure into a 500 result.
 */
export async function respondShellBatch(keys: string[], run: (index: number) => Promise<ShellResult>, stream: boolean): Promise<Response> {
  const runs = new Map<string, Promise<ShellResult>>();
  const results = keys.map((key, index) => {
    if (!runs.has(key)) runs.set(key, run(index));
    return runs.get(key)!;
  });
  if (!stream) return Response.json({ r: await Promise.all(results) }, { headers: NO_STORE });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      await Promise.all(results.map(async (result, i) => {
        controller.enqueue(encoder.encode(`${JSON.stringify({ i, ...(await result) })}\n`));
      }));
      controller.close();
    },
  });
  return new Response(body, { headers: { ...NO_STORE, "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
