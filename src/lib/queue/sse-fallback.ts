// SKAI-1035: SSE response used when Redis realtime is disabled.
//
// Emits the given events plus `event: realtime {enabled:false}` and closes the
// stream. The long `retry` makes the browser's EventSource reconnect only once
// a minute, so the stream degrades to a quiet DB poll instead of a hot loop.

export const REALTIME_DISABLED_RETRY_MS = 60_000;

export function realtimeDisabledBody(events: string[] = []): string {
  return (
    `retry: ${REALTIME_DISABLED_RETRY_MS}\n\n` +
    events.join("") +
    `event: realtime\ndata: ${JSON.stringify({ enabled: false })}\n\n`
  );
}

export function realtimeDisabledResponse(events: string[] = []): Response {
  return new Response(realtimeDisabledBody(events), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Realtime": "disabled",
    },
  });
}
