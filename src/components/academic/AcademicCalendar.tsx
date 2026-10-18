"use client";
import { Button } from "@/components/ui/button";
import { localeTag } from "@/lib/locale/package";

import { UiText, useUiText, useLocale } from "@/components/locale/LocaleProvider";

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  BookOpen,
  PartyPopper,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Input as SystemInput } from "@/components/ui/input";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type CalendarRole = "ADMIN" | "PRINCIPAL" | "TEACHER" | "STUDENT" | "PARENT";

interface UnifiedTerm {
  id: string;
  label: string;
  academicYear: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
}
interface UnifiedHoliday {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
}
interface UnifiedExam {
  id: string;
  title: string;
  examType: string;
  status: string;
  className: string;
  dates: string[];
}
interface UnifiedFeed {
  weekends: number[];
  weekendDates?: string[];
  weekStartsOn?: number;
  terms: UnifiedTerm[];
  holidays: UnifiedHoliday[];
  exams: UnifiedExam[];
}

const DEADLINE_STATUSES = new Set(["MARKS_ENTRY", "LOCKED", "PRINCIPAL_REVIEWED"]);

function isoOf(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function dowFromIso(iso: string) {
  return ((new Date(`${iso}T00:00:00Z`).getDay() + 6) % 7) + 1; // 1=Mon..7=Sun
}
function todayIso() {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}

interface DayEvents {
  iso: string;
  dayNum: number;
  isWeekend: boolean;
  exams: UnifiedExam[];
  deadlines: UnifiedExam[];
  holidays: UnifiedHoliday[];
  terms: { type: "start" | "end"; term: UnifiedTerm }[];
}

interface LayerState {
  exams: boolean;
  holidays: boolean;
  terms: boolean;
  deadlines: boolean;
}

const compactCalendarSnapshot = () => window.matchMedia('(max-width: 639px)').matches;
const calendarServerSnapshot = () => false;
function subscribeCalendarWidth(callback: () => void) {
  const media = window.matchMedia('(max-width: 639px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

export function AcademicCalendar({
  campusId,
  readOnly = false,
  role = "STUDENT",
  onScheduleExam,
}: {
  campusId?: string;
  readOnly?: boolean;
  role?: CalendarRole;
  onScheduleExam?: () => void;
}) {
  const tr = useUiText();
  const locale = useLocale();
  const canEdit = !readOnly && (role === "ADMIN" || role === "PRINCIPAL");

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [feed, setFeed] = useState<UnifiedFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<LayerState>({
    exams: true,
    holidays: true,
    terms: true,
    deadlines: true,
  });
  const [popover, setPopover] = useState<{
    iso: string;
    x: number;
    y: number;
    mode: "view" | "add";
  } | null>(null);
  // A month grid answers "what happens in October". It cannot answer "what is
  // next", which is the question anyone actually opens this screen with — that
  // used to mean clicking through months looking for a coloured square.
  const compactCalendar = useSyncExternalStore(subscribeCalendarWidth, compactCalendarSnapshot, calendarServerSnapshot);
  const [chosenView, setCalendarView] = useState<"month" | "agenda" | null>(null);
  // The existing agenda is readable at phone widths; keep the month available
  // as an explicit, horizontally scrollable view with full-size day targets.
  const calendarView = chosenView ?? (compactCalendar ? "agenda" : "month");

  const qs = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/academic/calendar/unified${qs ? `${qs}&` : "?" }year=${viewYear}`);
      const json = await res.json();
      if (json.success) setFeed(json.data);
      else toast.error(tr("Failed to load unified calendar"));
    } catch {
      toast.error(tr("Failed to load unified calendar"));
    } finally {
      setLoading(false);
    }
  }, [qs, viewYear]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Everything dated in the loaded year, flattened and sorted. Respects the
   * same layer toggles as the grid so hiding "Holidays" hides them in both.
   */
  const agenda = useMemo(() => {
    if (!feed) return [];
    type Item = {
      iso: string;
      kind: "exam" | "deadline" | "holiday" | "term";
      title: string;
      detail: string;
      color: string;
    };
    const items: Item[] = [];

    if (layers.exams) {
      feed.exams.forEach((e) =>
        e.dates.forEach((iso) =>
          items.push({
            iso,
            kind: "exam",
            title: e.title,
            detail: `${e.className} · ${e.examType.replaceAll("_", " ")}`,
            color: "#8127cf",
          }),
        ),
      );
    }
    if (layers.deadlines) {
      feed.exams
        .filter((e) => DEADLINE_STATUSES.has(e.status))
        .forEach((e) => {
          const last = e.dates[e.dates.length - 1];
          if (last) {
            items.push({
              iso: last,
              kind: "deadline",
              title: `${e.title} — marks due`,
              detail: e.className,
              color: "#f43f5e",
            });
          }
        });
    }
    if (layers.holidays) {
      feed.holidays.forEach((h) =>
        items.push({
          iso: h.fromDate.slice(0, 10),
          kind: "holiday",
          title: h.name,
          detail:
            h.toDate.slice(0, 10) === h.fromDate.slice(0, 10)
              ? "One day"
              : `Until ${h.toDate.slice(0, 10)}`,
          color: "#0d9488",
        }),
      );
    }
    if (layers.terms) {
      // A cycle saved without dates has nothing to place on the calendar.
      feed.terms.forEach((t) => {
        if (t.startDate) items.push({
          iso: t.startDate.slice(0, 10),
          kind: "term",
          title: `${t.label} begins`,
          detail: `Academic year ${t.academicYear}`,
          color: "#d97706",
        });
        if (t.endDate) items.push({
          iso: t.endDate.slice(0, 10),
          kind: "term",
          title: `${t.label} ends`,
          detail: `Academic year ${t.academicYear}`,
          color: "#d97706",
        });
      });
    }

    return items.sort((a, b) => a.iso.localeCompare(b.iso) || a.title.localeCompare(b.title));
  }, [feed, layers]);

  const upcoming = useMemo(() => {
    const today = todayIso();
    return agenda.filter((i) => i.iso >= today);
  }, [agenda]);

  // ── Aggregate events per day ─────────────────────────────────────────────
  const dayMap = useMemo(() => {
    const map = new Map<string, DayEvents>();
    if (!feed) return map;

    const ensure = (iso: string): DayEvents => {
      if (!map.has(iso)) {
        map.set(iso, {
          iso,
          dayNum: Number(iso.slice(8, 10)),
          isWeekend: (feed.weekendDates ? feed.weekendDates.includes(iso) : feed.weekends.includes(dowFromIso(iso))),
          exams: [],
          deadlines: [],
          holidays: [],
          terms: [],
        });
      }
      return map.get(iso)!;
    };

    feed.holidays.forEach((h) => {
      let cur = new Date(`${h.fromDate}T00:00:00Z`);
      const end = new Date(`${h.toDate}T00:00:00Z`);
      while (cur <= end) {
        const iso = cur.toISOString().slice(0, 10);
        ensure(iso).holidays.push(h);
        cur = new Date(cur.getTime() + 86400000);
      }
    });

    feed.exams.forEach((ex) => {
      ex.dates.forEach((d) => {
        const day = ensure(d);
        day.exams.push(ex);
        if (DEADLINE_STATUSES.has(ex.status)) day.deadlines.push(ex);
      });
    });

    feed.terms.forEach((t) => {
      const startIso = t.startDate?.slice(0, 10);
      const endIso = t.endDate?.slice(0, 10);
      if (startIso) ensure(startIso).terms.push({ type: "start", term: t });
      if (endIso && endIso !== startIso) ensure(endIso).terms.push({ type: "end", term: t });
    });

    return map;
  }, [feed]);

  // ── Month grid ───────────────────────────────────────────────────────────
  const monthCells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const leading = (first.getDay() - (feed?.weekStartsOn ?? 1) + 7) % 7;
    const cells: (DayEvents | null)[] = [];
    for (let i = 0; i < leading; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = isoOf(viewYear, viewMonth, d);
      cells.push(dayMap.get(iso) ?? {
        iso,
        dayNum: d,
        isWeekend: feed ? (feed.weekendDates ? feed.weekendDates.includes(iso) : feed.weekends.includes(dowFromIso(iso))) : false,
        exams: [],
        deadlines: [],
        holidays: [],
        terms: [],
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [dayMap, viewYear, viewMonth, feed]);

  const prevMonth = () => {
    setPopover(null);
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    setPopover(null);
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const hasEvents = (day: DayEvents) =>
    (layers.exams && day.exams.length > 0) ||
    (layers.holidays && day.holidays.length > 0) ||
    (layers.terms && day.terms.length > 0) ||
    (layers.deadlines && day.deadlines.length > 0);

  return (
    <div className="sk-panel border-edge/15 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-[12px] p-[12px] sm:p-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between bg-gradient-to-r from-surface-subtle via-white to-brand-100 border-b border-edge/10">
        <div className="flex min-w-0 items-center gap-[10px]">
          <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary">
            <CalendarDays className="h-[20px] w-[20px]" />
          </div>
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h3 className="text-lg font-bold tracking-tight text-ink-strong"><UiText>{"Academic Calendar"}</UiText></h3>
            <p className="text-2xs font-semibold text-ink-muted">
              {calendarView === "month" ? new Intl.DateTimeFormat(localeTag(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(viewYear, viewMonth, 1))) : `${viewYear}`}
              {upcoming.length > 0 ? tr(" · {0} still to come", [upcoming.length]) : tr(" · nothing else scheduled")}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
          <div className="sk-panel flex max-w-full flex-wrap items-center gap-[4px] p-[4px]">
            {(["month", "agenda"] as const).map((v) => (
              <Button variant="choice"
                key={v}
                type="button"
                onClick={() => setCalendarView(v)}
                aria-pressed={calendarView === v}
                className={cn(
                  "min-h-[44px] px-[10px] py-[6px]",
                  "",
                )}
              >
                {v === "month" ? tr("Month") : tr("What's next")}
              </Button>
            ))}
          </div>
          {calendarView === "month" ? (
            <>
              <Button variant="outline" size="icon" onClick={prevMonth} aria-label={tr("Previous month")} className="flex h-[44px] w-[44px] min-w-[44px] items-center justify-center [&>svg]:size-[18px]">
                <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
              </Button>
              <Button variant="outline"
                onClick={() => { setPopover(null); setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); }}
                className="min-h-[44px] px-[10px] py-[6px]"
              ><UiText>{"Today"}</UiText></Button>
              <Button variant="outline" size="icon" onClick={nextMonth} aria-label={tr("Next month")} className="flex h-[44px] w-[44px] min-w-[44px] items-center justify-center [&>svg]:size-[18px]">
                <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-[8px]">
              <Button variant="outline" size="icon" onClick={() => setViewYear((y) => y - 1)} aria-label={tr("Previous year")} className="flex h-[44px] w-[44px] min-w-[44px] items-center justify-center [&>svg]:size-[18px]">
                <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
              </Button>
              <span className="text-sm font-semibold tabular-nums text-ink-strong">{viewYear}</span>
              <Button variant="outline" size="icon" onClick={() => setViewYear((y) => y + 1)} aria-label={tr("Next year")} className="flex h-[44px] w-[44px] min-w-[44px] items-center justify-center [&>svg]:size-[18px]">
                <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Layer toggles */}
      <div className="flex flex-wrap items-center gap-[8px] px-[12px] py-[12px] sm:px-5 border-b border-edge/10">
        <LayerChip label={tr("Exams")} color="#8127cf" active={layers.exams} onClick={() => setLayers((l) => ({ ...l, exams: !l.exams }))} />
        <LayerChip label={tr("Holidays")} color="#0d9488" active={layers.holidays} onClick={() => setLayers((l) => ({ ...l, holidays: !l.holidays }))} />
        <LayerChip label={tr("Terms")} color="#d97706" active={layers.terms} onClick={() => setLayers((l) => ({ ...l, terms: !l.terms }))} />
        <LayerChip label={tr("Deadlines")} color="#f43f5e" active={layers.deadlines} onClick={() => setLayers((l) => ({ ...l, deadlines: !l.deadlines }))} />
      </div>

      {loading ? (
        <div className="space-y-3 p-5 animate-skeleton-in">
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-7 rounded-lg bg-border-subtle/40 skeleton-shimmer" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, r) => (
            <div key={r} className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 7 }).map((_, c) => (
                <div key={c} className="h-16 rounded-xl bg-border-subtle/30 skeleton-shimmer" style={{ animationDelay: `${(r * 7 + c) * 18}ms` }} />
              ))}
            </div>
          ))}
        </div>
      ) : calendarView === "agenda" ? (
        <AgendaList items={agenda} />
      ) : (
        <div role="region" tabIndex={0} aria-label={tr("Month calendar. Scroll horizontally to see all days.")} className="overflow-x-auto p-[12px] sm:p-5">
          <div className="grid min-w-[22rem] grid-cols-7 gap-[6px]">
            {Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(localeTag(locale), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2027, 0, 3 + ((feed?.weekStartsOn ?? 1) + i) % 7)))).map((d) => (
              <div key={d} className="pb-1 text-center text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                {d}
              </div>
            ))}
            {monthCells.map((cell, idx) => {
              if (!cell) return <div key={`e${idx}`} />;
              const isToday = cell.iso === todayIso();
              const holidayBg = layers.holidays && cell.holidays.length > 0;
              const weekendBg = cell.isWeekend && !(layers.holidays && cell.holidays.length > 0);
              return (
                <Button variant="choice"
                  aria-current={isToday ? "date" : undefined}
                  data-selected={isToday}
                  aria-label={tr("Events on {0}", [new Date(`${cell.iso}T00:00:00Z`).toLocaleDateString(localeTag(locale), { timeZone: "UTC", dateStyle: "full" })])}
                  key={cell.iso}
                  type="button"
                  onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setPopover({ iso: cell.iso, x: r.left, y: r.bottom + 6, mode: canEdit ? "add" : "view" });
                  }}
                  className={cn(
                    "group relative flex min-h-[64px] min-w-[44px] flex-col items-stretch justify-start p-[6px] text-start",
                    holidayBg && "bg-teal-50",
                    weekendBg && "bg-surface-subtle"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("text-xs font-bold", holidayBg ? "text-teal-700" : weekendBg ? "text-ink-subtle" : "text-ink-strong")}>
                      {cell.dayNum}
                    </span>
                    {canEdit && (
                      <span
                        aria-hidden="true"
                        className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white opacity-60"
                      >
                        <Plus className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1">
                    {layers.exams && cell.exams.length > 0 && <Dot color="#8127cf" title={tr("{0} exam(s)", [cell.exams.length])} />}
                    {layers.deadlines && cell.deadlines.length > 0 && <Dot color="#f43f5e" title={tr("Deadline")} />}
                    {layers.terms && cell.terms.length > 0 && (
                      <Dot color="#d97706" title={cell.terms.map((t) => `${t.term.label} ${t.type}`).join(", ")} />
                    )}
                    {layers.holidays && cell.holidays.length > 0 && <Dot color="#0d9488" title={cell.holidays.map((h) => h.name).join(", ")} />}
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {popover && (
          <DayPopover
            popover={popover}
            day={dayMap.get(popover.iso)}
            layers={layers}
            canEdit={canEdit}
            onClose={() => setPopover(null)}
            onScheduleExam={onScheduleExam}
            onHolidayAdded={() => { setPopover(null); load(); }}
            campusId={campusId}
          />
        )}
    </div>
  );
}

function LayerChip({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <Button variant="choice"
      type="button"
      onClick={onClick}
      // These are filters, not a legend. On/off is conveyed only by a colour
      // shift, so the state has to be exposed for assistive tech too.
      aria-pressed={active}
      className={"justify-start " + (cn(
        "flex min-h-[44px] items-center gap-[6px] px-[10px] py-[6px]",
        ""
      ))}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: active ? color : "var(--color-ink-faint)" }} />
      {label}
    </Button>
  );
}

function Dot({ color, title }: { color: string; title: string }) {
  return (
    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }}>
      <span className="sr-only">{title}</span>
    </span>
  );
}

function DayPopover({
  popover,
  day,
  layers,
  canEdit,
  onClose,
  onScheduleExam,
  onHolidayAdded,
  campusId,
}: {
  popover: { iso: string; x: number; y: number; mode: "view" | "add" };
  day?: DayEvents;
  layers: LayerState;
  canEdit: boolean;
  onClose: () => void;
  onScheduleExam?: () => void;
  onHolidayAdded: () => void;
  campusId?: string;
}) {
  const tr = useUiText();
  const locale = useLocale();
  const [name, setName] = useState("");
  const [fromDate, setFromDate] = useState(popover.iso);
  const [toDate, setToDate] = useState(popover.iso);
  const [saving, setSaving] = useState(false);
  const dirty = canEdit && name.trim().length > 0;

  const datesReversed = fromDate > toDate;
  /* Both of these were checked on submit and reported as toasts, so the
     button looked ready and the failure arrived after the click. */
  const blockedReason = !name.trim()
    ? "Name this holiday to add it."
    : datesReversed
      ? "The end date is before the start date."
      : null;

  const addHoliday = async () => {
    if (blockedReason) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/academic/calendar${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), fromDate, toDate }),
      });
      const json = await res.json();
      if (json.success) { toast.success(tr("Holiday added")); onHolidayAdded(); }
      else toast.error(tr(json.error || "Failed to add holiday"));
    } catch {
      toast.error(tr("Failed to add holiday"));
    } finally {
      setSaving(false);
    }
  };

  const dayLabel = new Date(`${popover.iso}T00:00:00Z`).toLocaleDateString(localeTag(locale), { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const events: { kind: string; color: string; text: string }[] = [];
  if (day) {
    if (layers.holidays) day.holidays.forEach((h) => events.push({ kind: "Holiday", color: "#0d9488", text: h.name }));
    if (layers.exams) day.exams.forEach((e) => events.push({ kind: `Exam · ${e.examType}`, color: "#8127cf", text: `${e.title} (${e.className})` }));
    if (layers.deadlines) day.deadlines.forEach((e) => events.push({ kind: "Deadline", color: "#f43f5e", text: `${e.title} — ${e.status}` }));
    if (layers.terms) day.terms.forEach((t) => events.push({ kind: t.type === "start" ? "Term starts" : "Term ends", color: "#d97706", text: `${t.term.label} (${t.term.academicYear})` }));
  }

  return (
    <Modal
      title={tr("Events on {0}", [dayLabel])}
      icon={CalendarDays}
      size="sm"
      onClose={onClose}
      dirty={dirty}
      dirtyMessage={tr("The holiday has not been added yet. Closing now throws away what you typed.")}
      dismissible={!saving}
    >
      {events.length === 0 ? (
        <p className="py-2 text-sm font-normal leading-relaxed text-ink-muted"><UiText>{"No events scheduled."}</UiText></p>
      ) : (
        <ul className="max-h-44 space-y-2 overflow-y-auto custom-scrollbar">
          {events.map((ev, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ev.color }} />
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wider" style={{ color: ev.color }}>{ev.kind}</p>
                <p className="text-xs font-semibold text-ink-strong">{ev.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-3 space-y-3 border-t border-edge/10 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-ink-muted"><UiText>{"From"}</UiText></span>
              <SystemInput type="date" aria-label={tr("From")} readOnly={saving} value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full" />
            </label>
            <label className="block">
              <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-ink-muted"><UiText>{"To"}</UiText></span>
              {/* The picker itself now refuses a date before the start. */}
              <SystemInput type="date" aria-label={tr("To")} aria-invalid={datesReversed} readOnly={saving} value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)}
                className={`w-full ${""} `} />
            </label>
          </div>
          <SystemInput
            value={name}
            readOnly={saving}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !blockedReason && !saving) addHoliday(); }}
            placeholder={tr("Holiday name")}
            aria-label={tr("Holiday name for {0}", [dayLabel])}
            className="w-full"
          />
          {blockedReason ? (
            <p className="text-2xs font-semibold text-amber-700">{blockedReason}</p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="default"
              type="button"
              onClick={addHoliday}
              disabled={saving || Boolean(blockedReason)}
              title={blockedReason || tr("Add a holiday from {0} to {1}", [fromDate, toDate])}
              className="flex flex-1 items-center justify-center gap-1 px-3 py-2"
            >
              <PartyPopper className="h-3.5 w-3.5" /><UiText>{"Add Holiday"}</UiText></Button>
            <Button variant="default"
              type="button"
              disabled={saving}
              onClick={() => { onClose(); if (onScheduleExam) onScheduleExam(); else toast.info("Open the Exam Cycles manager to schedule an exam."); }}
              title={tr("Schedule an exam on this date")}
              className="flex flex-1 items-center justify-center gap-1 px-3 py-2"
            >
              <BookOpen className="h-3.5 w-3.5" /><UiText>{"Schedule Exam"}</UiText></Button>
          </div>
        </div>
      )}

    </Modal>
  );
}


/**
 * The calendar as a chronological list. Past entries are kept but dimmed and
 * pushed below the fold — an office still needs to look back at when a term
 * ended, just not before it can see what is next.
 */
function AgendaList({
  items,
}: {
  items: { iso: string; kind: string; title: string; detail: string; color: string }[];
}) {
 const tr = useUiText();
  const locale = useLocale();
  const today = todayIso();
  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    items.forEach((i) => {
      const list = map.get(i.iso);
      if (list) list.push(i);
      else map.set(i.iso, [i]);
    });
    return [...map.entries()];
  }, [items]);

  const future = grouped.filter(([iso]) => iso >= today);
  const past = grouped.filter(([iso]) => iso < today).reverse();

  if (grouped.length === 0) {
    return (
      <EmptyState size="sm" icon={CalendarDays} title={tr("Nothing on the calendar this year")} description={tr("Terms, holidays and exam dates all appear here once they are set.")} />
    );
  }

  const renderDay = ([iso, dayItems]: [string, typeof items], isPast: boolean) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const isToday = iso === today;
    const days = Math.round((d.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
    return (
      <li key={iso} className={cn("flex flex-col gap-[8px] px-[12px] py-[12px] sm:flex-row sm:gap-4 sm:px-5", isPast && "opacity-55")}>
        <div className="shrink-0 text-start sm:w-20">
          <p
            className={cn(
              "text-sm font-bold leading-tight",
              isToday ? "text-primary" : "text-ink-strong",
            )}
          >
            {d.toLocaleDateString(localeTag(locale), { timeZone: "UTC", day: "numeric", month: "short" })}
          </p>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
            {isToday
              ? tr("Today")
              : days === 1
                ? tr("Tomorrow")
                : days > 0
                  ? new Intl.RelativeTimeFormat(locale.language, { numeric: "auto" }).format(days, "day")
                  : d.toLocaleDateString(localeTag(locale), { timeZone: "UTC", weekday: "short" })}
          </p>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {dayItems.map((item, i) => (
            <li key={`${item.kind}-${item.title}-${i}`} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink-strong [overflow-wrap:anywhere]">{item.title}</span>
                <span className="block text-2xs font-semibold text-ink-muted [overflow-wrap:anywhere]">
                  {item.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </li>
    );
  };

  return (
    <div className="max-h-[560px] overflow-y-auto custom-scrollbar">
      {future.length > 0 ? (
        <ul className="divide-y divide-edge/10">{future.map((g) => renderDay(g, false))}</ul>
      ) : (
        <p className="px-5 py-6 text-center text-sm font-normal leading-relaxed text-ink-muted"><UiText>{"Nothing else is scheduled this year."}</UiText></p>
      )}
      {past.length > 0 ? (
        <>
          <p className="border-y border-edge/10 bg-surface-subtle px-5 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-subtle"><UiText>{"Already happened"}</UiText></p>
          <ul className="divide-y divide-edge/10">{past.map((g) => renderDay(g, true))}</ul>
        </>
      ) : null}
    </div>
  );
}
