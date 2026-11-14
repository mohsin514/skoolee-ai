// SKAI-1952: keep a page fresh while its realtime stream is closed.
//
// A stream ends for good when the server answers 204 (realtime disabled, sse-fallback.ts) or a fatal error; the
// browser does not reconnect after either. Until the stream is reopened, `refresh` runs every `everyMs` while the
// tab is visible, and once on returning to a tab that missed a refresh, so badges and threads still catch up.

export const CLOSED_STREAM_REFRESH_MS = 120_000;

export function refreshWhileClosed(source: EventSource, refresh: () => void, everyMs = CLOSED_STREAM_REFRESH_MS): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let missed = false;
  const tick = () => {
    if (document.visibilityState === "visible") { missed = false; refresh(); } else missed = true;
  };
  const onVisible = () => { if (missed && document.visibilityState === "visible") tick(); };
  const onError = () => {
    if (timer || source.readyState !== EventSource.CLOSED) return;
    timer = setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", onVisible);
  };
  source.addEventListener("error", onError);
  return () => {
    source.removeEventListener("error", onError);
    if (timer) clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
