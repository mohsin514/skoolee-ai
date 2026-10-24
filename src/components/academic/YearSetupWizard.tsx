"use client";

import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Input as SystemInput } from "@/components/ui/input";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";

const WEEKDAYS = [
  { num: 1 },
  { num: 2 },
  { num: 3 },
  { num: 4 },
  { num: 5 },
  { num: 6 },
  { num: 7 },
];

/** Month and weekday names in the viewer's language (2024-01-01 is a Monday, so day n of that week is weekday n). */
function weekdayName(language: string, num: number, width: "short" | "narrow") {
  return new Intl.DateTimeFormat(language, { weekday: width, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, num)));
}
function monthName(language: string, month: number) {
  return new Intl.DateTimeFormat(language, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, month, 1)));
}

function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function overlaps(a: string, b: string, c: string, d: string) {
  return timeToMin(a) < timeToMin(d) && timeToMin(c) < timeToMin(b);
}

interface PeriodDef { id: string; periodNumber: number; startTime: string; endTime: string; }
interface Room { id: string; roomNumber: string; capacity: number; }

const STORAGE_KEY = (campusId: string | undefined) => `year-setup-wizard:${campusId || "default"}`;

/** Host-driven save (§4.4 "Save (sticky, per tab)"): a new nonce runs once. */
export type YearSetupCommand = { id: "save"; nonce: number };

/**
 * Year set-up wizard (campus operations). Each holiday, period and room row is written when it is added; what can be
 * pending is the academic year itself (step 1, before it is created) and a half-filled holiday/period/room row.
 *
 * Host-owned Save (§4.4, admin Campus setup): `hideSave` drops the wizard's own "Save and continue" (step 1's footer
 * then only advances once the year exists); `command {id:"save"}` commits what is pending — creates the year (and
 * moves on to the calendar), then adds every complete holiday/period/room row; `onDirtyChange(dirty, saving)` reports
 * whether anything is pending and whether a save is running (and `(false, false)` on unmount).
 */
export function YearSetupWizard({ campusId, onComplete, hideSave = false, command, onDirtyChange }: {
  campusId?: string;
  onComplete?: () => void;
  hideSave?: boolean;
  command?: YearSetupCommand;
  onDirtyChange?: (dirty: boolean, saving: boolean) => void;
}) {
  const ui = useUiText();
  const { language } = useLocale();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  const [yearLabel, setYearLabel] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [termCount, setTermCount] = useState(2);
  const [terms, setTerms] = useState<{ start: string; end: string }[]>([
    { start: "", end: "" },
    { start: "", end: "" },
  ]);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [cycleStatus, setCycleStatus] = useState<string>("DRAFT");

  const [weekends, setWeekends] = useState<number[]>([6, 7]);
  const [holidays, setHolidays] = useState<{ id: string; name: string; fromDate: string; toDate: string }[]>([]);

  const [classPeriods, setClassPeriods] = useState<PeriodDef[]>([]);
  const [examPeriods, setExamPeriods] = useState<PeriodDef[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [saving, setSaving] = useState(false);

  const qp = campusId ? `?campusId=${campusId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [calRes, cpRes, epRes, roomRes, cycleRes] = await Promise.all([
        fetch(`/api/academic/calendar${qp}`),
        fetch(`/api/academic/periods?timeType=CLASS${qp}`),
        fetch(`/api/academic/periods?timeType=EXAM${qp}`),
        fetch(`/api/academic/rooms${qp}`),
        fetch(`/api/academic-cycle${qp}`),
      ]);
      const [cal, cp, ep, rm, cyc] = await Promise.all([calRes.json(), cpRes.json(), epRes.json(), roomRes.json(), cycleRes.json()]);
      if (cal.success) {
        setWeekends(cal.data.weekends || [6, 7]);
        setHolidays((cal.data.holidays || []).map((h: any) => ({ ...h, fromDate: h.fromDate.slice(0, 10), toDate: h.toDate.slice(0, 10) })));
      }
      if (cp.success) setClassPeriods(cp.data);
      if (ep.success) setExamPeriods(ep.data);
      if (rm.success) setRooms(rm.data);
      if (cyc.success && cyc.active) {
        setCycleId(cyc.active.id);
        setCycleStatus(cyc.active.status);
        setYearLabel(cyc.active.label);
        setYear(cyc.active.academicYear);
        // advance straight to calendar step if a cycle already exists
        // (unless the admin has saved progress further along)
        setStep((s) => (s > 1 ? s : 1));
      }
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  // Resume progress from localStorage (plan: wizard progress persists so the
  // admin can close and come back to the same step).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY(campusId));
      if (raw) {
        const saved = JSON.parse(raw) as { step?: number; cycleId?: string | null };
        if (typeof saved.step === "number" && saved.step >= 0 && saved.step < 4) setStep(saved.step);
        if (saved.cycleId) setCycleId(saved.cycleId);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY(campusId), JSON.stringify({ step, cycleId }));
    } catch { /* ignore */ }
  }, [step, cycleId, campusId]);

  // ── Step 1: year & terms ───────────────────────────────────────────────
  const createCycle = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/academic-cycle${qp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", label: yearLabel || `${year}-${year + 1}`, academicYear: year }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(friendlyErrorMessage(new Error(typeof json.error === "string" ? json.error : ""), ui("The academic year could not be created"))); return false; }
      setCycleId(json.data.id);
      setCycleStatus(json.data.status);
      toast.success(ui("Academic year created as a draft"));
      return true;
    } catch { toast.error(ui("The academic year could not be created")); return false; }
    finally { setSaving(false); }
  };

  const nextFromStep1 = async () => {
    if (!cycleId) {
      const ok = await createCycle();
      if (!ok) return;
    }
    setStep(1);
  };

  // ── Step 2: calendar ──────────────────────────────────────────────────
  const toggleWeekend = async (num: number) => {
    const next = weekends.includes(num) ? weekends.filter((d) => d !== num) : [...weekends, num].sort();
    setWeekends(next);
    try {
      const res = await fetch(`/api/academic/calendar${qp}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: next }),
      });
      const json = await res.json();
      if (json.success) setWeekends(json.data.weekends);
    } catch { toast.error(ui("Weekends could not be updated")); }
  };

  const [holidayDraft, setHolidayDraft] = useState({ name: "", fromDate: "", toDate: "" });
  const holidayReady = Boolean(holidayDraft.name.trim() && holidayDraft.fromDate && holidayDraft.toDate);
  const addHoliday = async () => {
    if (!holidayReady) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/academic/calendar${qp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(holidayDraft),
      });
      const json = await res.json();
      if (json.success) {
        setHolidays((h) => [...h, { ...json.data, fromDate: json.data.fromDate.slice(0, 10), toDate: json.data.toDate.slice(0, 10) }]);
        setHolidayDraft({ name: "", fromDate: "", toDate: "" });
        toast.success(ui("Holiday added"));
      } else toast.error(friendlyErrorMessage(new Error(typeof json.error === "string" ? json.error : ""), ui("The holiday could not be added. Try again.")));
    } finally { setSaving(false); }
  };
  const removeHoliday = async (id: string) => {
    try {
      const sp = new URLSearchParams({ id });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/academic/calendar?${sp.toString()}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) setHolidays((h) => h.filter((x) => x.id !== id));
    } catch { toast.error(ui("The holiday could not be removed")); }
  };

  const isHoliday = (iso: string) => holidays.some((h) => iso >= h.fromDate && iso <= h.toDate);
  const holidayOn = (iso: string) => holidays.find((h) => iso >= h.fromDate && iso <= h.toDate);

  // Click a day to toggle that weekday on/off the weekend list; switch to
  // holiday mode to click a range (start → end) and draft a holiday.
  const [holidayMode, setHolidayMode] = useState(false);
  const [holidayPick, setHolidayPick] = useState<string | null>(null);
  const onDayClick = (iso: string) => {
    if (holidayMode) {
      if (!holidayPick) { setHolidayPick(iso); return; }
      const [a, b] = [holidayPick, iso].sort();
      setHolidayDraft((d) => ({ ...d, fromDate: a, toDate: b }));
      setHolidayPick(null);
      setHolidayMode(false);
      return;
    }
    const dow = ((new Date(`${iso}T00:00:00`).getDay() + 6) % 7) + 1;
    toggleWeekend(dow);
  };

  // ── Step 3: periods ───────────────────────────────────────────────────
  const [periodTab, setPeriodTab] = useState<"CLASS" | "EXAM">("CLASS");
  const [periodDraft, setPeriodDraft] = useState({ periodNumber: "", startTime: "", endTime: "" });
  const activePeriods = periodTab === "CLASS" ? classPeriods : examPeriods;
  const setActivePeriods = periodTab === "CLASS" ? setClassPeriods : setExamPeriods;

  const periodOverlap = (start: string, end: string, excludeId?: string) =>
    activePeriods.some((p) => p.id !== excludeId && overlaps(p.startTime, p.endTime, start, end));

  // R4: validation shows inline under the row (Add stays disabled with the reason), never as a toast.
  const periodNumber = parseInt(periodDraft.periodNumber, 10);
  const periodProblem = !periodNumber || !periodDraft.startTime || !periodDraft.endTime ? null
    : timeToMin(periodDraft.startTime) >= timeToMin(periodDraft.endTime) ? "End must be after start"
    : periodOverlap(periodDraft.startTime, periodDraft.endTime) ? "Overlaps another period" : null;
  const periodReady = Boolean(periodNumber && periodDraft.startTime && periodDraft.endTime) && !periodProblem;
  const addPeriod = async () => {
    const num = periodNumber;
    if (!periodReady) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/academic/periods${qp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeType: periodTab, periodNumber: num, startTime: periodDraft.startTime, endTime: periodDraft.endTime }),
      });
      const json = await res.json();
      if (json.success) {
        setActivePeriods((p) => [...p, json.data].sort((a: PeriodDef, b: PeriodDef) => a.periodNumber - b.periodNumber));
        setPeriodDraft({ periodNumber: "", startTime: "", endTime: "" });
        toast.success(ui("Period added"));
      } else toast.error(friendlyErrorMessage(new Error(typeof json.error === "string" ? json.error : ""), ui("The period could not be added. Try again.")));
    } finally { setSaving(false); }
  };
  const deletePeriod = async (id: string) => {
    try {
      const sp = new URLSearchParams({ id });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/academic/periods?${sp.toString()}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) setActivePeriods((p) => p.filter((x) => x.id !== id));
    } catch { toast.error(ui("The period could not be removed")); }
  };

  // ── Step 4: rooms ─────────────────────────────────────────────────────
  const [roomDraft, setRoomDraft] = useState({ roomNumber: "", capacity: "" });
  const addRoom = async () => {
    if (!roomDraft.roomNumber.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/academic/rooms${qp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomNumber: roomDraft.roomNumber, capacity: parseInt(roomDraft.capacity || "0", 10) }),
      });
      const json = await res.json();
      if (json.success) { setRooms((r) => [...r, json.data]); setRoomDraft({ roomNumber: "", capacity: "" }); toast.success(ui("Room added")); }
      else toast.error(friendlyErrorMessage(new Error(typeof json.error === "string" ? json.error : ""), ui("The room could not be added. Try again.")));
    } finally { setSaving(false); }
  };
  const deleteRoom = async (id: string) => {
    try {
      const sp = new URLSearchParams({ id });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/academic/rooms?${sp.toString()}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) setRooms((r) => r.filter((x) => x.id !== id));
    } catch { toast.error(ui("The room could not be removed")); }
  };

  // ── Host-owned Save (§4.4) ──────────────────────────────────────────────
  const roomReady = Boolean(roomDraft.roomNumber.trim());
  const dirty = !loading && (!cycleId
    || Boolean(holidayDraft.name.trim() || holidayDraft.fromDate || holidayDraft.toDate)
    || Boolean(periodDraft.periodNumber || periodDraft.startTime || periodDraft.endTime)
    || Boolean(roomDraft.roomNumber.trim() || roomDraft.capacity));
  const saveAll = async () => {
    if (saving) return;
    if (!cycleId) {
      // The year is the wizard's first commit; once it exists the calendar is the next step.
      if (await createCycle()) setStep((current) => (current === 0 ? 1 : current));
      return;
    }
    if (holidayReady) await addHoliday();
    if (periodReady) await addPeriod();
    if (roomReady) await addRoom();
  };
  const dirtyListener = useRef(onDirtyChange);
  useEffect(() => { dirtyListener.current = onDirtyChange; });
  useEffect(() => { dirtyListener.current?.(dirty, saving); }, [dirty, saving]);
  // Reads the latest listener at unmount (kept current by the effect above).
  useEffect(() => () => dirtyListener.current?.(false, false), []);
  // Seeded with the command present at mount, so a remount never replays the last one.
  const handledCommand = useRef<number | null>(command?.nonce ?? null);
  useEffect(() => {
    if (!command || handledCommand.current === command.nonce) return;
    handledCommand.current = command.nonce;
    if (command.id === "save") void saveAll();
    // Only a new nonce runs a command; it reads the drafts on screen at that moment.
  }, [command?.nonce]);

  const completeSetup = async () => {
    if (cycleStatus === "DRAFT" && cycleId) {
      setSaving(true);
      try {
        const res = await fetch(`/api/academic-cycle${qp}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "activate", cycleId }),
        });
        const json = await res.json();
        if (json.success) { setCycleStatus(json.data.status); toast.success(ui("Year setup complete — the academic year is now active")); }
      } finally { setSaving(false); }
    }
    onComplete?.();
  };

  const steps = ["Year and terms", "Calendar", "Periods", "Rooms"];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {steps.map((_, i) => (
            <div key={i} className="h-12 flex-1 rounded-2xl bg-border-subtle/50 skeleton-shimmer" />
          ))}
        </div>
        <div className="h-72 rounded-[28px] bg-border-subtle/30 skeleton-shimmer" />
        <div className="h-12 rounded-2xl bg-border-subtle/40 skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <Button aria-pressed={i === step} variant="choice" aria-label={ui(s)}
              onClick={() => setStep(i)}
              className={"justify-start " + (`flex flex-1 items-center gap-2 px-4 py-2.5 ${
                i === step ? "" : i < step ? "" : ""
              } `)}
            >
              {i < step ? <CheckCircle2 className="h-4 w-4" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-2xs"><bdi>{i + 1}</bdi></span>}
              <span className="hidden sm:inline">{ui(s)}</span>
            </Button>
          </div>
        ))}
      </div>

      <div className="sk-panel border-edge/12 p-6">
        {/* STEP 1 */}
        {step === 0 && (
          <div className="space-y-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-ink-strong"><CalendarDays className="h-5 w-5 text-primary" />{ui("Define year and terms")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={ui("Year label")} value={yearLabel} onChange={setYearLabel} placeholder="2026-2027" />
              <Field label={ui("Academic year")} type="number" value={String(year)} onChange={(v) => setYear(parseInt(v || "0", 10))} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-ink-muted">{ui("Number of terms")}</p>
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => (
                  <Button aria-pressed={termCount === n} variant="choice" key={n} onClick={() => { setTermCount(n); setTerms(Array.from({ length: n }, () => ({ start: "", end: "" }))); }}
                    className={`px-5 py-2 ${termCount === n ? "" : ""} `}>
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {terms.map((t, i) => (
                <div key={i} className="grid grid-cols-2 gap-3 rounded-2xl border border-edge/15 bg-surface-subtle p-3">
                  <Field label={ui("Term {0} start", [i + 1])} type="date" value={t.start} onChange={(v) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, start: v } : x)))} />
                  <Field label={ui("Term {0} end", [i + 1])} type="date" value={t.end} onChange={(v) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, end: v } : x)))} />
                </div>
              ))}
            </div>
            <TermBlocksBar terms={terms} />
            {/* No in-card "Save & Continue" here. It sat a few pixels above the
                wizard's own Next button, equally weighted, and the two did
                different things — this one created the academic cycle, Next
                only advanced. The footer Next now commits the step. */}
          </div>
        )}

        {/* STEP 2 — Calendar */}
        {step === 1 && (
          <div className="space-y-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-ink-strong"><CalendarDays className="h-5 w-5 text-primary" />{ui("Set the calendar")}</h3>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <Button aria-pressed={weekends.includes(d.num)} variant="choice" key={d.num} onClick={() => toggleWeekend(d.num)}
                  className={`px-3 py-1.5 ${weekends.includes(d.num) ? "" : ""} `}>
                  {weekdayName(language, d.num, "short")}{weekends.includes(d.num) ? ` · ${ui("off")}` : ""}
                </Button>
              ))}
              <Button aria-pressed={holidayMode} variant="choice"
                onClick={() => { setHolidayMode((v) => !v); setHolidayPick(null); }}
                className={`px-3 py-1.5 ${holidayMode ? "" : ""} `}
              >
                {holidayMode ? (holidayPick ? ui("Finish range → {0}", [holidayPick]) : ui("Pick end day…")) : ui("Mark holiday range")}
              </Button>
            </div>
            <p className="text-2xs font-medium text-ink-muted">
              {ui("Tip: click any calendar day to toggle that weekday as a weekend. Use “Mark holiday range” then click two days to draft a holiday.")}
            </p>
            <YearCalendar year={year} weekends={weekends} holidays={holidays} isHoliday={isHoliday} holidayOn={holidayOn} holidayMode={holidayMode} holidayPick={holidayPick} onDayClick={onDayClick} />
            <div className="rounded-2xl border border-edge/15 bg-surface-subtle p-4">
              <p className="mb-2 text-xs font-semibold text-ink-muted">{ui("Add a holiday")}</p>
              <div className="flex flex-wrap items-end gap-3">
                <Field label={ui("Name")} value={holidayDraft.name} onChange={(v) => setHolidayDraft((d) => ({ ...d, name: v }))} />
                <Field label={ui("From")} type="date" value={holidayDraft.fromDate} onChange={(v) => setHolidayDraft((d) => ({ ...d, fromDate: v }))} />
                <Field label={ui("To")} type="date" value={holidayDraft.toDate} onChange={(v) => setHolidayDraft((d) => ({ ...d, toDate: v }))} />
                <Button variant="default" onClick={addHoliday} disabled={saving || !holidayReady} className="justify-start flex items-center gap-1 px-4 py-2"><Plus className="h-4 w-4" />{ui("Add")}</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {holidays.map((h) => (
                  <span key={h.id} className="flex items-center gap-2 rounded-full bg-status-info-surface px-3 py-1 text-xs font-bold text-status-info-text">
                    {h.name} ({h.fromDate}→{h.toDate})
                    <Button variant="ghost" onClick={() => removeHoliday(h.id)} className=""><X className="h-3 w-3" /></Button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 — Periods */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-ink-strong"><Clock className="h-5 w-5 text-primary" />{ui("Define periods")}</h3>
              <div className="flex gap-2">
                {(["CLASS", "EXAM"] as const).map((t) => (
                  <Button aria-pressed={periodTab === t} variant="choice" key={t} onClick={() => setPeriodTab(t)} className={`px-4 py-1.5 ${periodTab === t ? "" : ""} `}>
                    {ui(t === "CLASS" ? "Class periods" : "Exam periods")}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-edge/15 bg-surface-subtle p-4 sm:grid-cols-4">
              <Field label={ui("Period #")} type="number" value={periodDraft.periodNumber} onChange={(v) => setPeriodDraft((d) => ({ ...d, periodNumber: v }))} />
              <Field label={ui("Start")} type="time" value={periodDraft.startTime} onChange={(v) => setPeriodDraft((d) => ({ ...d, startTime: v }))} />
              <Field label={ui("End")} type="time" value={periodDraft.endTime} onChange={(v) => setPeriodDraft((d) => ({ ...d, endTime: v }))} />
              <Button variant="default" onClick={addPeriod} loading={saving} disabled={!periodReady} className="flex items-end justify-center gap-1 px-4 py-2"><Plus className="h-4 w-4" />{ui("Add")}</Button>
              {periodProblem ? <p role="alert" className="col-span-full text-xs font-semibold text-status-error-text">{ui(periodProblem)}</p> : null}
            </div>
            <div className="space-y-2">
              {activePeriods.length === 0 && <EmptyState size="sm" icon={Clock} title={ui(periodTab === "CLASS" ? "No class periods yet" : "No exam periods yet")} description={ui("Add the first period above with its start and end time.")} />}
              {activePeriods.map((p) => (
                <div key={p.id} className="sk-panel flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-sm font-bold text-primary">P{p.periodNumber}</span>
                    <span className="text-sm font-semibold text-ink">{p.startTime} – {p.endTime}</span>
                  </div>
                  <IconButton label={ui("Remove period {0}", [p.periodNumber])} variant="ghost" onClick={() => deletePeriod(p.id)}><Trash2 className="h-4 w-4" aria-hidden="true" /></IconButton>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4 — Rooms */}
        {step === 3 && (
          <div className="space-y-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-ink-strong"><Building2 className="h-5 w-5 text-primary" />{ui("Classrooms")}</h3>
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-edge/15 bg-surface-subtle p-4 sm:grid-cols-4">
              <Field label={ui("Room #")} value={roomDraft.roomNumber} onChange={(v) => setRoomDraft((d) => ({ ...d, roomNumber: v }))} />
              <Field label={ui("Capacity")} type="number" value={roomDraft.capacity} onChange={(v) => setRoomDraft((d) => ({ ...d, capacity: v }))} />
              <div className="sm:col-span-2 flex items-end">
                <Button variant="default" onClick={addRoom} disabled={saving || !roomDraft.roomNumber.trim()} className="justify-start flex items-center gap-1 px-4 py-2"><Plus className="h-4 w-4" />{ui("Add room")}</Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {rooms.map((r) => (
                <div key={r.id} className="sk-panel flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-ink-strong">{ui("Room")}{" "}{r.roomNumber}</p>
                    <p className="text-xs text-ink-muted">{ui("Capacity")}{" "}{r.capacity}</p>
                  </div>
                  <IconButton label={ui("Remove room {0}", [r.roomNumber])} variant="ghost" onClick={() => deleteRoom(r.id)}><Trash2 className="h-4 w-4" aria-hidden="true" /></IconButton>
                </div>
              ))}
              {rooms.length === 0 && <div className="sm:col-span-3"><EmptyState size="sm" icon={Building2} title={ui("No rooms yet")} description={ui("Optional. Skip this step if you do not use rooms.")} /></div>}
            </div>
            <div className="flex justify-end">
              <Button variant="default" onClick={completeSetup} loading={saving} className="justify-start flex items-center gap-2 px-6 py-3">
                {saving ? null : <Check className="h-4 w-4" aria-hidden="true" />}{" "}{ui("Complete setup")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* nav */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
          className="justify-start flex items-center gap-2 px-5 py-2.5">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{" "}{ui("Back")}
        </Button>
        {/* Step 1 has pending state to commit (the academic cycle); the later
            steps save each control as it changes, so a plain advance is
            correct there. */}
        {/* With a host-owned Save (hideSave) step 1's footer only advances, once the year has been saved. */}
        {step < 3 && (
          <Button variant={hideSave ? "outline" : "default"}
            onClick={step === 0 && !hideSave ? nextFromStep1 : () => setStep((s) => s + 1)}
            disabled={saving || (hideSave && step === 0 && !cycleId)}
            loading={!hideSave && step === 0 && saving}
            className="justify-start flex items-center gap-2 px-5 py-2.5"
          >
            {step === 0 && !hideSave ? ui("Save and continue") : ui("Next")} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

const TERM_COLORS = ["from-primary to-brand-700", "from-brand-400 to-brand-500", "from-brand-700 to-brand-900"];

function TermBlocksBar({ terms }: { terms: { start: string; end: string }[] }) {
  const ui = useUiText();
  const filled = terms.filter((t) => t.start && t.end);
  if (filled.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-edge/30 bg-surface-subtle py-4 text-xs font-semibold text-ink-subtle">
        {ui("Pick term dates above to preview the year divided into colored term blocks")}
      </div>
    );
  }
  const starts = filled.map((t) => new Date(t.start).getTime());
  const ends = filled.map((t) => new Date(t.end).getTime());
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  const span = Math.max(1, max - min);
  return (
    <div className="sk-panel p-4">
      <p className="mb-3 text-2xs font-semibold text-ink-muted">{ui("Year preview")}</p>
      <div className="relative flex h-10 w-full gap-1 overflow-hidden rounded-xl bg-muted">
        {filled.map((t, i) => {
          const s = new Date(t.start).getTime();
          const e = new Date(t.end).getTime();
          const left = ((s - min) / span) * 100;
          const width = Math.max(2, ((e - s) / span) * 100);
          return (
            <div
              key={i}
              className={`absolute top-0 h-full rounded-lg bg-gradient-to-r ${TERM_COLORS[i % TERM_COLORS.length]} flex items-center justify-center text-2xs font-semibold text-white`}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              {width > 12 ? ui("Term {0}", [i + 1]) : ui("T{0}", [i + 1])}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {filled.map((t, i) => (
          <span key={i} className="flex items-center gap-1.5 text-2xs font-bold text-ink-muted">
            <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${TERM_COLORS[i % TERM_COLORS.length]}`} />
            {ui("Term")}{" "}{i + 1}: {t.start} → {t.end}
          </span>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs font-semibold text-ink-muted">{label}</span>
      <SystemInput type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full" />
    </label>
  );
}

function YearCalendar({ year, weekends, holidays, isHoliday, holidayOn, holidayMode, holidayPick, onDayClick }: {
  year: number;
  weekends: number[];
  holidays: any[];
  isHoliday: (iso: string) => boolean;
  holidayOn: (iso: string) => any;
  holidayMode: boolean;
  holidayPick: string | null;
  onDayClick: (iso: string) => void;
}) {
  const ui = useUiText();
  const { language } = useLocale();
  const months = Array.from({ length: 12 }, (_, m) => {
    const first = new Date(year, m, 1);
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const leading = (first.getDay() + 6) % 7; // Mon=0
    return { m, daysInMonth, leading };
  });
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
      {months.map(({ m, daysInMonth, leading }) => (
        <div key={m} className="sk-panel p-3">
          <p className="mb-2 text-center text-xs font-bold text-primary">{monthName(language, m)} {year}</p>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-bold text-ink-subtle">
            {WEEKDAYS.map((d) => <span key={d.num}>{weekdayName(language, d.num, "narrow")}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {Array.from({ length: leading }).map((_, i) => <span key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, d) => {
              const dayNum = d + 1;
              const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const dow = ((new Date(iso).getDay() + 6) % 7) + 1;
              const isWeekend = weekends.includes(dow);
              const hol = isHoliday(iso);
              const isPick = holidayMode && holidayPick === iso;
              return (
                <Button variant="choice"
                  data-selected={isPick}
                  aria-pressed={holidayMode ? isPick : isWeekend}
                  aria-label={`${iso} · ${hol ? holidays.find((h) => iso >= h.fromDate && iso <= h.toDate)?.name : ui(holidayMode ? "Select for holiday range" : isWeekend ? "Make this weekday a working day" : "Make this weekday a weekend")}`}
                  key={dayNum}
                  type="button"
                  onClick={() => onDayClick(iso)}
                  className={`min-h-11 min-w-0 px-0 py-1 ${hol ? "bg-status-info-surface text-status-info-text" : isWeekend ? "bg-surface-subtle text-ink-muted" : ""}`}
                >
                  {dayNum}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
