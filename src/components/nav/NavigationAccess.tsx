"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { moduleForHref, type NavigationAccess } from "@/lib/navigation/modules";
import { SkeletonRegion } from "@/components/ui/skeleton";
import { AccessNotice, type AccessNoticeProps } from "@/components/ui/access-notice";
import { ErrorState } from "@/components/ui/error-state";
import { useUiText } from "@/components/locale/LocaleProvider";
import { PageSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";

type AccessState = { access: NavigationAccess | null; status: 'loading' | 'ready' | 'error'; retry: () => void };
const Context = createContext<AccessState | null>(null);

/**
 * Revalidation policy (addendum 2026-10-22 §3). The confirmed map is reused across routes, `?view=` switches and
 * window focus; a background revalidation runs at most once per minute (mount, route change), and on focus only
 * once the map is five minutes old. A back/forward-cache restore, a retry and `skoolee:access-changed` always recheck.
 */
export const ACCESS_REVALIDATE_MS = 60_000;
export const ACCESS_FOCUS_REVALIDATE_MS = 5 * 60_000;
const STORAGE_KEY = "skoolee.navigation-access.v1";

export type RevalidateReason = "mount" | "route" | "focus" | "restore" | "retry" | "changed";
/** Whether a revalidation should run now (pure; unit-tested). Without a confirmed map it always runs. */
export function shouldRevalidate(reason: RevalidateReason, lastAttempt: number | null, now: number, hasMap: boolean): boolean {
  if (!hasMap || lastAttempt === null) return true;
  if (reason === "restore" || reason === "retry" || reason === "changed") return true;
  const age = now - lastAttempt;
  return reason === "focus" ? age >= ACCESS_FOCUS_REVALIDATE_MS : age >= ACCESS_REVALIDATE_MS;
}

/** Whose access a map is: the `scope` that `GET /api/navigation/access` returns (P1). */
export interface AccessScope { userId: string; schoolId: string; role: string; accessVersion: number | null }
/** Cache key: user + school + role + access version. Any change (a membership or permission edit bumps the version) drops the cache. */
export function accessCacheKey(scope: Partial<AccessScope> | null | undefined): string | null {
  if (!scope?.userId || !scope.schoolId || !scope.role) return null;
  return [scope.userId, scope.schoolId, scope.role, String(scope.accessVersion ?? 0)].join("|");
}

export type CacheEntry = { key: string | null; access: NavigationAccess; at: number };

/**
 * The last confirmed map for this tab's session: in memory (survives client navigations, where every console and
 * frame mounts its own provider) and in sessionStorage (survives a reload; never localStorage, never shared across
 * tabs). It only decides what the shell shows first — every API and page route still enforces on each request.
 * A stored map is trusted only for the same signed-in identity (the shell's session read names it), and both copies
 * are cleared on sign-out, on a 401 and whenever the identity or access version changes.
 */
let memory: CacheEntry | null = null;
let lastAttempt: number | null = null;
let identity: string | null = null;
const identityListeners = new Set<() => void>();

function readStored(): CacheEntry | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    return typeof parsed.key === "string" && isAccessMap(parsed.access) && typeof parsed.at === "number" ? (parsed as CacheEntry) : null;
  } catch {
    return null;
  }
}
function writeCache(entry: CacheEntry) {
  memory = entry;
  try {
    // Only a map that names its owner survives a reload.
    if (entry.key) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* blocked storage: the memory copy still serves client navigations */ }
}

/** Forget every confirmed map (sign-out, a signed-out response, another identity). */
export function clearNavigationAccessCache() {
  memory = null;
  lastAttempt = null;
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Called by the shell's session store (ScopeBadge) with the signed-in identity after each session read, or `null`
 * when the read says nobody is signed in. A different identity than the cached map's drops the cache.
 */
export function noteNavigationIdentity(scope: Partial<AccessScope> | null) {
  const next = accessCacheKey(scope);
  if (scope === null) clearNavigationAccessCache();
  else if (next) {
    const cachedKey = memory?.key ?? readStored()?.key;
    if (cachedKey && cachedKey !== next) clearNavigationAccessCache();
  }
  if (next === identity) return;
  identity = next;
  identityListeners.forEach((listener) => listener());
}
function adoptIdentity(key: string | null) {
  if (!key || key === identity) return;
  identity = key;
  identityListeners.forEach((listener) => listener());
}

/**
 * Store a revalidation's map under the `scope` the access route returned with it. When that scope differs from the
 * one the cached map was confirmed for (another user or school, a role change, a bumped access version), the old map
 * is dropped first — memory and sessionStorage — so nothing confirmed for the previous scope survives; the throttle
 * keeps counting from this attempt. The access route answers for the same cookie as the session read, so its scope
 * becomes the identity from now on (a session snapshot read earlier in this tab must not make the fresh map look foreign).
 */
export function acceptRevalidation(scope: Partial<AccessScope> | null | undefined, access: NavigationAccess, now = Date.now()): CacheEntry {
  const key = accessCacheKey(scope);
  const previous = memory?.key ?? (typeof window === "undefined" ? null : readStored()?.key ?? null);
  if (previous && previous !== key) {
    const attemptedAt = lastAttempt;
    clearNavigationAccessCache();
    lastAttempt = attemptedAt;
  }
  const entry: CacheEntry = { key, access, at: now };
  writeCache(entry);
  adoptIdentity(key);
  return entry;
}
function subscribeIdentity(listener: () => void) {
  identityListeners.add(listener);
  return () => { identityListeners.delete(listener); };
}

/** The confirmed map this provider may show first, if any (never on the server: the cache is per browser tab). */
function trustedCache(): CacheEntry | null {
  if (typeof window === "undefined") return null;
  // Memory belongs to this tab's JS context: trusted unless the session read names someone else.
  if (memory && (!identity || !memory.key || memory.key === identity)) return memory;
  // A stored map (after a reload) only once the session read confirms it is the same identity.
  const stored = identity ? readStored() : null;
  if (stored && stored.key === identity) { memory = stored; return stored; }
  return null;
}

type AccessResult = { signedOut: true } | { signedOut?: false; scope: Partial<AccessScope> | null; access: NavigationAccess };
type SharedCheck = { id: number; promise: Promise<AccessResult> };
let shared: SharedCheck | null = null;
let generation = 0;

/**
 * One access check per tab at a time, shared by every provider that mounts while it is on the wire (React's dev
 * double mount, a console handing over to a framed route). An unmount never cancels it: its answer still lands in the
 * cache for the next provider. A slow server is not a failure: each attempt gets 30 s and a failed one is retried twice.
 * Only the newest check may write the cache, so a late answer to a superseded check can never replace a newer map.
 */
function requestAccess(force: boolean): SharedCheck {
  if (shared && !force) return shared;
  const id = ++generation;
  const promise = (async (): Promise<AccessResult> => {
    for (let left = 2; ; left--) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch('/api/navigation/access', { cache: 'no-store', signal: controller.signal });
        if (response.status === 401) {
          if (id === generation) clearNavigationAccessCache();
          return { signedOut: true };
        }
        if (!response.ok) throw new Error('Access unavailable');
        const body = await response.json();
        if (!isAccessMap(body.access)) throw new Error('Invalid access');
        // A different scope than the cached map's drops that map before this one is stored (acceptRevalidation).
        if (id === generation) acceptRevalidation(body.scope, body.access);
        return { scope: body.scope ?? null, access: body.access };
      } catch (error) {
        if (left <= 0) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      } finally {
        window.clearTimeout(timeout);
      }
    }
  })();
  const check = { id, promise };
  shared = check;
  promise.then(() => undefined, () => undefined).finally(() => { if (shared === check) shared = null; });
  return check;
}

function isAccessMap(value: unknown): value is NavigationAccess {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.values(value as object).every((entry) => typeof entry === 'boolean');
}

/**
 * The caller's server-computed access map (17 permission modules + capability keys, all booleans).
 *
 * Stale-while-revalidate over a per-session cache: a route change, a `?view=` switch or a window focus never
 * re-renders the shell skeleton — only a session's very first load with nothing cached does. Revalidation runs in
 * the background (see `shouldRevalidate`); when it returns narrower access, the now-denied view closes at once
 * (RoleShell's fence and ViewGate read this map). Providers share one check on the wire (`requestAccess`) and an
 * unmount never cancels it; with a confirmed map on screen a failed revalidation keeps it. A 401 clears the cache and
 * closes everything.
 */
export function NavigationAccessProvider({ children, access: provided }: { children: ReactNode; access?: NavigationAccess | null }) {
  const pathname = usePathname();
  // A client navigation mounts this provider with the cached map already on screen: no skeleton, not even for a
  // frame. The server render (and the first hydration after a reload) has no cache and starts from `loading`.
  const [state, setState] = useState<Omit<AccessState, 'retry'>>(() => {
    const cached = provided === undefined ? trustedCache() : null;
    return cached ? { access: cached.access, status: 'ready' } : { access: null, status: 'loading' };
  });
  const readyRef = useRef<NavigationAccess | null>(state.status === 'ready' ? state.access : null);
  const shownKey = useRef<string | null>(state.status === 'ready' ? memory?.key ?? null : null);
  const mounted = useRef(true);
  const following = useRef(0);
  const external = provided !== undefined;
  const known = useSyncExternalStore(subscribeIdentity, () => identity, () => null);

  const show = useCallback((entry: CacheEntry) => {
    readyRef.current = entry.access;
    shownKey.current = entry.key;
    setState({ access: entry.access, status: 'ready' });
  }, []);

  /** Start (or join) a revalidation when the policy allows it. Urgent reasons always ask the server afresh. */
  const run = useCallback((reason: RevalidateReason) => {
    if (external) return;
    const urgent = reason === 'retry' || reason === 'changed' || reason === 'restore';
    // A check already on the wire answers this provider too: joining it costs nothing and is never throttled.
    const joining = !urgent && shared !== null;
    if (!joining && !shouldRevalidate(reason, lastAttempt, Date.now(), Boolean(readyRef.current))) return;
    if (!joining) lastAttempt = Date.now();
    if (!readyRef.current) setState({ access: null, status: 'loading' });
    const check = requestAccess(urgent);
    following.current = check.id;
    check.promise.then((result) => {
      if (!mounted.current || following.current !== check.id) return;
      if (result.signedOut) {
        readyRef.current = null;
        shownKey.current = null;
        setState({ access: null, status: 'error' });
        return;
      }
      // The newest check stored the map; show what the cache now holds (a superseded answer is never shown).
      const entry = memory && memory.access === result.access ? memory : { key: accessCacheKey(result.scope), access: result.access, at: Date.now() };
      show(entry);
    }, () => {
      if (!mounted.current || following.current !== check.id) return;
      // With a confirmed map on screen a failed revalidation keeps it.
      if (readyRef.current) setState({ access: readyRef.current, status: 'ready' });
      else setState({ access: null, status: 'error' });
    });
  }, [external, show]);
  const retry = useCallback(() => run('retry'), [run]);

  // First mount: revalidate (in the background when a cached map is already on screen and the throttle allows).
  useEffect(() => {
    mounted.current = true;
    run('mount');
    // An unmount (a navigation, or React's dev double mount) leaves a check on the wire running: its answer still
    // fills the cache, and a provider that mounts meanwhile joins it instead of sending another request.
    return () => { mounted.current = false; };
  }, [run]);

  // After a reload the stored map is shown once the session read names the same identity; a different identity
  // (another user, a bumped access version) drops what was shown and asks again at once.
  useEffect(() => {
    if (external || !known) return;
    if (shownKey.current && shownKey.current !== known) {
      readyRef.current = null;
      shownKey.current = null;
      setState({ access: null, status: 'loading' });
      run('changed');
      return;
    }
    if (!readyRef.current) {
      const cached = trustedCache();
      if (cached) show(cached);
    }
  }, [external, known, run, show]);

  // A route change asks for a revalidation; the throttle decides whether it runs. `?view=` never does.
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) { firstPath.current = false; return; }
    run('route');
  }, [pathname, run]);

  useEffect(() => {
    if (external) return;
    const onFocus = () => run('focus');
    // A page restored from the back/forward cache may be hours old: always recheck it.
    const onShow = (event: PageTransitionEvent) => run(event.persisted ? 'restore' : 'focus');
    // A screen that changed someone's access (permissions, delegation) asks the shell to recheck at once.
    const onChanged = () => run('changed');
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onShow);
    window.addEventListener('skoolee:access-changed', onChanged);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('skoolee:access-changed', onChanged);
    };
  }, [external, run]);

  const current: Omit<AccessState, 'retry'> = external
    ? { access: provided ?? null, status: provided ? 'ready' : 'loading' }
    : state;
  return <Context.Provider value={{ ...current, retry }}>{children}</Context.Provider>;
}

export function useNavigationAccess() {
  const state = useContext(Context);
  const allows = useCallback((module?: string | null) => !module || state?.access?.[module] === true, [state?.access]);
  const allowsHref = useCallback((href?: string) => allows(moduleForHref(href)), [allows]);
  /** A capability or module key is true. Unknown keys are false (fail closed). */
  const has = useCallback((key: string) => state?.access?.[key] === true, [state?.access]);
  return {
    ...state,
    allows, allowsHref, has,
  };
}

export function NavigationAccessNotice({ denied = false, fallback, reason, owner, title, ownerPhrase, icon }: { denied?: boolean; fallback?: ReactNode; reason?: string; owner?: string | null } & Pick<AccessNoticeProps, "title" | "ownerPhrase" | "icon">) {
  const state = useContext(Context);
  const t = useUiText();
  // A caller that supplies access (such as a token-based parent portal) owns
  // its loading request and must keep that request's recovery action visible.
  if (denied && fallback) return <>{fallback}</>;
  if (state?.status === 'error') return <ErrorState description={t("Workspace access could not be checked. Your work has not been changed.")} onRetry={state.retry} retryLabel={t("Retry access check")} />;
  if (denied && state?.status === 'loading') return <WorkspaceAccessSkeleton />;
  if (denied) return <AccessNotice reason={reason ?? "This workspace is not available with your current access. Choose an available section."} owner={owner} title={title} ownerPhrase={ownerPhrase} icon={icon} />;
  return null;
}

/**
 * Fill the page card while permissions are checked for the first time, keeping protected content closed: the same
 * PageHeader + body shape every page skeleton uses (the shell already draws the card around it).
 */
function WorkspaceAccessSkeleton() {
  const t = useUiText();
  return <SkeletonRegion label={t("Checking workspace access")} className="min-h-0 flex-1 overflow-hidden">
    <PageSkeleton />
  </SkeletonRegion>;
}
