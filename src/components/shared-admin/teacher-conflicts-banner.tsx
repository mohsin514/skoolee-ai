"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTeacherAvailability } from "@/components/shared-admin/teacher-picker";

/**
 * Campus-wide roll-up of teacher scheduling problems.
 *
 * Individual pickers warn at the moment of assignment, but nothing surfaced
 * problems that already existed — this makes them impossible to miss. Two
 * distinct issues are reported:
 *   • double-bookings  — the same teacher in two classes at one period
 *   • over-commitment  — one teacher taking every period of >1 whole section
 */
export function TeacherConflictsBanner() {
  const { availability, loading } = useTeacherAvailability();
  const [open, setOpen] = useState(false);

  const { doubleBooked, overCommitted, totalClashes } = useMemo(() => {
    const doubleBooked = availability.filter((t) => t.conflicts.length > 0);
    const overCommitted = availability.filter((t) => t.wholeSectionClasses.length > 1);
    const totalClashes = doubleBooked.reduce((sum, t) => sum + t.conflicts.length, 0);
    return { doubleBooked, overCommitted, totalClashes };
  }, [availability]);

  if (loading || (doubleBooked.length === 0 && overCommitted.length === 0)) return null;

  return (
    <div className="sk-rise mb-5 overflow-hidden rounded-[24px] border border-rose-200/70 bg-gradient-to-br from-rose-50 to-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(190,18,60,0.20)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-rose-50/60"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-[#1f1a23]">Teacher scheduling conflicts</p>
            <p className="mt-0.5 text-[10px] font-bold text-[#4d4354]/60">
              {doubleBooked.length > 0
                ? `${doubleBooked.length} teacher${doubleBooked.length !== 1 ? "s" : ""} double-booked across ${totalClashes} period${totalClashes !== 1 ? "s" : ""}`
                : null}
              {doubleBooked.length > 0 && overCommitted.length > 0 ? " · " : null}
              {overCommitted.length > 0
                ? `${overCommitted.length} taking every period of more than one section`
                : null}
            </p>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-rose-500 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-rose-200/50 p-4">
          {overCommitted.map((t) => (
            <div key={`over-${t.id}`} className="rounded-2xl bg-white p-3">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p className="text-xs font-black text-[#1f1a23]">{t.fullName}</p>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-600">
                  Over-committed
                </span>
              </div>
              <p className="mt-1 pl-5 text-[10px] font-bold leading-relaxed text-[#4d4354]/60">
                Takes every period of {t.wholeSectionClasses.map((c) => c.label).join(", ")} — only one is possible.
              </p>
            </div>
          ))}

          {doubleBooked.map((t) => (
            <div key={`clash-${t.id}`} className="rounded-2xl bg-white p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                <p className="text-xs font-black text-[#1f1a23]">{t.fullName}</p>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-rose-600">
                  {t.conflicts.length} clash{t.conflicts.length !== 1 ? "es" : ""}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
                {t.conflicts.slice(0, 8).map((c) => (
                  <span
                    key={`${t.id}-${c.day}-${c.period}`}
                    title={c.classes.join(" & ")}
                    className="rounded-lg bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-700"
                  >
                    {c.label} · {c.classes.join(" / ")}
                  </span>
                ))}
                {t.conflicts.length > 8 ? (
                  <span className="rounded-lg bg-[#f3f4f9] px-2 py-1 text-[9px] font-black text-[#4d4354]/60">
                    +{t.conflicts.length - 8} more
                  </span>
                ) : null}
              </div>
              <p className="mt-2 pl-5 text-[9px] font-bold text-[#4d4354]/50">
                Fix in Timetable — move one of the clashing periods to a free slot or a different teacher.
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
