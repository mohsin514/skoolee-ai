"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const eventName = "skoolee:exam-session-changed";
const channelName = "skoolee-exam-session";
const examPath = (value: unknown): value is string => typeof value === "string" && /^\/ai\/exams\/[a-zA-Z0-9_-]+$/.test(value);

// This is a cache/navigation hint. The proxy and domain services authorize every request.
export function notifyCandidateExamSession(examUrl: string | null) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: { examUrl } }));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage("changed"); channel.close();
  }
}

export function CandidateExamGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [activeExamUrl, setActiveExamUrl] = useState<string | null>(null);
  const [candidate, setCandidate] = useState(false);
  const [checkedPath, setCheckedPath] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [locale, setLocale] = useState("en");
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const check = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const path = window.location.pathname;
    setChecking(true); setLocale(document.documentElement.lang);
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      if (!response.ok && response.status !== 401) return;
      const data = await response.json();
      if (!mounted.current || controller.signal.aborted) return;
      const next = examPath(data.activeExamUrl) ? data.activeExamUrl : null;
      setCandidate(data.user?.role === "STUDENT"); setActiveExamUrl(next); setCheckedPath(path);
      // Preserve the camera stream and answers when already in the correct exam room.
      if (next && window.location.pathname !== next) window.location.replace(next);
    } catch { /* Keep a known active boundary until a fresh authenticated response succeeds. */ }
    finally { if (mounted.current && request.current === controller) { request.current = null; setChecking(false); } }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { void check(); };
    const visible = () => { if (!document.hidden) refresh(); };
    const changed = (event: Event) => {
      const next = (event as CustomEvent<{ examUrl?: unknown }>).detail?.examUrl;
      if (examPath(next)) { setCandidate(true); setActiveExamUrl(next); }
      refresh();
    };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName);
    if (channel) channel.onmessage = refresh;
    window.addEventListener(eventName, changed);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("popstate", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false; request.current?.abort(); channel?.close();
      window.removeEventListener(eventName, changed); window.removeEventListener("pageshow", refresh);
      window.removeEventListener("popstate", refresh); window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [check]);
  useEffect(() => { void check(); }, [pathname, check]);
  const blocked = !!activeExamUrl && pathname !== activeExamUrl || candidate && checkedPath !== pathname && !examPath(pathname);
  const copy = locale === "ar" ? { title: "التحقق من جلسة الاختبار", hint: "تعود المهام الأخرى بعد تأكيد إرسال الاختبار أو انتهاء وقته.", retry: "إعادة التحقق" } : locale === "ur" ? { title: "امتحانی سیشن کی جانچ", hint: "امتحان جمع ہونے کی تصدیق یا وقت ختم ہونے کے بعد دوسرے کام دستیاب ہوں گے۔", retry: "دوبارہ جانچیں" } : { title: "Checking your exam session", hint: "Other tasks resume after the server confirms submission or the exam deadline passes.", retry: "Check again" };
  return <><div className={blocked ? "hidden" : "contents"} inert={blocked || undefined} aria-hidden={blocked || undefined}>{children}</div>{blocked && <section role="status" className="sk-panel m-auto max-w-md space-y-4 p-6" dir={locale === "en" ? "ltr" : "rtl"}><h1 className="text-xl font-bold">{copy.title}</h1><p className="text-sm text-ink-subtle">{copy.hint}</p><Button type="button" variant="outline" disabled={checking} onClick={() => void check()}>{copy.retry}</Button></section>}</>;
}
