"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentEmptyState } from "@/components/parent/parent-components";
import { ExamDateSheet } from "@/components/timetable/ExamDateSheet";
import { useParentData } from "../parent-data-context";

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
  const { token, selectedStudentId } = useParentData();
  const [timetableData, setTimetableData] = useState<any>(null);
  const [weekendDays, setWeekendDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTimetable = useCallback(async () => {
    setLoading(true);
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
      }
    } catch { toast.error("Failed to load timetable"); }
    setLoading(false);
  }, [token, selectedStudentId]);

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
      eyebrow={<>{timetableData ? `${periods.length} periods · ${visibleDays.map((d) => d.short).join("-")}` : "Weekly class schedule"}</>}
      title="Timetable"
      summary={<>"Your child\u2019s weekly class schedule."</>}
    >
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="h-10 w-10 rounded-2xl bg-[#fbf0fe] animate-pulse" />
          </div>
        ) : hasTable ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {subjectNames.map((name) => {
                const c = colorMap.get(name);
                return (
                  <span key={name} className={`flex items-center gap-1 rounded-lg ${c?.bg} px-2 py-1`}>
                    <span className={`text-[8px] font-black ${c?.text}`}>{name}</span>
                  </span>
                );
              })}
            </div>
            <div className="sk-rise overflow-x-auto rounded-[24px] border border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "80ms" }}>
              <div className="min-w-[700px]">
                <div className="grid border-b border-[#f3f4f9]" style={{ gridTemplateColumns: `60px repeat(${visibleDays.length}, 1fr)` }}>
                  <div className="flex items-center justify-center p-2">
                    <Clock className="w-3 h-3 text-ink-subtle" />
                  </div>
                  {visibleDays.map((d) => (
                    <div key={d.num} className="flex items-center justify-center py-2 border-l border-[#f3f4f9]">
                      <span className="text-[8px] font-black uppercase text-ink-subtle">{d.short}</span>
                    </div>
                  ))}
                </div>
                {periods.map((p: any) => {
                  const isSpecial = p.type !== "CLASS";
                  return (
                    <div key={p.num} className={`grid border-b border-[#f3f4f9] last:border-b-0 ${isSpecial ? "bg-[#f3f4f9]/50" : ""}`} style={{ gridTemplateColumns: `60px repeat(${visibleDays.length}, 1fr)` }}>
                      <div className="flex flex-col items-center justify-center p-1 border-r border-[#f3f4f9]">
                        <span className="text-[8px] font-black text-[#8127cf]">P{p.num}</span>
                        <span className="text-[6px] font-bold text-ink-subtle">{p.start}</span>
                      </div>
                      {visibleDays.map((d) => {
                        const slot = getSlot(d.num, p.num);
                        if (!slot || slot.slotType !== "CLASS") {
                          const label = slot?.slotType === "BREAK" ? "Break" : slot?.slotType === "PRAYER" ? "Prayer" : slot?.slotType === "ASSEMBLY" ? "Assembly" : slot?.slotType || "";
                          return (
                            <div key={d.num} className="border-l border-[#f3f4f9] flex items-center justify-center p-0.5">
                              <span className="text-[7px] font-bold text-ink-subtle">{label}</span>
                            </div>
                          );
                        }
                        const c = slot.subject ? colorMap.get(slot.subject.name) : null;
                        return (
                          <div key={d.num} className="border-l border-[#f3f4f9] p-0.5">
                            {slot.subject ? (
                              <div className={`h-full rounded-lg ${c?.bg} ${c?.border} border p-1`}>
                                <p className={`text-[8px] font-black ${c?.text} leading-tight`}>{slot.subject.name}</p>
                                {slot.teacher && <p className="text-[6px] font-semibold text-ink-subtle mt-0.5">{slot.teacher.fullName}</p>}
                              </div>
                            ) : (
                              <div className="h-full flex items-center justify-center"><span className="text-[7px] text-ink-subtle">—</span></div>
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
          <ParentEmptyState icon={Clock} title="No timetable published" description="The class timetable will appear here once published by the school." />
        )}
        <ExamDateSheet token={token || undefined} />
      </div>
    </ParentPage>
  );
}
