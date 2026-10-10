"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { moduleForHref, type NavigationAccess } from "@/lib/navigation/modules";
import { SkeletonBar, SkeletonRegion } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type AccessState = { access: NavigationAccess | null; status: 'loading' | 'ready' | 'error'; retry: () => void };
const Context = createContext<AccessState | null>(null);
export function NavigationAccessProvider({ children, access: provided }: { children: ReactNode; access?: NavigationAccess | null }) {
  const pathname = usePathname();
  const [state, setState] = useState<Omit<AccessState, 'retry'>>({ access: null, status: 'loading' });
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (provided !== undefined) return;
    const controller = new AbortController();
    setState({ access: null, status: 'loading' });
    fetch('/api/navigation/access', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Access unavailable');
        const body = await response.json();
        if (!body.access || typeof body.access !== 'object' || Object.values(body.access).some((value) => typeof value !== 'boolean')) throw new Error('Invalid access');
        if (!controller.signal.aborted) setState({ access: body.access, status: 'ready' });
      }).catch(() => { if (!controller.signal.aborted) setState({ access: null, status: 'error' }); });
    return () => controller.abort();
  }, [provided, pathname, version]);
  useEffect(() => {
    if (provided !== undefined) return;
    const refresh = () => retry();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [provided, retry]);
  return <Context.Provider value={{ ...(provided === undefined ? state : { access: provided, status: provided ? 'ready' : 'loading' }), retry }}>{children}</Context.Provider>;
}
export function useNavigationAccess() {
  const state = useContext(Context);
  return {
    ...state,
    allows: (module?: string | null) => !module || state?.access?.[module] === true,
    allowsHref: (href?: string) => { const permissionModule = moduleForHref(href); return !permissionModule || state?.access?.[permissionModule] === true; },
  };
}
export function NavigationAccessNotice({ denied = false, fallback }: { denied?: boolean; fallback?: ReactNode }) {
  const state = useContext(Context);
  // A caller that supplies access (such as a token-based parent portal) owns
  // its loading request and must keep that request's recovery action visible.
  if (denied && fallback) return <>{fallback}</>;
  if (state?.status === 'error') return <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm"><p>Workspace access could not be checked. Your work has not been changed.</p><Button variant="outline" onClick={state.retry} className="mt-3">Retry access check</Button></div>;
  if (denied && state?.status === 'loading') return <WorkspaceAccessSkeleton />;
  if (denied) return <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">This workspace is not available with your current access. Choose an available section.</p>;
  return null;
}

/** Fill the workspace while permissions are rechecked, keeping protected content closed. */
function WorkspaceAccessSkeleton() {
  return <SkeletonRegion label="Checking workspace access" className="sk-panel flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-4 sm:p-5">
    <div className="space-y-3"><SkeletonBar className="h-7 w-56 max-w-full" /><SkeletonBar className="h-3 w-80 max-w-full" /></div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="sk-panel space-y-3 p-4"><SkeletonBar className="h-3 w-20 max-w-full" /><SkeletonBar className="h-8 w-16" /><SkeletonBar className="h-3 w-full" /></div>)}</div>
    <div className="sk-panel flex min-h-48 flex-1 flex-col gap-5 p-4"><SkeletonBar className="h-5 w-40 max-w-full" />{Array.from({ length: 5 }, (_, i) => <SkeletonBar key={i} className="h-8 w-full" delay={i * 60} />)}</div>
  </SkeletonRegion>;
}
