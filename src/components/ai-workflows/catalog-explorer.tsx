"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Search, Sparkles, Users } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { FlagshipChip } from "@/components/ui/flagship";
import { InkHeading } from "@/components/ui/ink-heading";
import { Input } from "@/components/ui/input";
import { KbdHint, Kbd } from "@/components/ui/kbd";
import { LiveAnnouncer } from "@/components/ui/live-announcer";
import { InfoTip } from "@/components/ui/tooltip";
import { ViewTabs } from "@/components/ui/view-tabs";
import { cn } from "@/lib/utils";
import { CLASS_WORDS, UI, t, type Lang, type T } from "./run-copy";
import { CatalogCard, type CatalogItem } from "./catalog-card";
import { CatalogCoverage } from "./catalog-coverage";
import { DemoSchoolBadge } from "./demo-school-badge";
import { InboxCountChip } from "./inbox-count-chip";
import { Num, useWorkflowFormat } from "./workflow-format";
import type { StepClass } from "./workflow-marks";

const WORDS = {
  back: { en: "Back to Ask", ar: "العودة إلى اطلب", ur: "پوچھیں پر واپس" },
  eyebrow: { en: "AI Workflows", ar: "مسارات الذكاء الاصطناعي", ur: "اے آئی ورک فلوز" },
  lead: { en: "Everything AI can do for you today, and how each one finishes.", ar: "كل ما يمكن للذكاء الاصطناعي فعله لك اليوم، وكيف ينتهي كل منها.", ur: "آج اے آئی آپ کے لیے جو کچھ کر سکتا ہے، اور ہر کام کیسے مکمل ہوتا ہے۔" },
  off: { en: "AI Workflows are not switched on for your school yet. This is what they will do once they are.", ar: "لم تُفعَّل مسارات الذكاء الاصطناعي لمدرستك بعد. هذا ما ستفعله عند تفعيلها.", ur: "آپ کے اسکول کے لیے اے آئی ورک فلوز ابھی فعال نہیں۔ فعال ہونے پر یہ یہی کریں گے۔" },
  practice: { en: "Practice mode · nothing is saved to your school", ar: "وضع التدريب · لا يُحفظ شيء في مدرستك", ur: "مشق کا موڈ · آپ کے اسکول میں کچھ محفوظ نہیں ہوتا" },
  practiceLabel: { en: "About practice mode", ar: "عن وضع التدريب", ur: "مشق کے موڈ کے بارے میں" },
  search: { en: "Search what AI can do", ar: "ابحث فيما يمكن للذكاء الاصطناعي فعله", ur: "تلاش کریں کہ اے آئی کیا کر سکتا ہے" },
  searchPlaceholder: { en: "Search, e.g. fees, attendance…", ar: "ابحث، مثل الرسوم أو الحضور…", ur: "تلاش کریں، مثلاً فیس، حاضری…" },
  filter: { en: "How it finishes", ar: "كيف ينتهي", ur: "یہ کیسے مکمل ہوتا ہے" },
  all: { en: "All", ar: "الكل", ur: "سب" },
  fA: { en: "Runs on its own", ar: "يعمل تلقائيًا", ur: "خود چلتا ہے" },
  fB: { en: "You confirm first", ar: "تؤكّد أولًا", ur: "پہلے آپ تصدیق کریں" },
  fC: { en: "Goes to the approver", ar: "يُحال إلى المعتمِد", ur: "منظور کنندہ کو جاتا ہے" },
  fX: { en: "Not for you right now", ar: "ليس لك الآن", ur: "ابھی آپ کے لیے نہیں" },
  unavailableHelp: { en: "These stay with the people who handle them. You can still see them here.", ar: "تبقى هذه مع من يتولّونها، ويمكنك رؤيتها هنا.", ur: "یہ ان لوگوں کے پاس رہتے ہیں جو انہیں سنبھالتے ہیں۔ آپ انہیں یہاں دیکھ سکتے ہیں۔" },
  groupBy: { en: "{0} handles {1} of these", ar: "يتولّى {0} {1} منها", ur: "{0} ان میں سے {1} سنبھالتا ہے" },
  groupNone: { en: "Not open to anyone in your role right now", ar: "غير متاح لأحد في دورك الآن", ur: "ابھی آپ کے کردار میں کسی کے لیے دستیاب نہیں" },
  noMatch: { en: "Nothing matches “{0}”", ar: "لا شيء يطابق «{0}»", ur: "«{0}» سے کچھ نہیں ملا" },
  noMatchFilter: { en: "Nothing here yet", ar: "لا شيء هنا بعد", ur: "یہاں ابھی کچھ نہیں" },
  noMatchHint: { en: "Try fewer words, or another way of saying it.", ar: "جرّب كلمات أقل أو صياغة أخرى.", ur: "کم الفاظ یا کوئی اور انداز آزمائیں۔" },
  clear: { en: "Clear search", ar: "امسح البحث", ur: "تلاش صاف کریں" },
  showing: { en: "Showing {0} of {1}", ar: "يُعرض {0} من {1}", ur: "{1} میں سے {0} دکھائے جا رہے ہیں" },
  emptyTitle: { en: "AI is not connected to anything for your role yet", ar: "الذكاء الاصطناعي غير متصل بأي شيء لدورك بعد", ur: "اے آئی ابھی آپ کے کردار کے کسی کام سے منسلک نہیں" },
  emptyBody: { en: "You can still do everything on its usual screen.", ar: "لا يزال بإمكانك فعل كل شيء على شاشته المعتادة.", ur: "آپ اب بھی سب کچھ اس کی معمول کی اسکرین پر کر سکتے ہیں۔" },
} satisfies Record<string, T>;

type FilterId = "all" | StepClass;
const SECTIONS: StepClass[] = ["A", "B", "C"];
const FILTER_KEY: Record<StepClass, keyof typeof WORDS> = { A: "fA", B: "fB", C: "fC", X: "fX" };

/** Folds case, diacritics and the Arabic/Urdu letter variants so "ی" finds "ي" and "ہ" finds "ه". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[یى]/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/[ہۃةھ]/g, "ه")
    .replace(/[أإآٱ]/g, "ا");
}

export interface CatalogExplorerProps {
  items: CatalogItem[];
  connected: number;
  total: number;
  language: Lang;
  enabled: boolean;
  practice: boolean;
  demo: boolean;
}

/** The searchable, filterable "What AI can do" catalogue. Search and filter live in state only, never the URL. */
export function CatalogExplorer({ items, connected, total, language, enabled, practice, demo }: CatalogExplorerProps) {
  const format = useWorkflowFormat();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [unavailableOpen, setUnavailableOpen] = React.useState(false);
  const [announce, setAnnounce] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const folded = React.useMemo(() => items.map(item => ({ item, haystack: fold(`${item.title} ${item.whenToUse}`) })), [items]);
  const needle = fold(query.trim());
  const matches = React.useMemo(
    () => (needle ? folded.filter(entry => needle.split(/\s+/).every(word => entry.haystack.includes(word))).map(entry => entry.item) : items),
    [folded, items, needle],
  );
  const counts = React.useMemo(() => {
    const result: Record<StepClass, number> = { A: 0, B: 0, C: 0, X: 0 };
    for (const item of matches) result[item.cls]++;
    return result;
  }, [matches]);
  const visible = filter === "all" ? matches : matches.filter(item => item.cls === filter);

  // "/" focuses search from anywhere outside a field.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Debounced result count for screen readers.
  React.useEffect(() => {
    if (!needle && filter === "all") { setAnnounce(null); return; }
    const timer = window.setTimeout(() => {
      setAnnounce(WORDS.showing[language].replace("{0}", format.count(visible.length)).replace("{1}", format.count(items.length)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [needle, filter, visible.length, items.length, language, format]);

  const pick = (id: FilterId) => {
    setFilter(id);
    if (id === "X") setUnavailableOpen(true);
  };
  const clear = () => { setQuery(""); searchRef.current?.focus(); };

  const tabs = [
    { id: "all", label: WORDS.all[language], count: matches.length },
    ...(["A", "B", "C", "X"] as StepClass[]).map(cls => ({ id: cls, label: WORDS[FILTER_KEY[cls]][language], count: counts[cls], hidden: items.every(item => item.cls !== cls) })),
  ];
  const legend = SECTIONS.filter(cls => items.some(item => item.cls === cls)).map(cls => ({ id: cls, label: WORDS[FILTER_KEY[cls]][language], count: items.filter(item => item.cls === cls).length }));

  const unavailable = visible.filter(item => item.cls === "X");
  const groups = React.useMemo(() => {
    const map = new Map<string, { roles: string[]; items: CatalogItem[] }>();
    for (const item of unavailable) {
      const roles = [...new Set(item.handledBy)].sort();
      const key = roles.join("|");
      const group = map.get(key) ?? { roles, items: [] };
      group.items.push(item);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [unavailable]);

  const resultsKey = `${filter}:${needle}`;
  // First paint staggers the grid in; later result changes cross-fade instead.
  const initial = resultsKey === "all:";
  const nothingConnected = connected === 0 && items.every(item => item.cls !== "X");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-1 py-2 sm:p-6" dir={language === "en" ? "ltr" : "rtl"} data-ai-catalog>
      <header className="space-y-3">
        <Link href="/ai" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ms-2")}>
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          <span>{WORDS.back[language]}</span>
        </Link>
        <p className="flex items-center gap-2 text-xs font-semibold text-brand-700">
          <FlagshipChip />
          <span>{WORDS.eyebrow[language]}</span>
        </p>
        <InkHeading as="h1" text={t(UI, "canDoTitle", language)} className="text-2xl sm:text-3xl" />
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{WORDS.lead[language]}</p>
        <div className="flex flex-wrap items-center gap-2">
          {practice ? (
            <span className="inline-flex items-center gap-1">
              <Badge variant="neutral" data-ai-catalog-practice>{WORDS.practice[language]}</Badge>
              <InfoTip content={t(UI, "practiceTip", language)} label={WORDS.practiceLabel[language]} />
            </span>
          ) : null}
          <InboxCountChip className="ms-auto" />
        </div>
        {demo ? <DemoSchoolBadge variant="band" /> : null}
        {!enabled ? <Alert tone="info" live="off">{WORDS.off[language]}</Alert> : null}
      </header>

      {nothingConnected ? (
        <EmptyState icon={Sparkles} title={WORDS.emptyTitle[language]} description={WORDS.emptyBody[language]} />
      ) : (
        <>
          <CatalogCoverage connected={connected} total={total} legend={legend} active={filter} onPick={pick} language={language} />

          <div className="max-sm:sticky max-sm:top-2 max-sm:z-10 max-sm:rounded-2xl max-sm:bg-card/90 max-sm:p-2 max-sm:ring-1 max-sm:ring-border-subtle max-sm:backdrop-blur space-y-3">
            <div className="relative">
              <label htmlFor="ai-catalog-search" className="sr-only">{WORDS.search[language]}</label>
              <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
              <Input
                ref={searchRef}
                id="ai-catalog-search"
                type="search"
                dir="auto"
                autoComplete="off"
                value={query}
                placeholder={WORDS.searchPlaceholder[language]}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }}
                data-ai-catalog-search
                className="min-h-11 ps-9 pe-10"
              />
              <KbdHint className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2"><Kbd>/</Kbd></KbdHint>
            </div>
            <div data-ai-catalog-filter={filter}>
              <ViewTabs items={tabs} value={filter} onChange={id => pick(id as FilterId)} ariaLabel={WORDS.filter[language]} />
            </div>
          </div>
          <LiveAnnouncer message={announce} />

          <div key={resultsKey} className={cn("space-y-8", !initial && "sk-fade-in")}>
            {visible.length === 0 ? (
              <EmptyState
                size="sm"
                icon={Search}
                title={needle ? WORDS.noMatch[language].replace("{0}", query.trim()) : WORDS.noMatchFilter[language]}
                description={needle ? WORDS.noMatchHint[language] : undefined}
                secondaryAction={needle ? <Button type="button" variant="outline" size="sm" onClick={clear}>{WORDS.clear[language]}</Button> : undefined}
              />
            ) : null}

            {SECTIONS.map(cls => {
              const list = visible.filter(item => item.cls === cls);
              if (list.length === 0) return null;
              return (
                <section key={cls} aria-labelledby={`ai-catalog-${cls}`} className="space-y-3">
                  <div className="space-y-1">
                    <h2 id={`ai-catalog-${cls}`} className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink-strong">
                      <span>{WORDS[FILTER_KEY[cls]][language]}</span>
                      <Badge size="sm" variant="secondary"><Num value={list.length} /></Badge>
                    </h2>
                    <p className="text-sm text-ink-muted">{CLASS_WORDS[cls].help[language]}</p>
                  </div>
                  <ul className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", initial && "sk-stagger")}>
                    {list.map(item => <CatalogCard key={item.key} item={item} language={language} canTry={enabled} />)}
                  </ul>
                </section>
              );
            })}

            {unavailable.length > 0 ? (
              <CollapsiblePanel
                icon={Users}
                title={WORDS.fX[language]}
                subtitle={WORDS.unavailableHelp[language]}
                headerRight={<Badge size="sm" variant="neutral"><Num value={unavailable.length} /></Badge>}
                open={unavailableOpen}
                onOpenChange={setUnavailableOpen}
              >
                <div className="space-y-6">
                  {groups.map(group => (
                    <section key={group.roles.join("|") || "none"} className="space-y-3">
                      <h3 className="text-sm font-semibold text-ink-strong">
                        {group.roles.length > 0
                          ? <bdi>{WORDS.groupBy[language].replace("{0}", format.roles(group.roles, "conjunction")).replace("{1}", format.count(group.items.length))}</bdi>
                          : WORDS.groupNone[language]}
                      </h3>
                      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {group.items.map(item => <CatalogCard key={item.key} item={item} language={language} canTry={false} />)}
                      </ul>
                    </section>
                  ))}
                </div>
              </CollapsiblePanel>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
