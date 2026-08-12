"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, CalendarDays, Loader2, Printer } from "lucide-react";

const WEEKDAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function weekdayLabel(dateStr: string): string {
  const day = new Date(dateStr + "T00:00:00").getDay();
  return WEEKDAY_LABELS[day === 0 ? 7 : day];
}

interface ExamSheetExam {
  id: string;
  title: string;
  term: string;
  academicYear: number;
  status: string;
  classId: string;
  class?: { name: string; section: string | null } | null;
}

interface PaperRow {
  id: string;
  date: string;
  subject: { id: string; name: string } | null;
  periodDefinition: { periodNumber: number; startTime: string; endTime: string } | null;
  room: { roomNumber: string } | null;
}

interface GroupedDay {
  date: string;
  rows: PaperRow[];
}

export function ExamDateSheet({
  classId,
  token,
  campusId,
}: {
  classId?: string;
  token?: string;
  campusId?: string;
}) {
  const printId = useId();
  const [exams, setExams] = useState<ExamSheetExam[]>([]);
  const [schedules, setSchedules] = useState<Record<string, PaperRow[]>>({});
  const [selectedExamId, setSelectedExamId] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [weekends, setWeekends] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const fetchedSheets = useRef(new Set<string>());

  const qp = campusId ? `?campusId=${campusId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (token) {
        const res = await fetch(`/api/parent/exam-datesheet?token=${encodeURIComponent(token)}`);
        const j = await res.json();
        if (j.success && j.data) {
          setExams(j.data.exams || []);
          setSchedules(j.data.schedules || {});
        }
      } else {
        const [exRes, calRes] = await Promise.all([
          fetch(`/api/exams${qp}`),
          fetch(`/api/academic/calendar${qp}`).catch(() => null),
        ]);
        const [exJson, calJson] = await Promise.all([
          exRes.json(),
          calRes ? calRes.json().catch(() => null) : Promise.resolve(null),
        ]);
        let list: ExamSheetExam[] = exJson.success ? (exJson.exams || []) : [];
        if (classId) list = list.filter((e) => e.classId === classId);
        setExams(list);
        if (calJson?.success) setWeekends(calJson.data.weekends || []);
      }
    } catch {
      toast.error("Failed to load exam schedule");
    } finally {
      setLoading(false);
    }
  }, [token, classId, qp]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (exams.length > 0 && !selectedExamId) setSelectedExamId(exams[0].id);
  }, [exams, selectedExamId]);

  const visibleExams = useMemo(() => {
    if (!classId && classFilter) return exams.filter((e) => e.classId === classFilter);
    return exams;
  }, [exams, classId, classFilter]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of exams) {
      const label = e.class ? `${e.class.name}${e.class.section ? ` ${e.class.section}` : ""}` : "Unassigned";
      map.set(e.classId, label);
    }
    return [...map.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [exams]);

  useEffect(() => {
    if (token || !selectedExamId || fetchedSheets.current.has(selectedExamId)) return;
    fetchedSheets.current.add(selectedExamId);
    let cancelled = false;
    setLoadingSheet(true);
    fetch(`/api/academic/exam-schedule?examId=${selectedExamId}${qp}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success) {
          setSchedules((prev) => ({ ...prev, [selectedExamId]: j.data || [] }));
        }
      })
      .catch(() => { if (!cancelled) toast.error("Failed to load date sheet"); })
      .finally(() => { if (!cancelled) setLoadingSheet(false); });
    return () => { cancelled = true; };
  }, [selectedExamId, qp, token]);

  const selectedExam = visibleExams.find((e) => e.id === selectedExamId);
  const rawRows = selectedExam ? (schedules[selectedExam.id] || []) : [];
  const grouped: GroupedDay[] = useMemo(() => {
    const map = new Map<string, PaperRow[]>();
    for (const row of rawRows) {
      const key = row.date.slice(0, 10);
      map.set(key, [...(map.get(key) || []), row]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rows]) => ({ date, rows }));
  }, [rawRows]);

  const printRootId = `datesheet-print-${printId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const hasSheets = grouped.length > 0;

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf0fe]">
            <CalendarClock className="h-5 w-5 text-[#8127cf]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#1d1b20] tracking-tight">Exam Date Sheet</h3>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/40">
              {exams.length} exam cycle{exams.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!classId && classOptions.length > 1 && (
            <select
              value={classFilter}
              onChange={(e) => { setClassFilter(e.target.value); setSelectedExamId(""); }}
              className="h-10 cursor-pointer rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
            >
              <option value="">All classes</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          )}
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="h-10 cursor-pointer rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
          >
            <option value="">— Select exam cycle —</option>
            {visibleExams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
                {e.class ? ` (${e.class.name}${e.class.section ? ` ${e.class.section}` : ""})` : ""}
              </option>
            ))}
          </select>
          {hasSheets && (
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-10 items-center gap-2 rounded-xl bg-[#1f1a23] px-4 text-xs font-black uppercase tracking-wider text-white transition-all duration-200 hover:bg-[#2d2833] active:scale-95 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-[#8127cf]/40" />
        </div>
      ) : visibleExams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <CalendarDays className="mb-4 h-12 w-12 text-[#8127cf]/25" />
          <p className="text-sm font-bold text-[#4d4354]/50">
            {classId
              ? "No exam cycles published for your class yet."
              : "No exam cycles published yet. The date sheet will appear here once exams are scheduled."}
          </p>
        </div>
      ) : selectedExam && visibleExams.length > 0 ? (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl bg-[#f6f2fa] p-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">{selectedExam.title}</span>
            <span className="text-[10px] font-bold text-[#4d4354]/50">
              {selectedExam.class ? `${selectedExam.class.name}${selectedExam.class.section ? ` ${selectedExam.class.section}` : ""} · ` : ""}
              {selectedExam.term} · {selectedExam.academicYear}
            </span>
            {weekends.length > 0 && (
              <span className="ml-auto text-[9px] font-bold text-amber-600">
                Off days: {weekends.map((d) => WEEKDAY_LABELS[d]).join(", ")}
              </span>
            )}
          </div>

          {loadingSheet ? (
            <div className="flex items-center justify-center py-14">
              <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]/40" />
            </div>
          ) : !hasSheets ? (
            <div className="flex flex-col items-center justify-center py-14">
              <CalendarDays className="mb-3 h-10 w-10 text-[#8127cf]/20" />
              <p className="text-xs font-bold text-[#4d4354]/45">
                Papers are being scheduled for this exam — check back soon.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ date, rows }) => (
                <div key={date} className="rounded-2xl border border-[#cfc2d6]/15 bg-[#fbf0fe]/25 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-black text-[#8127cf]">{date} · {weekdayLabel(date)}</p>
                    <span className="text-[9px] font-bold text-[#4d4354]/40">{rows.length} paper{rows.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-center gap-2 rounded-xl bg-white p-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#8127cf]/10 text-[10px] font-black text-[#8127cf]">
                          P{row.periodDefinition?.periodNumber || "—"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-[#1f1a23]">{row.subject?.name || "Class-wide paper"}</p>
                          <p className="text-[9px] font-semibold text-[#4d4354]/45">
                            {row.periodDefinition ? `${row.periodDefinition.startTime}–${row.periodDefinition.endTime}` : "Any time"}
                            {row.room ? ` · Room ${row.room.roomNumber}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {hasSheets && (
        <div id={printRootId}>
          <style>{`
            @media screen { #${printRootId} { display: none; } }
            @media print {
              body * { visibility: hidden; }
              #${printRootId}, #${printRootId} * { visibility: visible; }
              #${printRootId} { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
              #${printRootId} h2 { font-size: 16px; font-weight: 800; margin: 0 0 4px; }
              #${printRootId} .meta { font-size: 11px; color: #555; margin-bottom: 16px; }
              #${printRootId} table { width: 100%; border-collapse: collapse; }
              #${printRootId} th, #${printRootId} td { border: 1px solid #ccc; padding: 6px 8px; font-size: 11px; text-align: left; }
              #${printRootId} th { background: #f2eef5; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; }
            }
          `}</style>
          <h2>Date Sheet — {selectedExam?.title}</h2>
          <p className="meta">
            {selectedExam?.class ? `${selectedExam.class.name}${selectedExam.class.section ? ` ${selectedExam.class.section}` : ""} · ` : ""}
            {selectedExam?.term} · {selectedExam?.academicYear}
          </p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Time</th>
                <th>Subject</th>
                <th>Room</th>
              </tr>
            </thead>
            <tbody>
              {grouped.flatMap(({ date, rows }) =>
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{date}</td>
                    <td>{weekdayLabel(date)}</td>
                    <td>{row.periodDefinition ? `${row.periodDefinition.startTime}–${row.periodDefinition.endTime}` : "—"}</td>
                    <td>{row.subject?.name || "Class-wide paper"}</td>
                    <td>{row.room?.roomNumber || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
