"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { moduleForHref, type NavigationAccess } from "@/lib/navigation/modules";
import { SkeletonBar, SkeletonRegion } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { useUiText } from "@/components/locale/LocaleProvider";
import { subscribeWorkspaceNavigation } from "@/components/nav/useWorkspaceView";

type AccessState = { access: NavigationAccess | null; status: 'loading' | 'ready' | 'error'; retry: () => void };
const Context = createContext<AccessState | null>(null);
const locationSnapshot = () => window.location.pathname + window.location.search;
const serverLocationSnapshot = () => '';
export function NavigationAccessProvider({ children, access: provided }: { children: ReactNode; access?: NavigationAccess | null }) {
  const pathname = usePathname();
  // Local consoles change ?view without changing usePathname. Read the same
  // external store as their view hook so a new view cannot use old permission
  // results even for its first commit. Next pathname updates still subscribe
  // this provider to normal router navigation. No History API is replaced.
  const location = useSyncExternalStore(subscribeWorkspaceNavigation, locationSnapshot, serverLocationSnapshot);
  const routeKey = JSON.stringify([pathname, location]);
  const [state, setState] = useState<Omit<AccessState, 'retry'> & { routeKey: string | null; version: number }>({ access: null, status: 'loading', routeKey: null, version: -1 });
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (provided !== undefined) return;
    const controller = new AbortController();
    // A stalled request must expose recovery, while an obsolete response must
    // never reopen the destination that replaced it.
    const timeout = window.setTimeout(() => {
      controller.abort();
      setState({ access: null, status: 'error', routeKey, version });
    }, 10_000);
    setState({ access: null, status: 'loading', routeKey, version });
    fetch('/api/navigation/access', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Access unavailable');
        const body = await response.json();
        if (!body.access || typeof body.access !== 'object' || Array.isArray(body.access) || Object.values(body.access).some((value) => typeof value !== 'boolean')) throw new Error('Invalid access');
        if (!controller.signal.aborted) setState({ access: body.access, status: 'ready', routeKey, version });
      }).catch(() => { if (!controller.signal.aborted) setState({ access: null, status: 'error', routeKey, version }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [provided, routeKey, version]);
  useEffect(() => {
    if (provided !== undefined) return;
    const refresh = () => retry();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); };
  }, [provided, retry]);
  // Close on the first render of a new route/retry, before effects run. Keep
  // consumers mounted so a recoverable check cannot erase a local draft.
  const current: Omit<AccessState, 'retry'> = provided !== undefined
    ? { access: provided, status: provided ? 'ready' : 'loading' }
    : state.routeKey === routeKey && state.version === version ? state : { access: null, status: 'loading' };
  return <Context.Provider value={{ ...current, retry }}>{children}</Context.Provider>;
}
export function useNavigationAccess() {
  const state = useContext(Context);
  const allows = useCallback((module?: string | null) => !module || state?.access?.[module] === true, [state?.access]);
  const allowsHref = useCallback((href?: string) => allows(moduleForHref(href)), [allows]);
  return {
    ...state,
    allows, allowsHref,
  };
}
export function NavigationAccessNotice({ denied = false, fallback }: { denied?: boolean; fallback?: ReactNode }) {
  const state = useContext(Context);
  const t = useUiText();
  // A caller that supplies access (such as a token-based parent portal) owns
  // its loading request and must keep that request's recovery action visible.
  if (denied && fallback) return <>{fallback}</>;
  if (state?.status === 'error') return <ErrorState description={t("Workspace access could not be checked. Your work has not been changed.")} onRetry={state.retry} retryLabel={t("Retry access check")} />;
  if (denied && state?.status === 'loading') return <WorkspaceAccessSkeleton />;
  if (denied) return <Alert tone="neutral" live="polite">{t("This workspace is not available with your current access. Choose an available section.")}</Alert>;
  return null;
}

/** Fill the workspace while permissions are rechecked, keeping protected content closed. */
function WorkspaceAccessSkeleton() {
  const t = useUiText();
  return <SkeletonRegion label={t("Checking workspace access")} className="sk-panel flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-4 sm:p-5">
    <div className="space-y-3"><SkeletonBar className="h-7 w-56 max-w-full" /><SkeletonBar className="h-3 w-80 max-w-full" /></div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="sk-panel space-y-3 p-4"><SkeletonBar className="h-3 w-20 max-w-full" /><SkeletonBar className="h-8 w-16" /><SkeletonBar className="h-3 w-full" /></div>)}</div>
    <div className="sk-panel flex min-h-48 flex-1 flex-col gap-5 p-4"><SkeletonBar className="h-5 w-40 max-w-full" />{Array.from({ length: 5 }, (_, i) => <SkeletonBar key={i} className="h-8 w-full" delay={i * 60} />)}</div>
  </SkeletonRegion>;
}
