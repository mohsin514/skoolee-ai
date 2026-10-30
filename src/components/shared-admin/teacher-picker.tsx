"use client";
import { Button as SystemButton } from "@/components/ui/button";
import { InputGroup } from "@/components/ui/input-group";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { AlertTriangle, Ban, Search, Sparkles, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarImage } from "@/components/ui/avatar-image";
import { Input as SystemInput } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";

import { checkedListJson, readRequest } from "@/lib/http/request-state";
import { specialtyMatches } from "@/lib/academic/teacher-load";

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
  weeklyPeriods?: number;
  weeklyCapacity?: number | null;
}

/**
 * Fetches campus-wide teacher load/clash data once per mount. The data only enriches the pickers (clash and
 * specialty hints), so a failure is reported through `failed` for an inline note — never a toast (R4): several
 * pickers mount at once and each would have raised its own.
 */
export function useTeacherAvailability(enabled = true) {
  const [availability, setAvailability] = useState<TeacherAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const version = ++sequence.current;
    setLoading(true); setFailed(false);
    try {
      const json = await checkedListJson(await readRequest("/api/teachers/availability"));
      if (version !== sequence.current) return;
      setAvailability(json.data);
    } catch {
      if (version === sequence.current) { setAvailability([]); setFailed(true); }
    } finally { if (version === sequence.current) setLoading(false); }
  }, [enabled]);

  useEffect(() => { void refresh(); return () => { sequence.current++; }; }, [refresh]);

  return { availability, loading, failed, refresh };
}

function teacherAvatar(teacher: { fullName?: string | null; email?: string | null; id: string; profileImageUrl?: string | null }) {
  const seed = teacher.fullName || teacher.email || teacher.id;
  return teacher.profileImageUrl;
}

/** Case-insensitive check that a teacher is qualified for a given subject (shared with the server, SKAI-150). */
const matchesSpecialty = specialtyMatches;

/** SKAI-150: a teacher whose booked periods already fill the campus week. */
function atLoadLimit(a: TeacherAvailability | undefined) {
  return !!a && a.weeklyCapacity != null && (a.weeklyPeriods ?? 0) >= a.weeklyCapacity;
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
  initialOpen = false,
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
  /** Start with the search list open (used where the picker is already behind its own toggle). */
  initialOpen?: boolean;
}) {
  const ui = useUiText();
  const [open, setOpen] = useState(initialOpen);
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
    return ui("Already takes every period of {0}", [elsewhere.map((c) => c.label).join(", ")]);
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
      <span className="mb-2 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle transition-colors duration-200 group-focus-within/picker:text-primary">
        {ui(label)}
      </span>

      {open ? (
        <div className="relative z-20 rounded-2xl border border-primary/30 bg-card shadow-xl transition-all">
          <InputGroup className="my-2">
            <Search data-field-affix="start" className="h-3.5 w-3.5 shrink-0 text-primary" />
            <SystemInput
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ui("Search by name or subject…")}
              aria-label={ui("Search teachers")}
              className="w-full"
            />
          </InputGroup>
          <div className="max-h-64 overflow-y-auto custom-scrollbar p-1.5">
            {allowUnassigned ? (
              <SystemButton variant="ghost"
                type="button"
                onClick={() => pick("")}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-start justify-start",
                  value === "" ? "bg-brand-50" : "hover:bg-brand-50/60"
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-ink-muted">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink-strong">{ui("Unassigned")}</p>
                  {showUnassignedHint ? (
                    <p className="mt-0.5 text-2xs font-medium text-ink-subtle">{ui("No teacher assigned yet")}</p>
                  ) : null}
                </div>
              </SystemButton>
            ) : null}

            {filtered.map((t) => {
              const a = availById.get(t.id);
              const blocked = blockReason(t);
              const offSpecialty = !matchesSpecialty(a, subjectName);
              const conflictCount = a?.conflicts.length || 0;
              const specialtyLabel = a?.teachesAllSubjects
                ? ui("All subjects")
                : a?.subjectSpecialties.length
                  ? a.subjectSpecialties.slice(0, 2).join(", ") + (a.subjectSpecialties.length > 2 ? ` +${a.subjectSpecialties.length - 2}` : "")
                  : null;

              return (
                <SystemButton variant="ghost"
                  key={t.id}
                  type="button"
                  disabled={!!blocked}
                  onClick={() => pick(t.id)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-start justify-start",
                    blocked
                      ? "cursor-not-allowed opacity-55"
                      : value === t.id
                        ? "cursor-pointer bg-brand-50"
                        : "cursor-pointer hover:bg-brand-50/60"
                  )}
                >
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-edge/20 bg-card">
                    <AvatarImage src={teacherAvatar({ ...t, id: t.id })} name={t.fullName} alt="" initialsClassName="text-2xs" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-ink-strong"><bdi>{t.fullName || ui("Unnamed teacher")}</bdi></p>
                      {specialtyLabel ? (
                        <Badge variant={a?.teachesAllSubjects ? "success" : "default"} size="sm" className="shrink-0 gap-1">
                          {a?.teachesAllSubjects ? <Sparkles aria-hidden="true" className="h-2.5 w-2.5" /> : null}
                          {specialtyLabel}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-2xs font-medium tabular-nums text-ink-muted">
                      {ui(subjectLoad(t) === 1 ? "{0} subject" : "{0} subjects", [subjectLoad(t)])} · {ui(classLoad(t) === 1 ? "{0} class" : "{0} classes", [classLoad(t)])}
                      {a?.weeklyCapacity != null ? ` · ${ui("{0}/{1} periods", [a.weeklyPeriods ?? 0, a.weeklyCapacity])}` : ""}
                    </p>
                    {/* Weekly load at a glance: the bar warms as the teacher approaches their period capacity. */}
                    {a?.weeklyCapacity ? (() => {
                      const share = Math.round(((a.weeklyPeriods ?? 0) / a.weeklyCapacity) * 100);
                      return <Progress size="sm" className="mt-1.5 max-w-48" value={share} tone={share >= 100 ? "danger" : share >= 85 ? "warning" : "brand"} label={ui("{0}/{1} periods", [a.weeklyPeriods ?? 0, a.weeklyCapacity])} />;
                    })() : null}
                    {!blocked && atLoadLimit(a) ? (
                      <p className="mt-1 flex items-start gap-1 text-xs font-medium leading-relaxed text-status-warning-text">
                        <AlertTriangle aria-hidden="true" className="mt-px h-2.5 w-2.5 shrink-0" />
                        {ui("Weekly periods are full")}
                      </p>
                    ) : null}

                    {blocked ? (
                      <p className="mt-1 flex items-start gap-1 text-xs font-medium leading-relaxed text-status-error-text">
                        <Ban className="mt-px h-2.5 w-2.5 shrink-0" />
                        {blocked}
                      </p>
                    ) : null}
                    {!blocked && conflictCount > 0 ? (
                      <p className="mt-1 flex items-start gap-1 text-xs font-medium leading-relaxed text-status-error-text">
                        <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" />
                        {ui(conflictCount === 1 ? "{0} timetable clash ({1})" : "{0} timetable clashes ({1})", [conflictCount, `${a!.conflicts.slice(0, 2).map((c) => c.label).join(", ")}${conflictCount > 2 ? "…" : ""}`])}
                      </p>
                    ) : null}
                    {!blocked && offSpecialty ? (
                      <p className="mt-1 flex items-start gap-1 text-xs font-medium leading-relaxed text-status-warning-text">
                        <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" />
                        {subjectName ? ui("Not their specialty ({0})", [subjectName]) : ui("Not their specialty")}
                      </p>
                    ) : null}
                  </div>
                </SystemButton>
              );
            })}
            {filtered.length === 0 ? (
              <EmptyState size="sm" icon={Search} title={ui("No teachers match your search.")} description={ui("Try a different name or clear the search.")} />
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <SystemButton variant="outline"
            type="button"
            onClick={() => setOpen(true)}
            className="sk-field-trigger flex h-14 w-full items-center justify-between px-4 text-start"
          >
            {value ? (
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-edge/20 bg-card">
                  {selected ? <AvatarImage src={teacherAvatar({ ...selected, id: selected.id })} name={selected.fullName} alt="" initialsClassName="text-2xs" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink-strong"><bdi>{selected?.fullName || ui("Assigned teacher")}</bdi></span>
                  {selected ? (
                    <span className="block text-2xs font-medium tabular-nums text-ink-muted">
                      {ui(subjectLoad(selected) === 1 ? "{0} subject" : "{0} subjects", [subjectLoad(selected)])} · {ui(classLoad(selected) === 1 ? "{0} class" : "{0} classes", [classLoad(selected)])}
                      {selectedAvail?.teachesAllSubjects
                        ? ` · ${ui("All subjects")}`
                        : selectedAvail?.subjectSpecialties.length
                          ? ` · ${selectedAvail.subjectSpecialties.slice(0, 2).join(", ")}`
                          : ""}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : (
              <span className="text-sm font-bold text-ink-muted">{ui(allowUnassigned ? "Choose a teacher (optional)" : "Select teacher")}</span>
            )}
            <Badge size="sm" className="ms-3 shrink-0">
              {ui("Change")}
            </Badge>
          </SystemButton>

          {/* Warnings on the current selection stay visible while collapsed, so
              an existing bad assignment isn't hidden behind a closed dropdown. */}
          {selectedAvail && selectedAvail.conflicts.length > 0 ? (
            <p className="mt-1.5 flex items-start gap-1 ps-2 text-xs font-medium leading-relaxed text-status-error-text">
              <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" />
              {ui("Double-booked at {0}", [`${selectedAvail.conflicts.slice(0, 3).map((c) => c.label).join(", ")}${selectedAvail.conflicts.length > 3 ? ` +${selectedAvail.conflicts.length - 3}` : ""}`])}
            </p>
          ) : null}
          {selectedOffSpecialty ? (
            <p className="mt-1.5 flex items-start gap-1 ps-2 text-xs font-medium leading-relaxed text-status-warning-text">
              <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" />
              {ui("{0} is not a {1} specialist", [selected?.fullName ?? "", subjectName ?? ""])}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
