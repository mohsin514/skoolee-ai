"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { CalendarClock, CalendarDays, Download, Printer } from "lucide-react";
import { SkeletonList } from "@/components/ui/skeleton";
import { Select as SystemSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";

/** ISO weekday (1 = Monday … 7 = Sunday) → its short name in the viewer's language (R7: dates through Intl). */
function weekdayName(isoDay: number, language: string): string {
  // 2024-01-01 was a Monday, so day n of that week is 2024-01-0n.
  const date = new Date(Date.UTC(2024, 0, isoDay));
  try {
    return new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" }).format(date);
  } catch {
    return ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][isoDay] ?? "";
  }
}

function weekdayLabel(dateStr: string, language: string): string {
  const day = new Date(dateStr + "T00:00:00").getDay();
  return weekdayName(day === 0 ? 7 : day, language);
}

function dateLabel(dateStr: string, language: string): string {
  try {
    return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(new Date(dateStr + "T00:00:00"));
  } catch {
    return dateStr;
  }
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

/**
 * The exam date sheet for staff, learners and families.
 *
 * - `classId` limits it to one class (a learner's own class); `studentId` limits a family to one child (the
 *   server only answers for a child the guardian may see), so a parent with several children sees the selected
 *   child's exams, not every class in the family.
 * - Download: the panel offers "Download" (CSV of the chosen exam's papers) beside Print. A host that puts
 *   "Download date sheet" in its PageHeader passes `downloadRequest` (each new number downloads once; the panel then
 *   drops its own Download button) and reads `onDownloadState(available)` to enable its button.
 * - Load failures (the exam list or one exam's papers) are an inline ErrorState with Retry, never a toast (R4).
 */
export function ExamDateSheet({
  classId,
  studentId,
  token,
  campusId,
  downloadRequest,
  onDownloadState,
}: {
  classId?: string;
  studentId?: string;
  token?: string;
  campusId?: string;
  downloadRequest?: number;
  onDownloadState?: (available: boolean) => void;
}) {
  const ui = useUiText();
  const { language } = useLocale();
  const printId = useId();
  // R4: a failed load is an inline ErrorState with retry, not a toast over an empty card.
  const [loadFailed, setLoadFailed] = useState(false);
  const [exams, setExams] = useState<ExamSheetExam[]>([]);
  const [schedules, setSchedules] = useState<Record<string, PaperRow[]>>({});
  const [selectedExamId, setSelectedExamId] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [weekends, setWeekends] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExam, setLoadingExam] = useState<string | null>(null);
  // The exam whose papers failed to load (inline ErrorState + Retry); a retry bumps `sheetAttempt`.
  const [sheetFailed, setSheetFailed] = useState<string | null>(null);
  const [sheetAttempt, setSheetAttempt] = useState(0);
  const fetchedSheets = useRef(new Set<string>());

  const qp = campusId ? `?campusId=${campusId}` : "";
  const examsQuery = useMemo(() => {
    const sp = new URLSearchParams();
    if (campusId) sp.set("campusId", campusId);
    if (studentId) sp.set("studentId", studentId);
    const text = sp.toString();
    return text ? `?${text}` : "";
  }, [campusId, studentId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
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
          fetch(`/api/exams${examsQuery}`),
          fetch(`/api/academic/calendar${qp}`).catch(() => null),
        ]);
        const [exJson, calJson] = await Promise.all([
          exRes.json(),
          calRes ? calRes.json().catch(() => null) : Promise.resolve(null),
        ]);
        if (!exRes.ok || !exJson?.success) throw new Error("exams");
        let list: ExamSheetExam[] = exJson.exams || [];
        if (classId) list = list.filter((e) => e.classId === classId);
        setExams(list);
        if (calJson?.success) setWeekends(calJson.data.weekends || []);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [token, classId, qp, examsQuery]);

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
      const label = e.class ? `${e.class.name}${e.class.section ? ` ${e.class.section}` : ""}` : ui("Unassigned");
      map.set(e.classId, label);
    }
    return [...map.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [exams, ui]);

  useEffect(() => {
    if (token || !selectedExamId || fetchedSheets.current.has(selectedExamId)) return;
    fetchedSheets.current.add(selectedExamId);
    let cancelled = false;
    const examId = selectedExamId;
    const params = new URLSearchParams({ examId });
    if (campusId) params.set("campusId", campusId);
    setLoadingExam(examId);
    setSheetFailed((current) => (current === examId ? null : current));
    fetch(`/api/academic/exam-schedule?${params.toString()}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j?.success) throw new Error("schedule");
        // Stored even when the viewer has moved on, so returning to this exam needs no second request.
        setSchedules((prev) => ({ ...prev, [examId]: j.data || [] }));
      })
      .catch(() => {
        // Not cached, so Retry (or choosing the exam again) asks again.
        fetchedSheets.current.delete(examId);
        if (!cancelled) setSheetFailed(examId);
      })
      .finally(() => setLoadingExam((current) => (current === examId ? null : current)));
    return () => { cancelled = true; };
  }, [selectedExamId, campusId, token, sheetAttempt]);

  const selectedExam = visibleExams.find((e) => e.id === selectedExamId);
  const loadingSheet = Boolean(selectedExamId) && loadingExam === selectedExamId;
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
  const classLabel = (exam?: ExamSheetExam) => exam?.class ? `${exam.class.name}${exam.class.section ? ` ${exam.class.section}` : ""}` : "";

  // CSV of the chosen exam's papers (Excel-safe: BOM, quoted cells), headers in the viewer's language.
  const download = () => {
    if (!selectedExam || !hasSheets) { toast.info(ui("Choose an exam whose papers are scheduled first.")); return; }
    const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = [ui("Date"), ui("Day"), ui("Start"), ui("End"), ui("Subject"), ui("Room")];
    const lines = grouped.flatMap(({ date, rows }) => rows.map((row) => [
      date,
      weekdayLabel(date, language),
      row.periodDefinition?.startTime ?? "",
      row.periodDefinition?.endTime ?? "",
      row.subject?.name || ui("Class-wide paper"),
      row.room?.roomNumber ?? "",
    ].map(cell).join(",")));
    const title = [selectedExam.title, classLabel(selectedExam), selectedExam.term, String(selectedExam.academicYear)].filter(Boolean).join(" · ");
    const blob = new Blob([`\uFEFF${[cell(title), header.map(cell).join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `date-sheet-${selectedExam.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || selectedExam.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  // Host-owned "Download date sheet": each new number downloads once (seeded so a remount never replays it).
  const handledDownload = useRef(downloadRequest);
  useEffect(() => {
    if (downloadRequest === undefined || handledDownload.current === downloadRequest) return;
    handledDownload.current = downloadRequest;
    download();
    // Only a new number downloads; it reads the sheet on screen at that moment.
  }, [downloadRequest]);
  const downloadListener = useRef(onDownloadState);
  useEffect(() => { downloadListener.current = onDownloadState; });
  const downloadable = hasSheets && !loadingSheet;
  useEffect(() => { downloadListener.current?.(downloadable); }, [downloadable]);

  return (
    <div className="sk-panel sk-rise p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-ink-strong tracking-tight">{ui("Exam date sheet")}</h3>
            <p className="text-xs font-semibold text-ink-subtle">
              {ui(exams.length === 1 ? "{0} exam" : "{0} exams", [exams.length])}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!classId && classOptions.length > 1 && (
            <SystemSelect
              value={classFilter}
              onChange={(e) => { setClassFilter(e.target.value); setSelectedExamId(""); }}
              className="px-3"
              aria-label={ui("Class")}
            >
              <option value="">{ui("All classes")}</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </SystemSelect>
          )}
          <SystemSelect
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="px-3"
            aria-label={ui("Exam")}
          >
            <option value="">{ui("Choose an exam")}</option>
            {visibleExams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
                {e.class ? ` (${e.class.name}${e.class.section ? ` ${e.class.section}` : ""})` : ""}
              </option>
            ))}
          </SystemSelect>
          {hasSheets && (
            <Button variant="outline" size="sm"
              type="button"
              onClick={() => window.print()}
              className="flex justify-start items-center gap-2"
            >
              <Printer aria-hidden="true" className="h-4 w-4" />
              {ui("Print")}
            </Button>
          )}
          {hasSheets && downloadRequest === undefined && (
            <Button variant="outline" size="sm" type="button" onClick={download} className="flex justify-start items-center gap-2">
              <Download aria-hidden="true" className="h-4 w-4" />
              {ui("Download")}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={3} label={ui("Loading exams")} />
      ) : loadFailed ? (
        <ErrorState title={ui("The exam schedule could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void load()} />
      ) : visibleExams.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={ui("No exams published yet")}
          description={ui(classId
            ? "The date sheet appears here once your class's exams are scheduled."
            : "The date sheet appears here once exams are scheduled.")}
        />
      ) : selectedExam && visibleExams.length > 0 ? (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl bg-surface-sunken p-3">
            <bdi className="text-xs font-semibold text-primary">{selectedExam.title}</bdi>
            <span className="text-2xs font-bold text-ink-muted">
              {selectedExam.class ? <><bdi>{`${selectedExam.class.name}${selectedExam.class.section ? ` ${selectedExam.class.section}` : ""}`}</bdi>{" · "}</> : null}
              {selectedExam.term} · {selectedExam.academicYear}
            </span>
            {weekends.length > 0 && (
              <Badge variant="warning" size="sm" dot className="ms-auto">
                {ui("Off days: {0}", [weekends.map((d) => weekdayName(d, language)).join(", ")])}
              </Badge>
            )}
          </div>

          {loadingSheet ? (
            <SkeletonList rows={4} label={ui("Loading date sheet")} />
          ) : sheetFailed === selectedExam.id ? (
            <ErrorState
              title={ui("The date sheet could not be loaded")}
              description={ui("Check your connection and try again.")}
              onRetry={() => { setSheetFailed(null); setSheetAttempt((n) => n + 1); }}
            />
          ) : !hasSheets ? (
            <EmptyState
              size="sm"
              icon={CalendarDays}
              title={ui("Papers are being scheduled")}
              description={ui("Papers are being scheduled for this exam — check back soon.")}
            />
          ) : (
            <div className="space-y-4">
              {grouped.map(({ date, rows }) => (
                <div key={date} className="rounded-2xl border border-edge/15 bg-brand-50/25 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-primary">{dateLabel(date, language)} · {weekdayLabel(date, language)}</p>
                    <span className="text-2xs font-bold text-ink-subtle">{ui(rows.length === 1 ? "{0} paper" : "{0} papers", [rows.length])}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-center gap-2 rounded-xl bg-card p-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-2xs font-bold text-primary" title={row.periodDefinition ? ui("Period {0}", [row.periodDefinition.periodNumber]) : undefined}>
                          {row.periodDefinition?.periodNumber ? ui("P{0}", [row.periodDefinition.periodNumber]) : "—"}
                        </span>
                        <div className="min-w-0">
                          <bdi className="block truncate text-xs font-bold text-ink-strong">{row.subject?.name || ui("Class-wide paper")}</bdi>
                          <p className="text-2xs font-semibold text-ink-subtle">
                            {row.periodDefinition ? <bdi dir="ltr">{row.periodDefinition.startTime}–{row.periodDefinition.endTime}</bdi> : ui("Any time")}
                            {row.room ? ` · ${ui("Room {0}", [row.room.roomNumber])}` : ""}
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
              #${printRootId} th, #${printRootId} td { border: 1px solid #ccc; padding: 6px 8px; font-size: 11px; text-align: start; }
              #${printRootId} th { background: #f2eef5; font-size: 10px; }
            }
          `}</style>
          <h2>{ui("Date sheet — {0}", [selectedExam?.title ?? ""])}</h2>
          <p className="meta">
            {selectedExam?.class ? `${selectedExam.class.name}${selectedExam.class.section ? ` ${selectedExam.class.section}` : ""} · ` : ""}
            {selectedExam?.term} · {selectedExam?.academicYear}
          </p>
          <table>
            <thead>
              <tr>
                <th>{ui("Date")}</th>
                <th>{ui("Day")}</th>
                <th>{ui("Time")}</th>
                <th>{ui("Subject")}</th>
                <th>{ui("Room")}</th>
              </tr>
            </thead>
            <tbody>
              {grouped.flatMap(({ date, rows }) =>
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{dateLabel(date, language)}</td>
                    <td>{weekdayLabel(date, language)}</td>
                    <td>{row.periodDefinition ? `${row.periodDefinition.startTime}–${row.periodDefinition.endTime}` : "—"}</td>
                    <td>{row.subject?.name || ui("Class-wide paper")}</td>
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
