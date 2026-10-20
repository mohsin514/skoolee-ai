"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isLaunchEntry, isLaunchTask, START_CAMPUS_SETUP_EVENT } from "@/lib/onboarding/launch-plan";
import { LaunchGuide, type LaunchContext } from "./LaunchGuide";
import { launchCopy } from "./launch-copy";
import styles from "./launch-guide.module.css";

/** Server-backed first use, shared across all role entry screens. No browser flag can complete setup. */
export function FirstRunGuide() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams().toString();
  const [context, setContext] = useState<LaunchContext | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const enabled = isLaunchEntry(pathname);

  useEffect(() => {
    const sequence = ++generation.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    setOpen(false); setContext(null); setLoadFailed(false); setLoading(false);
    if (!enabled) return () => controller.abort();
    // Deep links lead straight to their task. Replay remains available afterwards.
    const directTask = isLaunchTask(search, window.location.hash);
    setLoading(true);
    void fetch("/api/auth/welcome", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) }).then(async response => {
      if (response.status === 401 || response.status === 403) return;
      if (!response.ok) throw new Error("unavailable");
      const result = await response.json() as { context: LaunchContext | null };
      if (sequence !== generation.current || controller.signal.aborted) return;
      setContext(result.context);
      setOpen(Boolean(result.context && !result.context.completed && !directTask));
    }).catch(() => {
      if (sequence === generation.current && !controller.signal.aborted) setLoadFailed(true);
    }).finally(() => {
      if (sequence === generation.current && !controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [pathname, enabled, search]);

  const replay = async () => {
    if (loading) return;
    const sequence = generation.current;
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    setLoading(true); setLoadFailed(false);
    try {
      const response = await fetch("/api/auth/welcome", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
      if (!response.ok) throw new Error("unavailable");
      const result = await response.json() as { context: LaunchContext | null };
      if (generation.current !== sequence || controller.signal.aborted) return;
      setContext(result.context); setOpen(Boolean(result.context));
    } catch { if (generation.current === sequence && !controller.signal.aborted) setLoadFailed(true); }
    finally { if (generation.current === sequence) setLoading(false); }
  };

  if (!enabled) return null;
  const c = launchCopy(context?.language ?? "en");
  if (!context) return loading || loadFailed ? <div className={styles.replay}>
    {loadFailed && <p role="alert" className="max-w-64 rounded-xl border border-border bg-white p-3 text-xs text-ink">{c.loadFailed}</p>}
    <Button variant="outline" size="sm" loading={loading} onClick={() => void replay()}><Compass aria-hidden="true" />{loading ? c.loadingGuide : c.openGuide}</Button>
  </div> : null;
  const finish = async (href?: string) => {
    const sequence = generation.current;
    if (!context.completed) {
      const response = await fetch("/api/auth/welcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error("not-saved");
    }
    if (generation.current !== sequence) return;
    setContext({ ...context, completed: true }); setOpen(false);
    if (href && context.actions.some(action => action.href === href)) {
      if (href === "/ai?setup=1" && href === window.location.pathname + window.location.search) window.dispatchEvent(new Event(START_CAMPUS_SETUP_EVENT));
      else if (href !== window.location.pathname + window.location.search) router.push(href);
    }
  };
  return <>
    {!open && <div className={styles.replay}>
      {loadFailed && <p role="alert" className="max-w-64 rounded-xl border border-border bg-white p-3 text-xs text-ink">{c.loadFailed}</p>}
      <Button variant="outline" size="sm" loading={loading} onClick={() => void replay()}><Compass aria-hidden="true" />{c.replay}</Button>
    </div>}
    {open && <LaunchGuide key={context.userId} context={context} onFinish={finish} onDismiss={() => setOpen(false)} />}
  </>;
}
