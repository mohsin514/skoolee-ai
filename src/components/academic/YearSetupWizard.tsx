"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const WEEKDAYS = [
  { num: 1, short: "Mon" },
  { num: 2, short: "Tue" },
  { num: 3, short: "Wed" },
  { num: 4, short: "Thu" },
  { num: 5, short: "Fri" },
  { num: 6, short: "Sat" },
  { num: 7, short: "Sun" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

export function YearSetupWizard({ campusId, onComplete }: { campusId?: string; onComplete?: () => void }) {
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
      if (!json.success) { toast.error(json.error || "Failed to create year"); return false; }
      setCycleId(json.data.id);
      setCycleStatus(json.data.status);
      toast.success("Academic year created (Draft)");
      return true;
    } catch { toast.error("Failed to create year"); return false; }
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
    } catch { toast.error("Failed to update weekends"); }
  };

  const [holidayDraft, setHolidayDraft] = useState({ name: "", fromDate: "", toDate: "" });
  const addHoliday = async () => {
    if (!holidayDraft.name || !holidayDraft.fromDate || !holidayDraft.toDate) { toast.error("Fill holiday name and dates"); return; }
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
        toast.success("Holiday added");
      } else toast.error(json.error || "Failed");
    } finally { setSaving(false); }
  };
  const removeHoliday = async (id: string) => {
    try {
      const sp = new URLSearchParams({ id });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/academic/calendar?${sp.toString()}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) setHolidays((h) => h.filter((x) => x.id !== id));
    } catch { toast.error("Failed to remove holiday"); }
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

  const addPeriod = async () => {
    const num = parseInt(periodDraft.periodNumber, 10);
    if (!num || !periodDraft.startTime || !periodDraft.endTime) { toast.error("Fill period number, start and end"); return; }
    if (timeToMin(periodDraft.startTime) >= timeToMin(periodDraft.endTime)) { toast.error("End must be after start"); return; }
    if (periodOverlap(periodDraft.startTime, periodDraft.endTime)) { toast.error("Overlaps another period"); return; }
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
        toast.success("Period added");
      } else toast.error(json.error || "Failed");
    } finally { setSaving(false); }
  };
  const deletePeriod = async (id: string) => {
    try {
      const sp = new URLSearchParams({ id });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/academic/periods?${sp.toString()}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) setActivePeriods((p) => p.filter((x) => x.id !== id));
    } catch { toast.error("Failed to delete period"); }
  };

  // ── Step 4: rooms ─────────────────────────────────────────────────────
  const [roomDraft, setRoomDraft] = useState({ roomNumber: "", capacity: "" });
  const addRoom = async () => {
    if (!roomDraft.roomNumber) { toast.error("Room number required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/academic/rooms${qp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomNumber: roomDraft.roomNumber, capacity: parseInt(roomDraft.capacity || "0", 10) }),
      });
      const json = await res.json();
      if (json.success) { setRooms((r) => [...r, json.data]); setRoomDraft({ roomNumber: "", capacity: "" }); toast.success("Room added"); }
      else toast.error(json.error || "Failed");
    } finally { setSaving(false); }
  };
  const deleteRoom = async (id: string) => {
    try {
      const sp = new URLSearchParams({ id });
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/academic/rooms?${sp.toString()}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) setRooms((r) => r.filter((x) => x.id !== id));
    } catch { toast.error("Failed to delete room"); }
  };

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
        if (json.success) { setCycleStatus(json.data.status); toast.success("Year setup complete — cycle is now ACTIVE"); }
      } finally { setSaving(false); }
    }
    onComplete?.();
  };

  const steps = ["Year & Terms", "Calendar", "Periods", "Rooms"];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {steps.map((_, i) => (
            <div key={i} className="h-12 flex-1 rounded-2xl bg-[#e8e0ec]/50 skeleton-shimmer" />
          ))}
        </div>
        <div className="h-72 rounded-[28px] bg-[#e8e0ec]/30 skeleton-shimmer" />
        <div className="h-12 rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => setStep(i)}
              className={`flex flex-1 items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold transition-all ${
                i === step ? "border-[#8127cf] bg-[#8127cf] text-white" : i < step ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#cfc2d6]/30 bg-white text-[#4d4354]/50"
              }`}
            >
              {i < step ? <CheckCircle2 className="h-4 w-4" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-[10px]">{i + 1}</span>}
              <span className="hidden sm:inline">{s}</span>
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-[28px] border border-[#cfc2d6]/12 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.18)] p-6">
        {/* STEP 1 */}
        {step === 0 && (
          <div className="space-y-5">
            <h3 className="flex items-center gap-2 text-base font-black text-[#1f1a23]"><CalendarDays className="h-5 w-5 text-[#8127cf]" />Define Year &amp; Terms</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Year Label" value={yearLabel} onChange={setYearLabel} placeholder="2026-2027" />
              <Field label="Academic Year" type="number" value={String(year)} onChange={(v) => setYear(parseInt(v || "0", 10))} />
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#4d4354]/55">Number of Terms</p>
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => (
                  <button key={n} onClick={() => { setTermCount(n); setTerms(Array.from({ length: n }, () => ({ start: "", end: "" }))); }}
                    className={`rounded-xl border px-5 py-2 text-sm font-bold ${termCount === n ? "border-[#8127cf] bg-[#8127cf] text-white" : "border-[#cfc2d6]/30 bg-white text-[#4d4354]/60"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {terms.map((t, i) => (
                <div key={i} className="grid grid-cols-2 gap-3 rounded-2xl border border-[#cfc2d6]/15 bg-[#faf7fc] p-3">
                  <Field label={`Term ${i + 1} Start`} type="date" value={t.start} onChange={(v) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, start: v } : x)))} />
                  <Field label={`Term ${i + 1} End`} type="date" value={t.end} onChange={(v) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, end: v } : x)))} />
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
            <h3 className="flex items-center gap-2 text-base font-black text-[#1f1a23]"><CalendarDays className="h-5 w-5 text-[#8127cf]" />Set Calendar</h3>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <button key={d.num} onClick={() => toggleWeekend(d.num)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${weekends.includes(d.num) ? "border-[#8127cf] bg-[#8127cf] text-white" : "border-[#cfc2d6]/30 bg-white text-[#4d4354]/60"}`}>
                  {d.short}{weekends.includes(d.num) ? " · off" : ""}
                </button>
              ))}
              <button
                onClick={() => { setHolidayMode((v) => !v); setHolidayPick(null); }}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${holidayMode ? "border-teal-500 bg-teal-500 text-white shadow-md shadow-teal-500/25" : "border-teal-500/40 bg-teal-50 text-teal-700 hover:bg-teal-100"}`}
              >
                {holidayMode ? (holidayPick ? `Finish range → ${holidayPick}` : "Pick end day…") : "✚ Mark holiday range"}
              </button>
            </div>
            <p className="text-[10px] font-semibold text-[#4d4354]/50">
              Tip: click any calendar day to toggle that weekday as a weekend. Use “Mark holiday range” then click two days to draft a holiday.
            </p>
            <YearCalendar year={year} weekends={weekends} holidays={holidays} isHoliday={isHoliday} holidayOn={holidayOn} holidayMode={holidayMode} holidayPick={holidayPick} onDayClick={onDayClick} />
            <div className="rounded-2xl border border-[#cfc2d6]/15 bg-[#faf7fc] p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#4d4354]/55">Add Holiday</p>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Name" value={holidayDraft.name} onChange={(v) => setHolidayDraft((d) => ({ ...d, name: v }))} />
                <Field label="From" type="date" value={holidayDraft.fromDate} onChange={(v) => setHolidayDraft((d) => ({ ...d, fromDate: v }))} />
                <Field label="To" type="date" value={holidayDraft.toDate} onChange={(v) => setHolidayDraft((d) => ({ ...d, toDate: v }))} />
                <button onClick={addHoliday} disabled={saving} className="flex items-center gap-1 rounded-xl bg-[#8127cf] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Add</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {holidays.map((h) => (
                  <span key={h.id} className="flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
                    {h.name} ({h.fromDate}→{h.toDate})
                    <button onClick={() => removeHoliday(h.id)} className="text-teal-700/60 hover:text-rose-500"><X className="h-3 w-3" /></button>
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
              <h3 className="flex items-center gap-2 text-base font-black text-[#1f1a23]"><Clock className="h-5 w-5 text-[#8127cf]" />Define Periods</h3>
              <div className="flex gap-2">
                {(["CLASS", "EXAM"] as const).map((t) => (
                  <button key={t} onClick={() => setPeriodTab(t)} className={`rounded-xl border px-4 py-1.5 text-xs font-bold ${periodTab === t ? "border-[#8127cf] bg-[#8127cf] text-white" : "border-[#cfc2d6]/30 bg-white text-[#4d4354]/60"}`}>
                    {t === "CLASS" ? "Class Periods" : "Exam Periods"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#cfc2d6]/15 bg-[#faf7fc] p-4 sm:grid-cols-4">
              <Field label="Period #" type="number" value={periodDraft.periodNumber} onChange={(v) => setPeriodDraft((d) => ({ ...d, periodNumber: v }))} />
              <Field label="Start" type="time" value={periodDraft.startTime} onChange={(v) => setPeriodDraft((d) => ({ ...d, startTime: v }))} />
              <Field label="End" type="time" value={periodDraft.endTime} onChange={(v) => setPeriodDraft((d) => ({ ...d, endTime: v }))} />
              <button onClick={addPeriod} disabled={saving} className="flex items-end justify-center gap-1 rounded-xl bg-[#8127cf] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Add</button>
            </div>
            <div className="space-y-2">
              {activePeriods.length === 0 && <p className="rounded-2xl border border-dashed border-[#cfc2d6]/30 bg-[#faf7fc] py-6 text-center text-sm text-[#4d4354]/50">No {periodTab.toLowerCase()} periods yet</p>}
              {activePeriods.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl border border-[#cfc2d6]/15 bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3eeff] text-sm font-black text-[#8127cf]">P{p.periodNumber}</span>
                    <span className="text-sm font-semibold text-[#4d4354]/70">{p.startTime} – {p.endTime}</span>
                  </div>
                  <button onClick={() => deletePeriod(p.id)} className="text-[#4d4354]/40 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4 — Rooms */}
        {step === 3 && (
          <div className="space-y-5">
            <h3 className="flex items-center gap-2 text-base font-black text-[#1f1a23]"><Building2 className="h-5 w-5 text-[#8127cf]" />Classrooms</h3>
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#cfc2d6]/15 bg-[#faf7fc] p-4 sm:grid-cols-4">
              <Field label="Room #" value={roomDraft.roomNumber} onChange={(v) => setRoomDraft((d) => ({ ...d, roomNumber: v }))} />
              <Field label="Capacity" type="number" value={roomDraft.capacity} onChange={(v) => setRoomDraft((d) => ({ ...d, capacity: v }))} />
              <div className="sm:col-span-2 flex items-end">
                <button onClick={addRoom} disabled={saving} className="flex items-center gap-1 rounded-xl bg-[#8127cf] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Add Room</button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {rooms.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-2xl border border-[#cfc2d6]/15 bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-[#1f1a23]">Room {r.roomNumber}</p>
                    <p className="text-xs text-[#4d4354]/55">Capacity {r.capacity}</p>
                  </div>
                  <button onClick={() => deleteRoom(r.id)} className="text-[#4d4354]/40 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {rooms.length === 0 && <p className="sm:col-span-3 rounded-2xl border border-dashed border-[#cfc2d6]/30 bg-[#faf7fc] py-6 text-center text-sm text-[#4d4354]/50">No rooms yet — optional, skip if not used</p>}
            </div>
            <div className="flex justify-end">
              <button onClick={completeSetup} disabled={saving} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-black text-white disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Complete Setup
              </button>
            </div>
          </div>
        )}
      </div>

      {/* nav */}
      <div className="flex justify-between">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
          className="flex items-center gap-2 rounded-2xl border border-[#cfc2d6]/30 bg-white px-5 py-2.5 text-sm font-bold text-[#4d4354]/70 disabled:opacity-40">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {/* Step 1 has pending state to commit (the academic cycle); the later
            steps save each control as it changes, so a plain advance is
            correct there. */}
        {step < 3 && (
          <button
            onClick={step === 0 ? nextFromStep1 : () => setStep((s) => s + 1)}
            disabled={saving}
            className="flex items-center gap-2 rounded-2xl bg-[#8127cf] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {step === 0 && saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving
              </>
            ) : (
              <>
                {step === 0 ? "Save & Continue" : "Next"} <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

const TERM_COLORS = ["from-[#8127cf] to-[#6a1fb0]", "from-teal-500 to-teal-600", "from-amber-500 to-[#d97706]"];

function TermBlocksBar({ terms }: { terms: { start: string; end: string }[] }) {
  const filled = terms.filter((t) => t.start && t.end);
  if (filled.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-[#cfc2d6]/30 bg-[#faf7fc] py-4 text-xs font-semibold text-[#4d4354]/45">
        Pick term dates above to preview the year divided into colored term blocks
      </div>
    );
  }
  const starts = filled.map((t) => new Date(t.start).getTime());
  const ends = filled.map((t) => new Date(t.end).getTime());
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  const span = Math.max(1, max - min);
  return (
    <div className="rounded-2xl border border-[#cfc2d6]/15 bg-white p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/55">Year Preview</p>
      <div className="relative flex h-10 w-full gap-1 overflow-hidden rounded-xl bg-[#f3f4f9]">
        {filled.map((t, i) => {
          const s = new Date(t.start).getTime();
          const e = new Date(t.end).getTime();
          const left = ((s - min) / span) * 100;
          const width = Math.max(2, ((e - s) / span) * 100);
          return (
            <div
              key={i}
              className={`absolute top-0 h-full rounded-lg bg-gradient-to-r ${TERM_COLORS[i % TERM_COLORS.length]} flex items-center justify-center text-[9px] font-black uppercase tracking-wider text-white`}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              {width > 12 ? `Term ${i + 1}` : `T${i + 1}`}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {filled.map((t, i) => (
          <span key={i} className="flex items-center gap-1.5 text-[10px] font-bold text-[#4d4354]/60">
            <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${TERM_COLORS[i % TERM_COLORS.length]}`} />
            Term {i + 1}: {t.start} → {t.end}
          </span>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/55">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#cfc2d6]/30 bg-white px-3 py-2 text-sm font-semibold text-[#1f1a23] outline-none focus:border-[#8127cf]/60" />
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
  const months = Array.from({ length: 12 }, (_, m) => {
    const first = new Date(year, m, 1);
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const leading = (first.getDay() + 6) % 7; // Mon=0
    return { m, daysInMonth, leading };
  });
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {months.map(({ m, daysInMonth, leading }) => (
        <div key={m} className="rounded-2xl border border-[#cfc2d6]/15 bg-white p-3">
          <p className="mb-2 text-center text-xs font-black text-[#8127cf]">{MONTHS[m]} {year}</p>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[8px] font-bold text-[#4d4354]/40">
            {WEEKDAYS.map((d) => <span key={d.num}>{d.short[0]}</span>)}
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
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => onDayClick(iso)}
                  title={hol ? holidays.find((h) => iso >= h.fromDate && iso <= h.toDate)?.name : holidayMode ? "Click to select for holiday range" : isWeekend ? "Click to make this weekday a working day" : "Click to make this weekday a weekend"}
                  className={`flex h-6 cursor-pointer items-center justify-center rounded text-[9px] font-semibold transition-all ${
                    isPick
                      ? "bg-teal-500 text-white ring-2 ring-teal-300"
                      : hol
                        ? "bg-teal-500 text-white"
                        : isWeekend
                          ? "bg-[#f3f4f9] text-[#4d4354]/40 hover:bg-[#e8e0ec]"
                          : "text-[#4d4354]/70 hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
