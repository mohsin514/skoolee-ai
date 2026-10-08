"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { moduleForHref, type NavigationAccess } from "@/lib/navigation/modules";
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
  if (denied && state?.status === 'loading') return <p role="status" className="p-4 text-sm text-ink-muted">Checking workspace access…</p>;
  if (denied) return <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">This workspace is not available with your current access. Choose an available section.</p>;
  return null;
}
