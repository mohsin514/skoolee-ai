// SKAI-1035 / SKAI-1952: the realtime streams' answer when Redis realtime is disabled.
//
// There is nothing to stream, so the answer is 204: EventSource stops and never reconnects. An open tab used to
// reconnect every minute, and each reconnect cost a sign-in check and a count query: about two database-touching
// requests per user per minute for no new information. The page already loaded the same counts through the
// shell; while the stream is closed the browser refreshes them on a slow timer instead
// (src/lib/network/closed-stream-refresh.ts). The answer carries no data, so it needs no sign-in.

export function realtimeOffResponse(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Realtime": "disabled" } });
}
