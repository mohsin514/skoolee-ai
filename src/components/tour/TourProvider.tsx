"use client";

/**
 * Spotlight tour runtime (SPEC §9). One provider per RoleShell; a no-op without a console.
 *
 * Triggers: auto-start once per (tour, version) on the console landing (§9.1), Help → "Tour this page"
 * (`skoolee:start-tour`), LaunchGuide "Show me around", `?tour=<id>`, and the framed-route hand-off (a tour never runs
 * over /messages, /care, /ai…: the frame stores a pending start and opens the console, whose provider starts it).
 * Progress is server-side (`/api/auth/tour`); the in-progress step survives a reload through sessionStorage.
 *
 * Never during a scoped support session (§9.1): the provider offers no tour, ignores every start and records nothing.
 * An explicit request (Help, LaunchGuide, ?tour=, hand-off) announces itself through `skoolee:tour-state` as soon as it
 * is queued, so the welcome story never opens in front of a tour the user asked for; a request that cannot start (the
 * access check failed, or it is still not ready after a bounded wait) is dropped with a message and the shell is
 * released. If the progress endpoint cannot be read, explicit tours still run (nothing auto-starts) and every ?tour=
 * link is consumed.
 */

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_NAV, type ConsoleId } from "@/lib/navigation/role-nav";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import { navigateConsoleView } from "@/components/nav/useConsoleView";
import { subscribeWorkspaceNavigation } from "@/components/nav/useWorkspaceView";
import { isModalStackEmpty, subscribeModalStack } from "@/components/ui/modal";
import { Spotlight } from "@/components/ui/spotlight";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { toast } from "@/components/ui/toast";
import {
  REVEAL_NAV_EVENT, START_TOUR_EVENT, TOURS, TOUR_STATE_EVENT, WELCOME_FINISHED_EVENT, changeTourAvailability, consumePendingStart, hasNewTour,
  isConsoleLanding, isInsideConsole, isTourId, localize, probeUnsavedWork, resolveTour, shouldAutoStart, startIndexFor, tourForConsole,
  writePendingStart, type TourId, type TourProgress, type TourStatus, type TourStep,
} from "@/lib/onboarding/tours";
import { TourCard } from "./TourCard";
import { useTourTarget } from "./useTourTarget";

// The event names and the availability store live in the dependency-free tours/types module (the global welcome
// imports them from there); re-exported here for shell code that already imports them from the provider.
export { REVEAL_NAV_EVENT, START_TOUR_EVENT, TOUR_STATE_EVENT, WELCOME_FINISHED_EVENT };
export { subscribeTourAvailability, tourAvailableSnapshot } from "@/lib/onboarding/tours/types";

export interface TourApi {
  /** A tour exists for this console/variant. */
  available: boolean;
  /** Stored version < current (Help dot). */
  hasNew: boolean;
  active: { tourId: TourId; index: number; total: number } | null;
  start(tourId?: TourId): void;
  next(): void;
  back(): void;
  stop(reason: "done" | "dismissed"): void;
}

const noop = () => {};
const INERT: TourApi = { available: false, hasNew: false, active: null, start: noop, next: noop, back: noop, stop: noop };
const TourContext = createContext<TourApi | null>(null);

/** Outside a provider (or without a console) this is inert, so RoleHeader/HelpMenu can call it unconditionally. */
export function useTour(): TourApi {
  return useContext(TourContext) ?? INERT;
}

/* ── Session storage (try/catch: private windows and blocked storage must not break the shell). ── */
const progressKey = (userId: string, tourId: TourId) => `skoolee.tour.${userId}.${tourId}`;
const autoKey = (userId: string, tourId: TourId) => `skoolee.tour.auto.${userId}.${tourId}`;
const autoStartedInMemory = new Set<string>();
function sessionStore(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}
function readSession(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function writeSession(key: string, value: string | null): boolean {
  try {
    if (value === null) window.sessionStorage.removeItem(key); else window.sessionStorage.setItem(key, value);
    return true;
  } catch { return false; }
}

function announceTourState(active: boolean) {
  window.dispatchEvent(new CustomEvent(TOUR_STATE_EVENT, { detail: { active } }));
}

/** "Never while a form is dirty" (§9.1): asks the page's unsaved-work guards (see probeUnsavedWork). */
const hasUnsavedWork = () => typeof window !== "undefined" && probeUnsavedWork(window);

const MOBILE_QUERY = "(max-width: 767.98px)";
/** How long a requested tour may wait for the access check or an open dialog before it is dropped. */
const PENDING_START_TIMEOUT_MS = 15_000;
const subscribeMobile = (callback: () => void) => {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const searchSnapshot = () => window.location.search;
const emptySnapshot = () => "";
const emptyModalSnapshot = () => true;

type ServerState = {
  progress: TourProgress;
  /** null when the progress endpoint could not be read: explicit tours run, nothing auto-starts or resumes. */
  userId: string | null;
  welcomeCompleted: boolean;
  autoStartBlocked: boolean;
  /** A scoped SkooleeAI support session: no tour is offered, started or recorded (§9.1). */
  supportSession: boolean;
};
const OFFLINE: ServerState = { progress: {}, userId: null, welcomeCompleted: false, autoStartBlocked: true, supportSession: false };
type Pending = { tourId: TourId | null; from: "manual" | "auto" | "handoff" | "deeplink" | "resume"; index?: number };
type Active = { tourId: TourId; version: number; steps: TourStep[]; index: number; direction: 1 | -1 };

export function TourProvider({ console: consoleId, children }: { console?: ConsoleId; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSyncExternalStore(subscribeWorkspaceNavigation, searchSnapshot, emptySnapshot);
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
  const modalsEmpty = useSyncExternalStore(subscribeModalStack, isModalStackEmpty, emptyModalSnapshot);
  const navigation = useNavigationAccess();
  const access = navigation.status === "ready" ? navigation.access ?? null : null;
  const { language } = useLocale();
  const t = useUiText();
  const dir = language === "en" ? "ltr" : "rtl";
  const titleId = useId();
  const bodyId = useId();

  const [server, setServer] = useState<ServerState | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const welcomeFinished = useRef(false);
  /** The welcome story ended on a task other than the landing: the user chose where to go, so no auto-start here. */
  const autoSuppressed = useRef(false);

  const nav = consoleId ? ROLE_NAV[consoleId] : null;
  const supportSession = server?.supportSession === true;
  const tourId = consoleId && access ? tourForConsole(consoleId, access) : null;
  const def = tourId && !supportSession ? TOURS[tourId] : null;
  const available = Boolean(def);
  // Unknown progress (endpoint unreadable) lights no Help dot.
  const hasNew = Boolean(def && tourId && server?.userId && hasNewTour(server.progress[tourId], def));

  // Progress, welcome state and auto-start blockers for the signed-in account.
  useEffect(() => {
    if (!consoleId) return;
    const controller = new AbortController();
    fetch("/api/auth/tour", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        // Signed out: nothing to run. Anything else unreadable (a server error, a redirect page): degrade, never strand
        // a ?tour= link in the URL.
        if (response.status === 401) return;
        const body = response.ok ? await response.json().catch(() => null) as Partial<ServerState> | null : null;
        if (controller.signal.aborted) return;
        if (!body || typeof body.userId !== "string") { setServer(OFFLINE); return; }
        setServer({
          progress: body.progress && typeof body.progress === "object" ? body.progress : {},
          userId: body.userId,
          welcomeCompleted: body.welcomeCompleted === true || welcomeFinished.current,
          autoStartBlocked: body.autoStartBlocked === true,
          supportSession: body.supportSession === true,
        });
      })
      .catch(() => { if (!controller.signal.aborted) setServer(OFFLINE); });
    return () => controller.abort();
  }, [consoleId]);

  useEffect(() => {
    if (!available) return;
    changeTourAvailability(1);
    return () => changeTourAvailability(-1);
  }, [available]);

  /* ── Requests ─────────────────────────────────────────────────────────── */
  // An explicit request is announced at once (not after the next render), so FirstRunGuide, which decides whether to
  // open the welcome story when its own request returns, already sees that a tour is on its way.
  const request = useCallback((next: Pending) => {
    if (next.from !== "auto") announceTourState(true);
    setPending(next);
  }, []);

  const start = useCallback((requested?: TourId) => {
    if (!consoleId || !nav) return;
    if (requested && (!isTourId(requested) || TOURS[requested].console !== consoleId)) return;
    if (supportSession) { toast.info(t("Tours are paused during a support session.")); return; }
    if (!isInsideConsole(nav, window.location.pathname)) {
      // Leaving the frame would drop unsaved work, and the navigation guard only intercepts link clicks.
      if (hasUnsavedWork()) { toast.warning(t("Save or discard your changes first, then start the tour.")); return; }
      // Framed route: hand the start to the console's own provider; steps never run over a frame [K-I1].
      const id = requested ?? tourId ?? (consoleId === "admin" ? "admin-campus" : consoleId);
      const stored = server?.userId ? writePendingStart(sessionStore(), server.userId, id) : false;
      router.push(stored ? nav.base : `${nav.base}?tour=${id}`);
      return;
    }
    request({ tourId: requested ?? null, from: "manual" });
  }, [consoleId, nav, tourId, server, router, t, supportSession, request]);

  const persist = useCallback((id: TourId, version: number, status: TourStatus) => {
    setServer((current) => current ? { ...current, progress: { ...current.progress, [id]: { v: version, s: status, at: new Date().toISOString() } } } : current);
    // A support session never records progress on the account it is helping (§9.1); the server refuses it too.
    if (server?.supportSession) return;
    void fetch("/api/auth/tour", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourId: id, version, status }),
      signal: AbortSignal.timeout(15000),
    }).catch(noop);
  }, [server?.supportSession]);

  // The running tour mirrors into a ref so rapid Next/Skip presses read the latest step without side effects
  // inside state updaters (StrictMode runs updaters twice).
  const activeRef = useRef<Active | null>(null);
  const commit = useCallback((value: Active | null) => { activeRef.current = value; setActive(value); }, []);

  const finish = useCallback((current: Active, reason: TourStatus) => {
    persist(current.tourId, current.version, reason);
    if (server?.userId) writeSession(progressKey(server.userId, current.tourId), null);
    commit(null);
  }, [persist, server, commit]);

  const stop = useCallback((reason: TourStatus) => {
    const current = activeRef.current;
    if (current) finish(current, reason);
    setPending(null);
  }, [finish]);

  const move = useCallback((direction: 1 | -1) => {
    const current = activeRef.current;
    if (!current) return;
    // Skipping backwards past the first step turns around (a missing first anchor must not strand the tour).
    const forward = current.index + direction < 0;
    const index = forward ? current.index + 1 : current.index + direction;
    if (index >= current.steps.length) { finish(current, "done"); return; }
    commit({ ...current, index, direction: forward ? 1 : direction });
  }, [finish, commit]);
  const next = useCallback(() => move(1), [move]);
  const back = useCallback(() => { if ((activeRef.current?.index ?? 0) > 0) move(-1); }, [move]);

  // Help menu, LaunchGuide and teacher onboarding ask through a window event.
  useEffect(() => {
    if (!consoleId) return;
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<{ tourId?: TourId } | undefined>).detail;
      start(detail?.tourId);
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [consoleId, start]);

  // "Show me around" / "Explore on my own" end the welcome story; auto-start may follow, but only if the user stays on
  // the console landing (§9.1). A chosen task (`detail.href`) that is not the landing rules auto-start out for this
  // visit even before the router has moved there; Help still offers the tour.
  useEffect(() => {
    const onFinished = (event: Event) => {
      const href = (event as CustomEvent<{ href?: string } | undefined>).detail?.href;
      if (href && nav) {
        try {
          const url = new URL(href, window.location.origin);
          if (!isConsoleLanding(nav, url.pathname, url.search, url.hash)) autoSuppressed.current = true;
        } catch { autoSuppressed.current = true; }
      }
      welcomeFinished.current = true;
      setServer((current) => current ? { ...current, welcomeCompleted: true } : current);
    };
    window.addEventListener(WELCOME_FINISHED_EVENT, onFinished);
    return () => window.removeEventListener(WELCOME_FINISHED_EVENT, onFinished);
  }, [nav]);

  // Framed hand-off, in-progress resume (reload) and ?tour= deep links, once the account is known (or known to be
  // unreadable). The hand-off key and ?tour= are always consumed; a support session consumes them without starting.
  const consumed = useRef(false);
  useEffect(() => {
    if (!consoleId || !nav || !server || consumed.current) return;
    if (!isInsideConsole(nav, window.location.pathname)) return;
    consumed.current = true;
    const handed = server.userId ? consumePendingStart(sessionStore(), server.userId, consoleId) : null;
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("tour");
    if (linked !== null) {
      params.delete("tour");
      const query = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
    if (server.supportSession) return;
    if (handed) { request({ tourId: handed, from: "handoff" }); return; }
    if (linked !== null && isTourId(linked) && TOURS[linked].console === consoleId) { request({ tourId: linked, from: "deeplink" }); return; }
    if (!server.userId) return;
    for (const id of Object.keys(TOURS) as TourId[]) {
      if (TOURS[id].console !== consoleId) continue;
      const saved = readSession(progressKey(server.userId, id));
      if (saved === null) continue;
      const index = Number.parseInt(saved, 10);
      if (Number.isInteger(index) && index >= 0) { request({ tourId: id, from: "resume", index }); return; }
    }
  }, [consoleId, nav, server, request]);

  // Auto-start (§9.1): welcome done, access ready, nothing modal open, on the landing, tall enough, not blocked,
  // not yet seen at this version, and not already offered in this tab.
  useEffect(() => {
    if (!consoleId || !nav || !server || !server.userId || !def || !tourId || active || pending) return;
    if (!server.welcomeCompleted || server.autoStartBlocked || server.supportSession || autoSuppressed.current || !modalsEmpty) return;
    if (window.innerHeight < 420) return;
    if (!isConsoleLanding(nav, pathname, search, window.location.hash)) return;
    if (!shouldAutoStart(server.progress[tourId], def)) return;
    const marker = `${def.version}`;
    const key = autoKey(server.userId, tourId);
    if (readSession(key) === marker || autoStartedInMemory.has(`${key}:${marker}`)) return;
    const timer = window.setTimeout(() => {
      // The search snapshot follows popstate and view changes, not router.push; read the real location when the timer
      // fires so a task chosen meanwhile (same path, other ?view=) is never covered by the tour.
      if (autoSuppressed.current || window.innerHeight < 420) return;
      if (!isConsoleLanding(nav, window.location.pathname, window.location.search, window.location.hash)) return;
      writeSession(key, marker);
      autoStartedInMemory.add(`${key}:${marker}`);
      setPending({ tourId, from: "auto" });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [consoleId, nav, server, def, tourId, active, pending, modalsEmpty, pathname, search]);

  // A pending start runs once access is ready and no other dialog is open.
  useEffect(() => {
    if (!pending || active || !consoleId || !nav || !access || !tourId || !modalsEmpty) return;
    if (!def || (pending.tourId && TOURS[pending.tourId].console !== consoleId)) { setPending(null); return; }
    // A tour moves between views; it never starts over unsaved work. Asked for: say why. Automatic: stay quiet.
    if (pending.from !== "resume" && hasUnsavedWork()) {
      setPending(null);
      if (pending.from !== "auto") toast.warning(t("Save or discard your changes first, then start the tour."));
      return;
    }
    const steps = resolveTour(def, { access, mobile });
    const location = { pathname: window.location.pathname, search: window.location.search };
    const index = pending.from === "manual"
      ? startIndexFor(steps, nav, location.pathname, location.search)
      : pending.from === "resume" ? Math.min(pending.index ?? 0, steps.length - 1) : 0;
    setPending(null);
    commit({ tourId, version: def.version, steps, index, direction: 1 });
  }, [pending, active, consoleId, nav, access, def, tourId, modalsEmpty, mobile, commit, t]);

  // A request that cannot start is dropped, never left hanging: while an explicit one is pending the shell counts as
  // engaged (chat launcher hidden, live toasts and the bell paused, the welcome kept closed). A failed access check
  // drops it at once; an access check still loading, or a dialog still open, drops it after a bounded wait.
  const accessFailed = navigation.status === "error";
  const accessReady = access !== null;
  useEffect(() => {
    if (!pending || active) return;
    const drop = () => {
      setPending(null);
      // Asked for (Help, LaunchGuide, ?tour=, hand-off): say it did not start. Automatic and resumed starts stay quiet.
      if (pending.from !== "auto" && pending.from !== "resume") toast.error(t("The tour could not start. Try again from Help."));
    };
    if (accessFailed) { drop(); return; }
    const timer = window.setTimeout(drop, PENDING_START_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pending, active, accessFailed, accessReady, t]);

  // Access is cached for the session and revalidated in the background (addendum 2026-10-22, §3), so it can narrow
  // while a tour runs; the layout can also cross the phone breakpoint. Either way the steps are resolved again: the
  // current step stays when it still applies, otherwise the tour moves on to the next one that does, and it ends
  // quietly when nothing is left or the console variant itself changed (a step never points at a denied control).
  useEffect(() => {
    const current = activeRef.current;
    if (!current || !access || !consoleId) return;
    if (tourForConsole(consoleId, access) !== current.tourId) {
      if (server?.userId) writeSession(progressKey(server.userId, current.tourId), null);
      commit(null);
      return;
    }
    const steps = resolveTour(TOURS[current.tourId], { access, mobile });
    const signature = (list: TourStep[]) => list.map((s) => `${s.id}@${s.anchor}`).join("|");
    if (signature(steps) === signature(current.steps)) return;
    const order = TOURS[current.tourId].steps.map((s) => s.id);
    const rank = (id: string) => (id === "essentials" ? Number.POSITIVE_INFINITY : order.indexOf(id));
    const currentId = current.steps[current.index]?.id ?? "";
    let index = steps.findIndex((s) => s.id === currentId);
    if (index < 0) index = steps.findIndex((s) => rank(s.id) > rank(currentId));
    if (index < 0) { finish(current, "done"); return; }
    commit({ ...current, steps, index });
  }, [access, mobile, consoleId, server, commit, finish]);

  /* ── Running a step ───────────────────────────────────────────────────── */
  const step = active ? active.steps[active.index] ?? null : null;
  // The step's id and anchor are part of the key: a re-resolved list can put another step (or the phone anchor) at
  // the same index, and its view, group and target must be prepared again.
  const stepKey = active && step ? `${active.tourId}:${active.index}:${step.id}:${step.anchor}` : null;

  useEffect(() => {
    if (!active || !step || !consoleId || !nav) return;
    if (server?.userId) writeSession(progressKey(server.userId, active.tourId), String(active.index));
    if (step.view) {
      const params = new URLSearchParams(window.location.search);
      const view = params.get("view") || nav.defaultView;
      const sameView = window.location.pathname === nav.base && view === step.view && (!step.tab || params.get("tab") === step.tab);
      if (!sameView) navigateConsoleView(step.view, step.tab ?? null, { consoleId, push: (href) => router.push(href) });
    } else if (step.route && window.location.pathname !== step.route) {
      router.push(step.route);
    }
    const groupId = step.revealGroup ?? (!mobile ? /^shell\.nav-group\.([a-z0-9-]+)$/.exec(step.anchor)?.[1] : undefined);
    if (groupId) window.dispatchEvent(new CustomEvent(REVEAL_NAV_EVENT, { detail: { groupId } }));
    // stepKey identifies the step; the other values are read at that moment only.
  }, [stepKey]);

  const target = useTourTarget(step?.anchor ?? null, { key: stepKey, timeout: step?.waitMs });

  // A control that never appears (a view without that panel, a breakpoint that hides it) is skipped, not waited on.
  useEffect(() => {
    if (target.status === "missing" && activeRef.current) move(activeRef.current.direction);
  }, [target.status, stepKey]);

  // Tell the shell a tour is running (or explicitly requested and about to start): live toasts, the bell shake and
  // the chat launcher pause, and the welcome story stays closed.
  const running = Boolean(active);
  const engaged = running || Boolean(pending && pending.from !== "auto");
  useEffect(() => { announceTourState(engaged); }, [engaged]);
  useEffect(() => () => { announceTourState(false); }, []);

  // The workspace finder (Alt+Shift+K) would open a second overlay; ignore it while the tour runs.
  useEffect(() => {
    if (!running) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === "KeyK") { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [running]);

  const tryIt = useCallback(() => {
    const element = target.element as HTMLElement | null;
    if (element) { element.focus({ preventScroll: true }); element.click(); }
    move(1);
  }, [target.element, move]);

  const api = useMemo<TourApi>(() => consoleId ? {
    available,
    hasNew,
    active: active ? { tourId: active.tourId, index: active.index, total: active.steps.length } : null,
    start, next, back, stop,
  } : INERT, [consoleId, available, hasNew, active, start, next, back, stop]);

  return <TourContext.Provider value={api}>
    {children}
    {active && step ? <Spotlight
      target={target.element}
      interaction={step.interaction ?? "none"}
      placement={step.placement ?? "auto"}
      pending={target.status === "searching"}
      onDismiss={() => stop("dismissed")}
      labelledBy={titleId}
      describedBy={bodyId}
    >
      <TourCard
        titleId={titleId}
        bodyId={bodyId}
        title={localize(step.title, language)}
        body={localize(step.body, language)}
        index={active.index}
        total={active.steps.length}
        dir={dir}
        canTry={step.interaction === "try" && Boolean(target.element)}
        onBack={back}
        onNext={next}
        onSkip={() => stop("dismissed")}
        onTry={tryIt}
      />
    </Spotlight> : null}
  </TourContext.Provider>;
}
