/** The owner's live support session, as /api/owner/support/session returns it. */
export type SupportSessionState = { id: string; expiresAt: string } & Record<string, unknown>;
/** What one check of the session endpoint found; `ok` is false when the request failed or was refused. */
export type SupportSessionCheck<T extends SupportSessionState = SupportSessionState> = { ok: boolean; session: T | null };

/** The page event other owner views listen to instead of polling the same endpoint themselves. */
export const SUPPORT_SESSION_STATE_EVENT = "skoolee:support-session-state";
/** Fired by owner views after they start, end or request support access. */
export const SUPPORT_SESSION_CHANGE_EVENT = "skoolee:support-session-change";
/** How often an active session is re-checked, so a revoke from another tab still clears it. */
export const SUPPORT_SESSION_POLL_MS = 15_000;

type Host = Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval" | "setTimeout" | "clearTimeout">;
type Doc = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;

/**
 * SKAI-1867: check the support session once on start, on the change event and when the tab becomes
 * visible again. Poll only while a session is active and the tab is visible, plus one check just
 * after it expires. With no session, or a hidden tab, nothing is requested.
 */
export function watchSupportSession<T extends SupportSessionState>(
  read: () => Promise<SupportSessionCheck<T>>,
  onCheck: (check: SupportSessionCheck<T>) => void,
  host: Host = window,
  doc: Doc = document,
): () => void {
  let alive = true;
  let sequence = 0;
  let poll: number | undefined;
  let expiry: number | undefined;
  let known: T | null = null;
  const stopTimers = () => {
    if (poll !== undefined) host.clearInterval(poll);
    if (expiry !== undefined) host.clearTimeout(expiry);
    poll = expiry = undefined;
  };
  const schedule = (session: T | null) => {
    stopTimers();
    if (!alive || !session) return;
    poll = host.setInterval(() => { if (!doc.hidden) void refresh(); }, SUPPORT_SESSION_POLL_MS);
    // One check just after expiry. Skip it when the client clock already says expired (clock skew):
    // a 0ms timer would re-check every second until the server agrees, and the poll covers it.
    const untilExpiry = Date.parse(session.expiresAt) - Date.now();
    if (Number.isFinite(untilExpiry) && untilExpiry > 0) expiry = host.setTimeout(() => void refresh(), Math.min(untilExpiry + 1_000, 2_147_483_647));
  };
  const refresh = async () => {
    const mine = ++sequence;
    let check: SupportSessionCheck<T>;
    try { check = await read(); } catch { check = { ok: false, session: null }; }
    if (!alive || mine !== sequence) return;
    // A failed check while a session was known keeps polling, so a transient error does not hide a
    // live session until the next tab switch.
    if (check.ok) known = check.session;
    schedule(check.ok ? check.session : known);
    onCheck(check);
  };
  const onChange = () => void refresh();
  const onVisible = () => { if (!doc.hidden) void refresh(); };
  void refresh();
  host.addEventListener(SUPPORT_SESSION_CHANGE_EVENT, onChange);
  doc.addEventListener("visibilitychange", onVisible);
  return () => {
    alive = false;
    stopTimers();
    host.removeEventListener(SUPPORT_SESSION_CHANGE_EVENT, onChange);
    doc.removeEventListener("visibilitychange", onVisible);
  };
}
