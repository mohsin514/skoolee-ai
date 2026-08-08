"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, Ban, Search, Sparkles, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickerTeacher {
  id: string;
  fullName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
  taughtSubjects?: { id: string }[];
  ledClasses?: { id: string; section?: string | null }[];
  _count?: { taughtSubjects?: number; ledClasses?: number };
}

export interface TeacherAvailability {
  id: string;
  fullName: string | null;
  email: string | null;
  profileImageUrl: string | null;
  subjectSpecialties: string[];
  teachesAllSubjects: boolean;
  wholeSectionClasses: { id: string; label: string }[];
  subjectCount: number;
  classCount: number;
  busySlots: string[];
  conflicts: { day: number; period: number; label: string; classes: string[] }[];
}

/** Fetches campus-wide teacher load/clash data once per mount. */
export function useTeacherAvailability(enabled = true) {
  const [availability, setAvailability] = useState<TeacherAvailability[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await fetch("/api/teachers/availability");
      const json = await res.json();
      if (json.success) setAvailability(json.data || []);
    } catch {
      /* availability is an enhancement — the picker still works without it */
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { availability, loading, refresh };
}

function teacherAvatar(teacher: { fullName?: string | null; email?: string | null; id: string; profileImageUrl?: string | null }) {
  const seed = teacher.fullName || teacher.email || teacher.id;
  return teacher.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`;
}

/** Case-insensitive check that a teacher is qualified for a given subject. */
function matchesSpecialty(a: TeacherAvailability | undefined, subjectName?: string) {
  if (!a || !subjectName) return true;
  if (a.teachesAllSubjects) return true;
  if (a.subjectSpecialties.length === 0) return true; // unknown, don't nag
  return a.subjectSpecialties.some((s) => s.trim().toLowerCase() === subjectName.trim().toLowerCase());
}

export function TeacherPicker({
  label = "Teacher",
  value,
  teachers,
  onChange,
  allowUnassigned = true,
  showUnassignedHint = true,
  availability,
  /** "homeroom" hard-blocks teachers already committed to another whole
   *  section; "subject" never blocks by count and only flags real clashes. */
  assignmentMode = "subject",
  currentClassId,
  subjectName,
}: {
  label?: string;
  value: string;
  teachers: PickerTeacher[];
  onChange: (teacherId: string) => void;
  allowUnassigned?: boolean;
  showUnassignedHint?: boolean;
  availability?: TeacherAvailability[];
  assignmentMode?: "homeroom" | "subject";
  currentClassId?: string;
  subjectName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = teachers.find((t) => t.id === value);

  const availById = useMemo(() => {
    const m = new Map<string, TeacherAvailability>();
    (availability || []).forEach((a) => m.set(a.id, a));
    return m;
  }, [availability]);

  const subjectLoad = (t: PickerTeacher) =>
    availById.get(t.id)?.subjectCount ?? t._count?.taughtSubjects ?? t.taughtSubjects?.length ?? 0;
  const classLoad = (t: PickerTeacher) =>
    availById.get(t.id)?.classCount ?? t._count?.ledClasses ?? t.ledClasses?.length ?? 0;

  /**
   * A teacher who already takes every period of another section physically
   * cannot take a second one, so that case is blocked outright. Teaching the
   * same subject across several sections is normal, so subject assignment is
   * never blocked on counts — only genuine timetable clashes are surfaced.
   */
  const blockReason = (t: PickerTeacher): string | null => {
    if (assignmentMode !== "homeroom") return null;
    const a = availById.get(t.id);
    if (!a) return null;
    const elsewhere = a.wholeSectionClasses.filter((c) => c.id !== currentClassId);
    if (elsewhere.length === 0) return null;
    return `Already takes every period of ${elsewhere.map((c) => c.label).join(", ")}`;
  };

  const filtered = useMemo(() => {
    const list = teachers.filter((t) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const a = availById.get(t.id);
      return (
        t.fullName?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        (a?.subjectSpecialties || []).some((s) => s.toLowerCase().includes(q))
      );
    });
    // Surface qualified, unblocked teachers first.
    return list.sort((x, y) => {
      const bx = blockReason(x) ? 1 : 0;
      const by = blockReason(y) ? 1 : 0;
      if (bx !== by) return bx - by;
      const mx = matchesSpecialty(availById.get(x.id), subjectName) ? 0 : 1;
      const my = matchesSpecialty(availById.get(y.id), subjectName) ? 0 : 1;
      if (mx !== my) return mx - my;
      return (x.fullName || "").localeCompare(y.fullName || "");
    });
  }, [teachers, query, availById, subjectName, assignmentMode, currentClassId]);

  const pick = (teacherId: string) => {
    onChange(teacherId);
    setOpen(false);
    setQuery("");
  };

  const selectedAvail = selected ? availById.get(selected.id) : undefined;
  const selectedOffSpecialty = selected && !matchesSpecialty(selectedAvail, subjectName);

  return (
    <div className="group/picker">
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 transition-colors duration-200 group-focus-within/picker:text-[#8127cf]">
        {label}
      </span>

      {open ? (
        <div className="relative z-20 rounded-2xl border border-[#8127cf]/30 bg-white shadow-[0_20px_50px_rgba(31,26,35,0.14)] transition-all">
          <div className="flex items-center gap-2 border-b border-[#cfc2d6]/15 px-3 py-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#8127cf]" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or subject…"
              className="h-8 w-full bg-transparent text-xs font-bold text-[#1f1a23] outline-none placeholder:text-[#4d4354]/35"
            />
          </div>
          <div className="max-h-64 overflow-y-auto custom-scrollbar p-1.5">
            {allowUnassigned ? (
              <button
                type="button"
                onClick={() => pick("")}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                  value === "" ? "bg-[#fbf0fe]" : "hover:bg-[#fbf0fe]/60"
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f9] text-[#4d4354]/50">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-[#1f1a23]">Unassigned</p>
                  {showUnassignedHint ? (
                    <p className="mt-0.5 text-[9px] font-bold text-[#4d4354]/45">No teacher assigned yet</p>
                  ) : null}
                </div>
              </button>
            ) : null}

            {filtered.map((t) => {
              const a = availById.get(t.id);
              const blocked = blockReason(t);
              const offSpecialty = !matchesSpecialty(a, subjectName);
              const conflictCount = a?.conflicts.length || 0;
              const specialtyLabel = a?.teachesAllSubjects
                ? "All subjects"
                : a?.subjectSpecialties.length
                  ? a.subjectSpecialties.slice(0, 2).join(", ") + (a.subjectSpecialties.length > 2 ? ` +${a.subjectSpecialties.length - 2}` : "")
                  : null;

              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={!!blocked}
                  title={blocked || undefined}
                  onClick={() => pick(t.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    blocked
                      ? "cursor-not-allowed opacity-55"
                      : value === t.id
                        ? "cursor-pointer bg-[#fbf0fe]"
                        : "cursor-pointer hover:bg-[#fbf0fe]/60"
                  )}
                >
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-[#cfc2d6]/20 bg-white">
                    <img src={teacherAvatar({ ...t, id: t.id })} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-black text-[#1f1a23]">{t.fullName || "Unnamed teacher"}</p>
                      {specialtyLabel ? (
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider",
                            a?.teachesAllSubjects ? "bg-emerald-50 text-emerald-600" : "bg-[#fbf0fe] text-[#8127cf]"
                          )}
                        >
                          {a?.teachesAllSubjects ? <Sparkles className="h-2 w-2" /> : null}
                          {specialtyLabel}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[9px] font-bold text-[#4d4354]/50">
                      {subjectLoad(t)} subject{subjectLoad(t) !== 1 ? "s" : ""} · {classLoad(t)} class{classLoad(t) !== 1 ? "es" : ""}
                    </p>

                    {blocked ? (
                      <p className="mt-1 flex items-start gap-1 text-[9px] font-black leading-snug text-rose-600">
                        <Ban className="mt-px h-2.5 w-2.5 shrink-0" />
                        {blocked}
                      </p>
                    ) : null}
                    {!blocked && conflictCount > 0 ? (
                      <p className="mt-1 flex items-start gap-1 text-[9px] font-black leading-snug text-rose-600">
                        <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" />
                        {conflictCount} timetable clash{conflictCount !== 1 ? "es" : ""} ({a!.conflicts.slice(0, 2).map((c) => c.label).join(", ")}
                        {conflictCount > 2 ? "…" : ""})
                      </p>
                    ) : null}
                    {!blocked && offSpecialty ? (
                      <p className="mt-1 flex items-start gap-1 text-[9px] font-black leading-snug text-amber-600">
                        <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" />
                        Not their specialty{subjectName ? ` (${subjectName})` : ""}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[10px] font-bold text-[#4d4354]/45">No teachers match your search.</p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-14 w-full cursor-pointer items-center justify-between rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 text-left transition-all duration-200 hover:border-[#cfc2d6]/40 focus:border-[#8127cf]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
          >
            {value ? (
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-[#cfc2d6]/20 bg-white">
                  {selected ? <img src={teacherAvatar({ ...selected, id: selected.id })} alt="" className="h-full w-full object-cover" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-[#1f1a23]">{selected?.fullName || "Assigned teacher"}</span>
                  {selected ? (
                    <span className="block text-[9px] font-bold text-[#4d4354]/50">
                      {subjectLoad(selected)} subjects · {classLoad(selected)} classes
                      {selectedAvail?.teachesAllSubjects
                        ? " · All subjects"
                        : selectedAvail?.subjectSpecialties.length
                          ? ` · ${selectedAvail.subjectSpecialties.slice(0, 2).join(", ")}`
                          : ""}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : (
              <span className="text-sm font-bold text-[#4d4354]/55">{allowUnassigned ? "Assign / Unassigned" : "Select teacher"}</span>
            )}
            <span className="ml-3 shrink-0 rounded-lg bg-[#8127cf]/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-[#8127cf]">
              Change
            </span>
          </button>

          {/* Warnings on the current selection stay visible while collapsed, so
              an existing bad assignment isn't hidden behind a closed dropdown. */}
          {selectedAvail && selectedAvail.conflicts.length > 0 ? (
            <p className="mt-1.5 flex items-start gap-1 pl-2 text-[9px] font-black leading-snug text-rose-600">
              <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" />
              Double-booked at {selectedAvail.conflicts.slice(0, 3).map((c) => c.label).join(", ")}
              {selectedAvail.conflicts.length > 3 ? ` +${selectedAvail.conflicts.length - 3} more` : ""}
            </p>
          ) : null}
          {selectedOffSpecialty ? (
            <p className="mt-1.5 flex items-start gap-1 pl-2 text-[9px] font-black leading-snug text-amber-600">
              <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" />
              {selected?.fullName} isn&apos;t a {subjectName} specialist
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Small badge used outside the picker (e.g. subject rows) to show specialty. */
export function SpecialtyBadge({ availability }: { availability?: TeacherAvailability }) {
  if (!availability) return null;
  if (availability.teachesAllSubjects) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-600">
        <Sparkles className="h-2 w-2" />
        All subjects
      </span>
    );
  }
  if (!availability.subjectSpecialties.length) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#fbf0fe] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#8127cf]">
      <BookOpen className="h-2 w-2" />
      {availability.subjectSpecialties.slice(0, 2).join(", ")}
      {availability.subjectSpecialties.length > 2 ? ` +${availability.subjectSpecialties.length - 2}` : ""}
    </span>
  );
}
