"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Inbox, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FlagshipChip } from "@/components/ui/flagship";
import { IconButton } from "@/components/ui/icon-button";
import { InkHeading } from "@/components/ui/ink-heading";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/locale/LocaleProvider";
import type { UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { UI, errorWords, t, type T } from "./run-copy";
import { InboxCard, claimErrorWords, type Handoff } from "./inbox-card";
import { InboxSkeleton } from "./inbox-skeleton";
import { ClassGlyph } from "./workflow-marks";
import { Num, TimeAgo } from "./workflow-format";

const WORDS = {
  eyebrow: { en: "AI Workflows", ar: "مسارات الذكاء الاصطناعي", ur: "اے آئی ورک فلوز" },
  lead: {
    en: "When a colleague asks AI for something you decide, it is prepared and waits here. Nothing is applied until you decide on its own screen.",
    ar: "عندما يطلب زميل من الذكاء الاصطناعي أمرًا تقرره أنت، يُجهَّز وينتظر هنا. لا يُطبَّق شيء حتى تقرر على شاشته.",
    ur: "جب کوئی ساتھی اے آئی سے ایسی چیز مانگے جس کا فیصلہ آپ کرتے ہیں، تو وہ تیار ہو کر یہاں انتظار کرتی ہے۔ آپ کے اس کی اپنی اسکرین پر فیصلے تک کچھ لاگو نہیں ہوتا۔",
  },
  refresh: { en: "Check for new items", ar: "تحقق من عناصر جديدة", ur: "نئی چیزیں دیکھیں" },
  updated: { en: "Updated", ar: "حُدّث", ur: "تازہ کیا گیا" },
  loading: { en: "Loading what is waiting for you", ar: "جارٍ تحميل ما ينتظرك", ur: "آپ کے منتظر کام لوڈ ہو رہے ہیں" },
  emptyBody: { en: "When something needs your decision, it appears here.", ar: "عندما يحتاج أمر إلى قرارك، يظهر هنا.", ur: "جب کسی چیز کو آپ کے فیصلے کی ضرورت ہو گی تو وہ یہاں نظر آئے گی۔" },
  items: { en: "Waiting for you", ar: "بانتظارك", ur: "آپ کے منتظر" },
  today: { en: "Today", ar: "اليوم", ur: "آج" },
  yesterday: { en: "Yesterday", ar: "أمس", ur: "کل" },
  earlier: { en: "Earlier", ar: "سابقًا", ur: "پہلے" },
  count: { en: "{0} waiting", ar: "{0} بالانتظار", ur: "{0} زیر التوا" },
} satisfies Record<string, T>;

type Phase = "loading" | "ready" | "error";
type State = { phase: Phase; items: Handoff[]; code: string | null; offline: boolean; loadedAt: string | null };

/** Calendar day of an instant in the school's timezone, as YYYY-MM-DD. */
function dayKey(value: string | number | Date, timeZone: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
  catch { return new Date(value).toISOString().slice(0, 10); }
}

/** Work the AI prepared for this person. The only action is to claim it and decide on its own screen. */
export function HandoffInbox({ role }: { role?: UserRole }) {
  const locale = useLocale();
  const language = locale.language;
  const router = useRouter();
  const [state, setState] = React.useState<State>({ phase: "loading", items: [], code: null, offline: false, loadedAt: null });
  const [claimingId, setClaimingId] = React.useState<string | null>(null);
  const [cardErrors, setCardErrors] = React.useState<Record<string, string>>({});
  const inFlight = React.useRef(false);
  const controllerRef = React.useRef<AbortController | null>(null);

  const load = React.useCallback(async (quiet = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!quiet) setState(previous => ({ ...previous, phase: previous.phase === "ready" ? "ready" : "loading" }));
    try {
      const response = await fetch("/api/ai-workflows/handoffs", { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null) as { handoffs?: Handoff[]; code?: string } | null;
      if (controller.signal.aborted) return;
      if (!response.ok || !Array.isArray(body?.handoffs)) {
        setState(previous => ({ ...previous, phase: "error", code: body?.code ?? "INTERNAL", offline: false }));
        return;
      }
      const handoffs = body.handoffs;
      setState({ phase: "ready", items: handoffs, code: null, offline: false, loadedAt: new Date().toISOString() });
      setCardErrors(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => handoffs.some(item => item.id === id))));
    } catch {
      if (controller.signal.aborted) return;
      setState(previous => ({ ...previous, phase: "error", code: "INTERNAL", offline: typeof navigator !== "undefined" && navigator.onLine === false }));
    }
  }, []);

  React.useEffect(() => {
    void load();
    const onVisible = () => { if (document.visibilityState === "visible" && !inFlight.current) void load(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); controllerRef.current?.abort(); };
  }, [load]);

  const open = async (item: Handoff) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setClaimingId(item.id);
    setCardErrors(previous => { const next = { ...previous }; delete next[item.id]; return next; });
    let code = "INTERNAL";
    try {
      const response = await fetch(`/api/ai-workflows/handoffs/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.handoff?.targetRoute) {
        // Stays loading through navigation.
        router.push(body.handoff.targetRoute);
        return;
      }
      code = body?.code ?? "INTERNAL";
    } catch { code = "INTERNAL"; }
    inFlight.current = false;
    setClaimingId(null);
    setCardErrors(previous => ({ ...previous, [item.id]: code }));
    toast.error(claimErrorWords(code, language) ?? errorWords(code, language));
    void load(true);
  };

  const groups = React.useMemo(() => {
    const zone = locale.timezone;
    // "Now" is when the list was read, so grouping stays pure and matches what was fetched.
    const now = state.loadedAt ? Date.parse(state.loadedAt) : 0;
    const today = dayKey(now, zone);
    const yesterday = dayKey(now - 86_400_000, zone);
    const buckets: Record<"today" | "yesterday" | "earlier", Handoff[]> = { today: [], yesterday: [], earlier: [] };
    for (const item of state.items) {
      const key = dayKey(item.createdAt, zone);
      buckets[key === today ? "today" : key === yesterday ? "yesterday" : "earlier"].push(item);
    }
    return (["today", "yesterday", "earlier"] as const).filter(id => buckets[id].length > 0).map(id => ({ id, items: buckets[id] }));
  }, [state.items, state.loadedAt, locale.timezone]);

  const ready = state.phase === "ready";
  return (
    <section className="space-y-5" dir={language === "en" ? "ltr" : "rtl"} data-ai-handoff-inbox data-ai-inbox-state={state.phase}>
      <header className="space-y-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-brand-700">
          <FlagshipChip />
          <span>{WORDS.eyebrow[language]}</span>
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <InkHeading as="h1" text={t(UI, "waitingTitle", language)} className="text-2xl sm:text-3xl" />
            {ready ? (
              <Badge variant="secondary" className="sk-enter-scale">
                <bdi>{WORDS.count[language].split("{0}")[0]}<Num value={state.items.length} />{WORDS.count[language].split("{0}")[1]}</bdi>
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {state.loadedAt ? (
              <span className="text-xs text-ink-muted">{WORDS.updated[language]} <TimeAgo key={state.loadedAt} iso={state.loadedAt} /></span>
            ) : null}
            <IconButton
              label={WORDS.refresh[language]}
              variant="outline"
              onClick={() => void load()}
              disabled={state.phase === "loading"}
            >
              <RefreshCw aria-hidden="true" className={cn(state.phase === "loading" && "motion-safe:animate-spin")} />
            </IconButton>
          </div>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{WORDS.lead[language]}</p>
      </header>

      {state.phase === "loading" ? <InboxSkeleton label={WORDS.loading[language]} /> : null}

      {state.phase === "error" ? (
        <div className="sk-panel" data-static>
          <ErrorState variant="panel" offline={state.offline} description={state.offline ? undefined : errorWords(state.code, language)} onRetry={() => load()} />
        </div>
      ) : null}

      {ready && state.items.length === 0 ? (
        <>
          <h2 className="sr-only">{WORDS.items[language]}</h2>
          <EmptyState
            icon={Inbox}
            title={t(UI, "waitingEmpty", language)}
            description={
              <span className="flex flex-col items-center gap-3">
                <span>{WORDS.emptyBody[language]}</span>
                <span aria-hidden="true" className="inline-flex items-center gap-1.5">
                  <ClassGlyph cls="A" className="size-7 rounded-xl" />
                  <ArrowRight className="size-3.5 text-ink-subtle rtl:rotate-180" />
                  <ClassGlyph cls="B" className="size-7 rounded-xl" />
                  <ArrowRight className="size-3.5 text-ink-subtle rtl:rotate-180" />
                  <ClassGlyph cls="C" className="size-7 rounded-xl" />
                </span>
              </span>
            }
            secondaryAction={<Link href="/ai/can-do" className={buttonVariants({ variant: "outline", size: "sm" })}>{t(UI, "seeWhatAiCanDo", language)}</Link>}
          />
        </>
      ) : null}

      {ready && groups.map(group => (
        <section key={group.id} aria-labelledby={`ai-inbox-${group.id}`} className="space-y-3">
          <h2 id={`ai-inbox-${group.id}`} className="sk-eyebrow text-ink-muted">{WORDS[group.id][language]}</h2>
          <ul className="space-y-3">
            {group.items.map(item => (
              <InboxCard
                key={item.id}
                item={item}
                role={role}
                language={language}
                claiming={claimingId === item.id}
                disabled={claimingId !== null}
                error={cardErrors[item.id] ?? null}
                onClaim={open}
              />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
