"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AI_SETUP_HREF, campusTaskHref, isLaunchEntry, isLaunchTask, START_CAMPUS_SETUP_EVENT } from "@/lib/onboarding/launch-plan";
// The dependency-free tours module only: event names and the hand-off key, never the tour engine or its catalogs.
import { REPLAY_WELCOME_EVENT, TOUR_STATE_EVENT, WELCOME_FINISHED_EVENT, pendingStartKey } from "@/lib/onboarding/tours/types";
import type { Language } from "@/lib/locale/package";
import type { LaunchContext } from "./LaunchGuide";

export { REPLAY_WELCOME_EVENT, WELCOME_FINISHED_EVENT };

/**
 * This component is mounted in the root layout, so it ships on every route (sign-in and public pages included). The
 * welcome story itself — its stage, copy tables and the modal — loads on demand, the first time it opens; so do the
 * toast (and with it the translation catalogs) and the welcome copy, which only a failed replay needs.
 */
const LaunchGuide = dynamic(() => import("./LaunchGuide").then((loaded) => loaded.LaunchGuide), { ssr: false });

/**
 * The welcome story differs for an ADMIN: the standalone owner (two hats) or, inside a GROUP, a campus operator; and
 * within the owner story, billing is mentioned only for the subscription holder. /api/auth/welcome does not carry the
 * kind yet, so it is read from the session (P1 contract). Any failure leaves the kind unknown, and LaunchGuide then
 * tells the campus story (guideRoleFor fails closed): an ADMIN is never told they own billing unless the school is
 * known to be STANDALONE and the session says they are its subscription owner. A known STANDALONE kind also points
 * the campus task at the school's own profile.
 */
async function withInstitutionKind(context: LaunchContext | null, signal: AbortSignal): Promise<LaunchContext | null> {
  if (!context || context.role !== "ADMIN" || (context.institutionKind && context.billing !== undefined)) return context;
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store", signal });
    if (!response.ok) return context;
    const body = await response.json() as { user?: { institution?: { kind?: unknown; isAuthority?: unknown; isOwner?: unknown } } | null };
    const institution = body.user?.institution;
    const kind = institution?.kind;
    if (kind !== "GROUP" && kind !== "STANDALONE") return context;
    // canOwnSubscription = authority AND (owner OR purchase delegate). The session exposes the owner flag, not the
    // delegation, so a delegate without the owner flag hears the story without billing (fails closed).
    const billing = institution?.isAuthority === true && institution.isOwner === true;
    const actions = context.actions.map(action => action.task === "campus" ? { ...action, href: campusTaskHref(context.role, kind) } : action);
    return { ...context, institutionKind: kind, billing, actions };
  } catch { return context; }
}

/** A tour handed over from a framed route (Help → "Tour my workspace") that the console has not picked up yet. */
function tourHandOffPending(userId: string): boolean {
  try { return window.sessionStorage.getItem(pendingStartKey(userId)) !== null; } catch { return false; }
}

function documentLanguage(): Language {
  if (typeof document === "undefined") return "en";
  const base = document.documentElement.lang.toLowerCase().split("-")[0];
  return base === "ar" || base === "ur" ? base : "en";
}

async function loadWelcome(signal: AbortSignal): Promise<{ status: number; context: LaunchContext | null }> {
  const response = await fetch("/api/auth/welcome", { cache: "no-store", signal });
  if (!response.ok) return { status: response.status, context: null };
  const result = await response.json() as { context: LaunchContext | null };
  return { status: response.status, context: await withInstitutionKind(result.context, signal) };
}

/** Server-backed first use, shared across all role entry screens. No browser flag can complete setup. */
export function FirstRunGuide() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams().toString();
  const [context, setContext] = useState<LaunchContext | null>(null);
  const [open, setOpen] = useState(false);
  const generation = useRef(0);
  /** The automatic welcome request in flight (re-run on every entry path and ?view= change). */
  const automatic = useRef<AbortController | null>(null);
  /** Help → "Replay welcome" in flight. It supersedes the automatic request and is never superseded by one. */
  const replaying = useRef<AbortController | null>(null);
  const tourRunning = useRef(false);
  const enabled = isLaunchEntry(pathname);

  // Mounted once in the root layout, so this sees every tour start and stop.
  useEffect(() => {
    const onTour = (event: Event) => { tourRunning.current = (event as CustomEvent<{ active?: boolean }>).detail?.active === true; };
    window.addEventListener(TOUR_STATE_EVENT, onTour);
    return () => window.removeEventListener(TOUR_STATE_EVENT, onTour);
  }, []);

  useEffect(() => {
    const sequence = ++generation.current;
    const controller = new AbortController();
    automatic.current = controller;
    // A replay the user asked for keeps the screen; this visit's automatic check simply does not run.
    if (replaying.current) return () => controller.abort();
    setOpen(false); setContext(null);
    if (!enabled) return () => controller.abort();
    // Deep links lead straight to their task. Replay remains available from Help afterwards.
    const directTask = isLaunchTask(search, window.location.hash);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
    void loadWelcome(signal).then(({ context: next }) => {
      if (sequence !== generation.current || controller.signal.aborted || replaying.current) return;
      setContext(next);
      // A running or requested spotlight tour keeps the screen; the story waits for Help → Replay welcome or the next visit.
      setOpen(Boolean(next && !next.completed && !directTask && !tourRunning.current && !tourHandOffPending(next.userId)));
    }).catch(() => {
      // An automatic welcome that cannot load stays out of the way; Help → Replay welcome retries and explains.
    });
    return () => controller.abort();
  }, [pathname, enabled, search]);

  const replay = useCallback(async () => {
    // One replay at a time. An automatic request still in flight (every ?view= switch starts one) is superseded, not
    // waited on, so "Replay welcome" always answers.
    if (replaying.current) return;
    automatic.current?.abort();
    const controller = new AbortController();
    replaying.current = controller;
    try {
      const { status, context: next } = await loadWelcome(AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]));
      if (controller.signal.aborted) return;
      if (status < 200 || status >= 300) throw new Error(`unavailable (${status})`);
      // No story right now (a password change or a candidate exam comes first): nothing opens, as before.
      setContext(next); setOpen(Boolean(next));
    } catch {
      if (!controller.signal.aborted) {
        void Promise.all([import("@/components/ui/toast"), import("./launch-copy")])
          .then(([{ toast }, { launchCopy }]) => { toast.error(launchCopy(documentLanguage()).loadFailed); })
          .catch(() => {});
      }
    } finally {
      if (replaying.current === controller) replaying.current = null;
    }
  }, []);

  useEffect(() => {
    const onReplay = () => { void replay(); };
    window.addEventListener(REPLAY_WELCOME_EVENT, onReplay);
    return () => {
      window.removeEventListener(REPLAY_WELCOME_EVENT, onReplay);
      replaying.current?.abort();
      replaying.current = null;
    };
  }, [replay]);

  if (!context || !open) return null;
  const finish = async (href?: string) => {
    const sequence = generation.current;
    if (!context.completed) {
      const response = await fetch("/api/auth/welcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error("not-saved");
    }
    if (generation.current !== sequence) return;
    setContext({ ...context, completed: true }); setOpen(false);
    window.dispatchEvent(new CustomEvent(WELCOME_FINISHED_EVENT, { detail: { href } }));
    if (href && context.actions.some(action => action.href === href)) {
      // Already on the setup questionnaire's entry: open it in place (a push to the same URL would not).
      if (href === AI_SETUP_HREF && href === window.location.pathname + window.location.search) window.dispatchEvent(new Event(START_CAMPUS_SETUP_EVENT));
      else if (href !== window.location.pathname + window.location.search) router.push(href);
    }
  };
  return <LaunchGuide key={context.userId} context={context} onFinish={finish} onDismiss={() => setOpen(false)} />;
}
