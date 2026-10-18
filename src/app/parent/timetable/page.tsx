"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Clock, Lock } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentEmptyState, ParentTimetableSkeleton } from "@/components/parent/parent-components";
import { ErrorState } from "@/components/ui/error-state";
import { ExamDateSheet } from "@/components/timetable/ExamDateSheet";
import { FamilyMeetings } from "@/components/meetings/family-meetings";
import { useParentData } from "../parent-data-context";
import { useUiText } from "@/components/locale/LocaleProvider";

export const dynamic = "force-dynamic";

const DAYS = [
  { num: 1, short: "Mon" }, { num: 2, short: "Tue" }, { num: 3, short: "Wed" },
  { num: 4, short: "Thu" }, { num: 5, short: "Fri" }, { num: 6, short: "Sat" },
];

const COLORS = [
  { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-300" },
  { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300" },
  { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300" },
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300" },
  { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-300" },
  { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-300" },
  { bg: "bg-pink-100", text: "text-pink-700", border: "border-pink-300" },
];

export default function ParentTimetablePage() {
  const tr = useUiText();
  const { token, selectedStudentId, children } = useParentData();
  const meetingChildId = selectedStudentId ?? children[0]?.id ?? null;
  const [timetableData, setTimetableData] = useState<any>(null);
  const [weekendDays, setWeekendDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed load used to fall through to "No timetable published", which
  // told a guardian the school had not published one when it simply had not
  // arrived. "denied" is the portal permission, which a retry cannot change.
  const [loadError, setLoadError] = useState<"failed" | "denied" | null>(null);

  const loadTimetable = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      // Follow the child switcher, or a sibling's timetable would keep
      // showing the default child's schedule.
      if (selectedStudentId) params.set("studentId", selectedStudentId);
      const res = await fetch(`/api/parent/timetable?${params}`);
      const json = await res.json();
      if (json.success) {
        setTimetableData(json.data);
        setWeekendDays(json.data?.weekends || []);
      } else {
        setLoadError(res.status === 403 ? "denied" : "failed");
      }
    } catch {
      setLoadError("failed");
      toast.error(tr("Could not load the timetable. Please try again."));
    }
    setLoading(false);
  }, [token, selectedStudentId, tr]);

  // Only render the campus's working days so a 5-day calendar hides Saturday.
  const visibleDays = DAYS.filter((d) => !weekendDays.includes(d.num));

  useEffect(() => { loadTimetable(); }, [loadTimetable]);

  const slots = timetableData?.slots || [];

  const subjectNames = useMemo(
    () => [...new Set<string>(slots.filter((s: any) => s.subject).map((s: any) => s.subject.name))],
    [slots],
  );

  const colorMap = useMemo(() => {
    const m = new Map<string, typeof COLORS[0]>();
    subjectNames.forEach((n, i) => m.set(n, COLORS[i % COLORS.length]));
    return m;
  }, [subjectNames]);

  const periods = useMemo(
    () =>
      slots.length
        ? [...new Map(slots.map((s: any) => [Number(s.periodNumber), { num: Number(s.periodNumber), start: s.startTime, end: s.endTime, type: s.slotType }])).values()].sort((a: any, b: any) => a.num - b.num)
        : [],
    [slots],
  );

  const slotIndex = useMemo(() => {
    const idx = new Map<string, any>();
    for (const s of slots) idx.set(`${Number(s.dayOfWeek)}-${Number(s.periodNumber)}`, s);
    return idx;
  }, [slots]);

  const getSlot = useCallback(
    (day: number, period: number) => slotIndex.get(`${day}-${period}`),
    [slotIndex],
  );

  const hasTable = slots.length > 0;

  return (
    <ParentPage
      tone="timetable"
      icon={Clock}
      eyebrow={<>{timetableData ? tr("{0} periods · {1}", [periods.length, visibleDays.map((d) => tr(d.short)).join("-")]) : tr("Weekly class schedule")}</>}
      title={tr("Timetable")}
      summary={tr("Your child’s weekly class schedule.")}
    >
      <div className="space-y-3">
        {loading ? (
          <ParentTimetableSkeleton weekendDays={weekendDays} />
        ) : loadError === "denied" ? (
          <ParentEmptyState icon={Lock} title={tr("Timetable not shared")} description={tr("The school has not shared the timetable with this account. Contact the school office if you need it.")} />
        ) : loadError ? (
          <div className="sk-panel">
            <ErrorState onRetry={loadTimetable} />
          </div>
        ) : hasTable ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {subjectNames.map((name) => {
                const c = colorMap.get(name);
                return (
                  <span key={name} className={`inline-flex max-w-full items-center rounded-full border ${c?.border} ${c?.bg} px-2.5 py-1`}>
                    <span className={`text-2xs font-semibold ${c?.text} [overflow-wrap:anywhere]`}>{name}</span>
                  </span>
                );
              })}
            </div>
            <div className="sk-panel sk-rise overflow-x-auto" style={{ animationDelay: "80ms" }}>
              <div className="min-w-[700px]">
                <div className="grid border-b border-muted" style={{ gridTemplateColumns: `60px repeat(${visibleDays.length}, 1fr)` }}>
                  <div className="flex items-center justify-center p-2">
                    <Clock aria-hidden="true" className="h-3.5 w-3.5 text-ink-subtle" />
                  </div>
                  {visibleDays.map((d) => (
                    <div key={d.num} className="flex items-center justify-center border-s border-muted py-2.5">
                      <span className="sk-eyebrow">{tr(d.short)}</span>
                    </div>
                  ))}
                </div>
                {periods.map((p: any) => {
                  const isSpecial = p.type !== "CLASS";
                  return (
                    <div key={p.num} className={`grid border-b border-muted last:border-b-0 ${isSpecial ? "bg-muted/50" : ""}`} style={{ gridTemplateColumns: `60px repeat(${visibleDays.length}, 1fr)` }}>
                      <div className="flex flex-col items-center justify-center border-e border-muted p-1">
                        <span className="text-2xs font-bold tabular-nums text-primary">{tr("P{0}", [p.num])}</span>
                        <span className="text-2xs font-medium tabular-nums text-ink-subtle" dir="ltr">{p.start}</span>
                      </div>
                      {visibleDays.map((d) => {
                        const slot = getSlot(d.num, p.num);
                        if (!slot || slot.slotType !== "CLASS") {
                          const label = slot?.slotType === "BREAK" ? tr("Break") : slot?.slotType === "PRAYER" ? tr("Prayer") : slot?.slotType === "ASSEMBLY" ? tr("Assembly") : slot?.slotType || "";
                          return (
                            <div key={d.num} className="flex items-center justify-center border-s border-muted p-0.5">
                              <span className="text-2xs font-semibold text-ink-subtle">{label}</span>
                            </div>
                          );
                        }
                        const c = slot.subject ? colorMap.get(slot.subject.name) : null;
                        return (
                          <div key={d.num} className="border-s border-muted p-0.5">
                            {slot.subject ? (
                              <div className={`h-full rounded-lg ${c?.bg} ${c?.border} border p-1.5`}>
                                <p className={`text-2xs font-semibold leading-tight ${c?.text} [overflow-wrap:anywhere]`}>{slot.subject.name}</p>
                                {slot.teacher && <p className="mt-0.5 text-2xs font-medium leading-tight text-ink-subtle [overflow-wrap:anywhere]">{slot.teacher.fullName}</p>}
                              </div>
                            ) : (
                              <div className="flex h-full items-center justify-center"><span aria-hidden="true" className="text-2xs text-ink-faint">—</span></div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <ParentEmptyState icon={Clock} title={tr("No timetable published")} description={tr("The class timetable will appear here once published by the school.")} />
        )}
        <ExamDateSheet token={token || undefined} />
        {/* SKO-420: book a teacher meeting (signed-in guardians; a link cannot book). */}
        {!token && meetingChildId ? <div className="mt-6"><FamilyMeetings key={meetingChildId} studentId={meetingChildId} /></div> : null}
      </div>
    </ParentPage>
  );
}
