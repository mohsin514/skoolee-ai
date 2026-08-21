"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2,
  Search, UserCheck, UserX, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { AvatarImage } from "@/components/ui/avatar-image";

interface TeacherRecord {
  id: string;
  fullName: string;
  email: string;
  profileImageUrl: string | null;
  status: "PRESENT" | "ABSENT" | "LEAVE" | "UNMARKED";
  attendance: { id: string; checkInTime: string | null; notes: string | null } | null;
}

interface Summary {
  total: number;
  present: number;
  absent: number;
  leave: number;
  unmarked: number;
}

export function TeacherAttendancePanel({ campusId, readOnly }: { campusId?: string; readOnly?: boolean }) {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [roster, setRoster] = useState<TeacherRecord[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Map<string, "PRESENT" | "ABSENT" | "LEAVE">>(new Map());

  const qs = campusId ? `&campusId=${campusId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teacher-attendance?date=${date}${qs}`);
      const json = await res.json();
      if (json.success) {
        setRoster(json.data || []);
        setSummary(json.summary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 });
        setEdits(new Map());
      }
    } catch { toast.error("Failed to load teacher attendance"); }
    finally { setLoading(false); }
  }, [date, qs]);

  useEffect(() => { load(); }, [load]);

  const shiftDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split("T")[0]);
  };

  const handleStatusChange = (teacherId: string, status: "PRESENT" | "ABSENT" | "LEAVE") => {
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(teacherId, status);
      return next;
    });
  };

  const handleSave = async () => {
    if (edits.size === 0) { toast.info("No changes to save"); return; }
    setSaving(true);
    try {
      const entries = Array.from(edits.entries()).map(([userId, status]) => ({ userId, status }));
      const res = await fetch("/api/teacher-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, entries, campusId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      toast.success(json.message);
      await load();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleMarkAll = (status: "PRESENT" | "ABSENT" | "LEAVE") => {
    const next = new Map(edits);
    roster.forEach((t) => {
      if (t.status === "UNMARKED") next.set(t.id, status);
    });
    setEdits(next);
  };

  const filtered = search
    ? roster.filter((t) => t.fullName.toLowerCase().includes(search.toLowerCase()) || t.email.toLowerCase().includes(search.toLowerCase()))
    : roster;

  const getDisplayStatus = (t: TeacherRecord) => edits.get(t.id) || t.status;

  const statusColor = (s: string) => {
    switch (s) {
      case "PRESENT": return "bg-emerald-50 text-emerald-600";
      case "ABSENT": return "bg-rose-50 text-rose-600";
      case "LEAVE": return "bg-amber-50 text-amber-600";
      default: return "bg-[#f3f4f9] text-ink-subtle";
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Nav + Quick Stats */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftDate(-1)} className="h-10 w-10 rounded-xl bg-[#fbf0fe] flex items-center justify-center hover:bg-[#f0d6fa] transition-colors cursor-pointer">
            <ChevronLeft className="h-4 w-4 text-[#8127cf]" />
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-3 text-sm font-bold text-[#1d1b20] outline-none" />
          <button type="button" onClick={() => shiftDate(1)} className="h-10 w-10 rounded-xl bg-[#fbf0fe] flex items-center justify-center hover:bg-[#f0d6fa] transition-colors cursor-pointer">
            <ChevronRight className="h-4 w-4 text-[#8127cf]" />
          </button>
          <button type="button" onClick={() => setDate(new Date().toISOString().split("T")[0])}
            className="h-10 rounded-xl bg-[#fbf0fe] px-3 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] hover:bg-[#f0d6fa] transition-colors cursor-pointer">
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          {[
            { label: "Present", count: summary.present, color: "bg-emerald-50 text-emerald-600" },
            { label: "Absent", count: summary.absent, color: "bg-rose-50 text-rose-600" },
            { label: "Leave", count: summary.leave, color: "bg-amber-50 text-amber-600" },
            { label: "Unmarked", count: summary.unmarked, color: "bg-[#f3f4f9] text-ink-muted" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl px-3 py-1.5 ${s.color}`}>
              <p className="text-sm font-bold">{s.count}</p>
              <p className="text-[8px] font-semibold uppercase">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teachers..."
            className="h-10 w-full rounded-xl border border-[#cfc2d6]/20 bg-white pl-9 pr-3 text-sm font-semibold outline-none placeholder:text-ink-subtle focus:border-[#8127cf]/30 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] transition-all" />
        </div>
        <div className="flex items-center gap-2">
          {!readOnly ? (
            <>
              <button type="button" onClick={() => handleMarkAll("PRESENT")}
                className="h-9 rounded-xl bg-emerald-50 px-3 text-[10px] font-bold uppercase tracking-wider text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer">
                Mark All Present
              </button>
              <BrandButton variant="dark" onClick={handleSave} disabled={saving || edits.size === 0}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : `Save (${edits.size})`}
              </BrandButton>
            </>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Teachers mark their own attendance</span>
          )}
        </div>
      </div>

      {/* Roster */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-[#cfc2d6]/10 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="h-11 w-11 rounded-xl bg-[#e8e0ec]/50 skeleton-shimmer" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="h-3 w-44 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
              </div>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-9 w-16 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Calendar} title="No Teachers" description={search ? "No teachers match your search." : "No teachers found for this campus."} />
      ) : (
        <div className="space-y-2">
          {filtered.map((teacher) => {
            const ds = getDisplayStatus(teacher);
            const hasEdit = edits.has(teacher.id);
            return (
              <div key={teacher.id} className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${hasEdit ? "bg-[#fbf0fe]/40 border border-[#8127cf]/10" : "bg-white border border-[#cfc2d6]/10 hover:shadow-md"}`}>
                <div className="h-11 w-11 shrink-0 rounded-xl bg-[#fbf0fe] overflow-hidden">
                  <AvatarImage src={teacher.profileImageUrl} name={teacher.fullName} alt="" className="h-full w-full object-cover" initialsClassName="text-xs" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#1d1b20] truncate">{teacher.fullName}</p>
                  <p className="text-[10px] font-semibold text-ink-subtle truncate">{teacher.email}</p>
                </div>

                {teacher.attendance?.checkInTime && (
                  <div className="hidden sm:flex items-center gap-1 text-[10px] font-semibold text-ink-subtle">
                    <Clock className="h-3 w-3" /> {teacher.attendance.checkInTime}
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  {readOnly ? (
                    <span className={`h-9 rounded-xl px-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${statusColor(ds)}`}>
                      {ds === "PRESENT" ? <CheckCircle2 className="h-3.5 w-3.5" /> : ds === "ABSENT" ? <XCircle className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{ds === "LEAVE" ? "Leave" : ds === "PRESENT" ? "Present" : ds === "ABSENT" ? "Absent" : "Unmarked"}</span>
                    </span>
                  ) : (
                    (["PRESENT", "ABSENT", "LEAVE"] as const).map((s) => {
                      const active = ds === s;
                      const Icon = s === "PRESENT" ? CheckCircle2 : s === "ABSENT" ? XCircle : UserX;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleStatusChange(teacher.id, s)}
                          className={`h-9 rounded-xl px-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            active ? statusColor(s) : "bg-[#f3f4f9] text-ink-subtle hover:bg-[#f3f4f9]/80"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{s === "LEAVE" ? "Leave" : s === "PRESENT" ? "Present" : "Absent"}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
