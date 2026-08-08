"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  Award,
  BookOpen,
  Briefcase,
  Building,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Heart,
  LayoutGrid,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  School,
  Send,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { AiActionPanel, AIReviewQueue, BrandButton, EmptyState } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { CornerSparkles } from "@/components/CornerSparkles";
import { TeacherPicker, useTeacherAvailability } from "@/components/shared-admin/teacher-picker";
export { TeacherConflictsBanner } from "@/components/shared-admin/teacher-conflicts-banner";
import { SubjectSyllabus } from "@/components/shared-admin/subject-syllabus";

export type ClassFormState = {
  name: string;
  section: string;
  academicYear: number;
  classTeacherId: string;
};

export type StudentFormState = {
  fullName: string;
  rollNo: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  classId: string;
  studentEmail: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
};

export type ClassGroup = {
  key: string;
  name: string;
  academicYear: number | string;
  sections: any[];
};

export function formatStatus(status?: string) {
  return (status || "Pending").replaceAll("_", " ");
}

export function statusTone(status?: string) {
  if (["ACTIVE", "Active", "PUBLISHED", "SENT", "APPROVED", "Assigned", "One Teacher"].includes(status || "")) {
    return "bg-emerald-50 text-emerald-600";
  }
  if (["Invited", "PENDING", "TRIAL", "REVIEW", "LOCKED", "Subject Teachers"].includes(status || "")) {
    return "bg-[#fbf0fe] text-[#8127cf]";
  }
  if (["Expired", "FAILED", "BLOCKED", "SUSPENDED", "NO_REPORT", "Unassigned"].includes(status || "")) {
    return "bg-rose-50 text-rose-600";
  }
  return "bg-[#f3f4f9] text-[#4d4354]/70";
}

export function classLabel(item: any) {
  if (!item) return "Unassigned";
  return [item.name, item.section].filter(Boolean).join(" ");
}

export function sectionLabel(item: any) {
  return item?.section || "Main";
}

/**
 * Some schools don't stream a grade into sections at all — "Grade 5" is one
 * single class. That's stored as a single Class row with `section = null`, and
 * the UI must not invent a fake "Section Main" heading for it.
 */
export function isSectionless(group: { sections?: any[] } | null | undefined) {
  const sections = group?.sections || [];
  return sections.length === 1 && !sections[0]?.section;
}

export function classGroupKey(item: any) {
  return `${item?.academicYear || ""}::${item?.name || ""}`;
}

export function groupClasses(classes: any[]) {
  const groups = new Map<string, ClassGroup>();

  for (const cls of classes || []) {
    const key = classGroupKey(cls);
    const group: ClassGroup = groups.get(key) || {
      key,
      name: cls.name || "Class",
      academicYear: cls.academicYear || "N/A",
      sections: [],
    };
    group.sections.push(cls);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sections: group.sections.sort((a, b) => sectionLabel(a).localeCompare(sectionLabel(b))),
    }))
    .sort(
      (a, b) =>
        (Number(b.academicYear) || 0) - (Number(a.academicYear) || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""))
    );
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function LeadershipPanel({
  data,
  onInviteAdmin,
  onInvitePrincipal,
  onRemove,
  onResend,
  onCancel,
  onActivityLog,
}: {
  data: any;
  onInviteAdmin: () => void;
  onInvitePrincipal: () => void;
  onRemove: (id: string, label: string) => void;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
  onActivityLog?: () => void;
}) {
  const adminCount = data.campusAdmins?.length || 0;
  const principalAssigned = data.principal ? 1 : 0;
  const pendingCount = data.pendingAdminInvitations?.length || 0;
  const totalRoles = adminCount + principalAssigned + pendingCount || 1;

  const donutData = [
    { name: "Admins", value: adminCount, color: "#8127cf" },
    { name: "Principal", value: principalAssigned, color: "#10b981" },
    { name: "Pending", value: pendingCount, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-7">
      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] rounded-[32px] border border-[#cfc2d6]/25 p-7 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-[#8127cf]/10 to-transparent rounded-full blur-3xl -translate-y-1/3 translate-x-1/4 pointer-events-none" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-lg shadow-[#8127cf]/20">
                <LayoutGrid className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/40">{data.campusName}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-[#8127cf]">Campus Control</p>
                <p className="text-[9px] font-semibold text-[#4d4354]/50">Manage the single campus owner workspace, admin access, principal authority, and pending invitations.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <BrandButton variant="soft" icon={<Plus className="w-3.5 h-3.5" />} onClick={onInviteAdmin}>
              Add Admin
            </BrandButton>
            <BrandButton variant="soft" icon={<GraduationCap className="w-3.5 h-3.5" />} onClick={onInvitePrincipal}>
              Appoint Principal
            </BrandButton>
            {onActivityLog ? (
              <BrandButton variant="dark" icon={<ClipboardList className="w-3.5 h-3.5" />} onClick={onActivityLog}>
                Activity Log
              </BrandButton>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Charts & Panels Row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_2.2fr] gap-6">
        {/* Donut + Campus Identity */}
        <div className="space-y-6">
          {/* Donut Chart */}
          <div className="sk-rise group bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Leadership</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Team Overview</h3>
              </div>
              <div className="relative shrink-0">
                <div className="absolute -inset-2 bg-[#8127cf]/10 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative h-10 w-10 rounded-2xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf]">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </div>
            {donutData.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="shrink-0">
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={3} dataKey="value" stroke="none">
                        {donutData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2.5">
                  {[
                    { label: "Admins", value: adminCount, color: "#8127cf" },
                    { label: "Principal", value: principalAssigned, color: "#10b981" },
                    { label: "Pending", value: pendingCount, color: "#f59e0b" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] font-semibold text-[#4d4354]/60 uppercase tracking-wider">{item.label}</span>
                      </div>
                      <span className="text-xs font-bold text-[#1d1b20]">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[130px] rounded-2xl bg-[#fbf0fe]/40">
                <p className="text-xs font-bold text-[#4d4354]/40">No team data yet</p>
              </div>
            )}
          </div>

          {/* Campus Identity */}
          <div className="sk-rise group bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "160ms" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Identity</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Campus Details</h3>
              </div>
              <div className="relative shrink-0">
                <div className="absolute -inset-2 bg-[#8127cf]/10 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative h-10 w-10 rounded-2xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf]">
                  <Building className="h-5 w-5" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Building, label: "Campus", value: data.campusName },
                { icon: School, label: "School", value: data.schoolName },
                { icon: MapPin, label: "City", value: data.campusCity || "Not set" },
                { icon: FileText, label: "Reg ID", value: data.campusRegId || "Not set" },
                { icon: GraduationCap, label: "Year", value: data.academicYear || "Not set" },
                { icon: Users, label: "Students", value: `${data.studentCount || 0}` },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl bg-[#fbf0fe]/40 px-3 py-2">
                  <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 flex items-center justify-center text-[#8127cf] shrink-0">
                    <f.icon className="w-3 h-3" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[7px] font-black uppercase tracking-wider text-[#4d4354]/40">{f.label}</p>
                    <p className="text-[11px] font-bold text-[#1f1a23] truncate">{f.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Admin Team & Principal Panel */}
        <div className="space-y-6">
          {/* Admin Team + Pending In One Card */}
          <div className="sk-rise bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "160ms" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Team</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Admin Team</h3>
              </div>
              <div className="flex items-center gap-2">
                {adminCount > 0 ? (
                  <span className="rounded-full bg-[#8127cf]/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[#8127cf]">
                    {adminCount} active
                  </span>
                ) : null}
                {pendingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-600">
                    <Clock className="w-3 h-3" />
                    {pendingCount}
                  </span>
                ) : null}
                <StatusPill status="Owner Managed" />
              </div>
            </div>
            <div className="space-y-3">
              {data.campusAdmins?.map((admin: any) => (
                <AdminRow key={admin.id} admin={admin} currentUserId={data.currentUserId} onRemove={() => onRemove(admin.id, "Admin")} />
              ))}
              {data.pendingAdminInvitations?.map((invite: any) => (
                <PendingFacultyRow key={invite.id} invite={invite} onResend={() => onResend(invite.id)} onCancel={() => onCancel(invite.id)} />
              ))}
              {!data.campusAdmins?.length && !data.pendingAdminInvitations?.length ? (
                <div className="flex items-center justify-center h-20 rounded-2xl bg-[#fbf0fe]/40">
                  <p className="text-xs font-bold text-[#4d4354]/40">No admin access assigned yet.</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Principal Card */}
          <div className="bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Authority</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Principal</h3>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-[#fbf0fe] flex items-center justify-center text-[#8127cf]">
                <GraduationCap className="h-5 w-5" />
              </div>
            </div>
            {data.principal ? (
              <div className="flex items-center gap-5">
                <div className="relative shrink-0">
                  <div className="absolute -inset-2 bg-gradient-to-br from-emerald-100/40 to-transparent rounded-2xl blur-md" />
                  <div className="relative h-16 w-16 rounded-2xl bg-white border-2 border-emerald-100 shadow-sm flex items-center justify-center overflow-hidden">
                    <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.principal.email)}`} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base font-black text-[#1f1a23] tracking-tight truncate">{data.principal.fullName}</h4>
                  <p className="text-[9px] font-bold text-[#4d4354]/45 uppercase tracking-wider mt-0.5 truncate">{data.principal.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-600">
                      <UserCheck className="w-2.5 h-2.5" />
                      Active
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => onRemove(data.principal.id, "Principal")}
                  className="shrink-0 h-10 rounded-xl bg-rose-50 px-4 text-[9px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5 justify-center border border-rose-100 transition-all hover:bg-rose-500 hover:text-white hover:shadow-md hover:shadow-rose-500/20 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />
                  Revoke
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-amber-50 border-2 border-dashed border-amber-200 flex items-center justify-center text-amber-400">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1f1a23]">No Principal Assigned</p>
                    <p className="text-[10px] font-semibold text-[#4d4354]/50 mt-0.5">Tap below to appoint a principal</p>
                  </div>
                </div>
                <BrandButton variant="dark" icon={<GraduationCap className="w-3.5 h-3.5" />} onClick={onInvitePrincipal}>
                  Appoint
                </BrandButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CampusIdentityPanel({ data, onActivityLog }: { data: any; onActivityLog?: () => void }) {
  const fields = [
    { icon: Building, label: "Campus", value: data.campusName },
    { icon: School, label: "School", value: data.schoolName },
    { icon: MapPin, label: "City", value: data.campusCity || "Not set" },
    { icon: FileText, label: "Reg ID", value: data.campusRegId || "Not set", copyable: true },
    { icon: GraduationCap, label: "Academic Year", value: data.academicYear || "Not set" },
    { icon: Users, label: "Students", value: `${data.studentCount || 0}` },
  ];
  return (
    <div className="relative group rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-500 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25 overflow-hidden">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-bl from-[#8127cf]/5 to-transparent rounded-full blur-[70px] pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-gradient-to-tr from-[#b876f0]/4 to-transparent rounded-full blur-[60px] pointer-events-none" />
      <div className="relative">
        <CornerSparkles />
        <div className="mb-5 flex items-center justify-between gap-4">
          <PanelTitle icon={Building} title="Campus Identity" />
          <StatusPill status={data.isStandaloneCampus ? "Standalone" : "Campus"} />
        </div>
        <div className="grid grid-cols-1 gap-3">
          {fields.map((f, i) => (
            <div
              key={i}
              className="group/row flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#fbf0fe]/50 via-white to-[#fbf0fe]/20 px-4 py-3.5 border border-transparent transition-all hover:bg-[#fbf0fe]/80 hover:border-[#8127cf]/15 hover:shadow-sm"
            >
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 flex items-center justify-center text-[#8127cf] shrink-0 transition-all group-hover/row:from-[#8127cf] group-hover/row:to-[#b876f0] group-hover/row:text-white">
                <f.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[8px] font-black uppercase tracking-wider text-[#4d4354]/40">{f.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm font-black text-[#1f1a23] truncate">{f.value}</p>
                  {f.copyable && f.value && f.value !== "Not set" ? (
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(f.value)}
                      className="shrink-0 rounded-lg bg-white p-1 text-[#4d4354]/30 opacity-0 transition-all group-hover/row:opacity-100 hover:text-[#8127cf] hover:bg-[#8127cf]/10"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        {onActivityLog ? (
          <div className="mt-5">
            <BrandButton variant="soft" icon={<ClipboardList className="w-4 h-4" />} onClick={onActivityLog} className="w-full">
              View Activity Log
            </BrandButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminTeamPanel({
  data,
  onInvite,
  onRemove,
  onResend,
  onCancel,
}: {
  data: any;
  onInvite: () => void;
  onRemove: (id: string, label: string) => void;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const total = data.campusAdmins?.length || 0;
  const pending = data.pendingAdminInvitations?.length || 0;
  return (
    <div className="relative group rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-500 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25 overflow-hidden">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-bl from-[#8127cf]/5 to-transparent rounded-full blur-[70px] pointer-events-none" />
      <div className="relative">
        <CornerSparkles />
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <PanelTitle icon={Shield} title="Admin Team" />
            {total > 0 ? (
              <span className="inline-flex items-center rounded-full bg-[#8127cf]/10 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#8127cf]">
                {total} active
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {pending > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-600">
                <Clock className="w-2.5 h-2.5" />
                {pending} pending
              </span>
            ) : null}
            <StatusPill status="Owner Managed" />
          </div>
        </div>
        <div className="space-y-3">
          {data.campusAdmins.map((admin: any) => (
            <AdminRow
              key={admin.id}
              admin={admin}
              currentUserId={data.currentUserId}
              onRemove={() => onRemove(admin.id, "Admin")}
            />
          ))}
          {data.pendingAdminInvitations.map((invite: any) => (
            <PendingFacultyRow
              key={invite.id}
              invite={invite}
              onResend={() => onResend(invite.id)}
              onCancel={() => onCancel(invite.id)}
            />
          ))}
          {total === 0 && pending === 0 ? (
            <EmptyInline text="No admin access is assigned yet." />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AcademicPanel({
  classes,
  exams,
  reports,
  teachers,
  students,
  campusName,
  onAddClass,
  onAddStudent,
  onBulkImport,
  onViewClass,
  onChangeTeacher,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
  onAddSection,
}: {
  classes: any[];
  exams: any[];
  reports: any[];
  teachers: any[];
  students?: any[];
  campusName?: string;
  onAddClass: () => void;
  onAddStudent: (classId?: string) => void;
  onBulkImport?: (classId?: string) => void;
  onViewClass: (cls: any) => void;
  onChangeTeacher: (classId: string, teacherId: string) => Promise<void>;
  onDeleteClass?: (cls: any) => void;
  onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>;
  onDeleteSubject?: (subject: any) => void;
  onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
  onAddSection?: (name: string, section: string, academicYear: number, convertClassId?: string) => Promise<void>;
}) {
  const classGroups = groupClasses(classes);
  const [showAllExams, setShowAllExams] = useState(false);
  const [showAllReports, setShowAllReports] = useState(false);
  const [generatingExamId, setGeneratingExamId] = useState<string | null>(null);
  const lockedExams = exams.filter((e) => e.isLocked);
  const displayExams = showAllExams ? exams : exams.slice(0, 6);
  const displayReports = showAllReports ? reports : reports.slice(0, 6);

  const generateReportCards = async (examId: string) => {
    setGeneratingExamId(examId);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", examId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Generation failed");
      toast.success("Report cards generated");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setGeneratingExamId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-end gap-3">
        <BrandButton variant="soft" icon={<BookOpen className="w-4 h-4" />} onClick={onAddClass}>
          Add Class
        </BrandButton>
      </div>

      {classGroups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {classGroups.map((group) => (
            <ClassGroupCard
              key={group.key}
              group={group}
              teachers={teachers}
              students={students || []}
              onAddStudent={onAddStudent}
              onBulkImport={onBulkImport}
              onViewClass={onViewClass}
              onChangeTeacher={onChangeTeacher}
              onDeleteClass={onDeleteClass}
              onUpdateClass={onUpdateClass}
              onDeleteSubject={onDeleteSubject}
              onUpdateSubject={onUpdateSubject}
              onAddSection={onAddSection}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No classes defined"
          description="Create classes during onboarding or from the class management flow."
          action={<BrandButton onClick={onAddClass}>Add Class</BrandButton>}
        />
      )}
    </div>
  );
}
export function ExamDetailModal({
  exam,
  onClose,
  onViewReportCard,
  onRefresh,
}: {
  exam: any;
  onClose: () => void;
  onViewReportCard: (report: any) => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<"marks" | "reports" | "analytics">("marks");
  const [marksData, setMarksData] = useState<any>(null);
  const [reportsData, setReportsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [marksRes, reportsRes] = await Promise.all([
          fetch(`/api/marks?examId=${exam.id}`).then((r) => r.json()),
          fetch(`/api/reports?examId=${exam.id}`).then((r) => r.json()).catch(() => null),
        ]);
        if (!cancelled) {
          setMarksData(marksRes);
          setReportsData(reportsRes);
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [exam.id]);

  const handleLock = async () => {
    setActionBusy("lock");
    try {
      const res = await fetch(`/api/exams/${exam.id}/lock`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to lock");
      toast.success(`Exam locked. ${result.generated || 0} report cards generated.`);
      onRefresh();
      onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionBusy(null); }
  };

  const handleStatusChange = async (status: string) => {
    setActionBusy(status);
    try {
      const res = await fetch("/api/exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: exam.id, status }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to update status");
      toast.success(`Exam status updated to ${status.replaceAll("_", " ")}`);
      onRefresh();
      onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionBusy(null); }
  };

  const students = marksData?.students || [];
  const subjects = marksData?.subjects || [];
  const marks = marksData?.marks || [];
  const reportCards = reportsData?.reportCards || [];
  const analytics = reportsData?.analytics || null;

  const getMarkValue = (studentId: string, subjectId: string) => {
    const mark = marks.find((m: any) => m.studentId === studentId && m.subjectId === subjectId);
    return mark ? mark.marksObtained : null;
  };

  const canLock = !exam.isLocked && (exam.status === "ACTIVE" || exam.status === "MARKS_ENTRY");
  const canReview = exam.status === "LOCKED";
  const canPublish = exam.status === "PRINCIPAL_REVIEWED";

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-4 animate-backdrop-enter">
      <div className="bg-white w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/15 custom-scrollbar animate-modal-enter">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[11px] font-black uppercase tracking-wider text-[#8127cf]">{exam.examType?.replaceAll("_", " ") || "Exam"}</p>
              <StatusPill status={exam.status} />
            </div>
            <h2 className="text-2xl font-black text-[#1f1a23] tracking-tight mt-1">{exam.title}</h2>
            <p className="text-xs font-semibold text-[#4d4354]/50 mt-1">{exam.term} — {classLabel(exam.class)} — Total: {exam.totalMarks} marks</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canLock && (
              <button type="button" onClick={handleLock} disabled={actionBusy !== null}
                className="flex items-center gap-1.5 rounded-2xl bg-amber-50 border border-amber-200/40 px-4 py-2.5 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-all cursor-pointer disabled:opacity-50">
                {actionBusy === "lock" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />} Lock Exam
              </button>
            )}
            {canReview && (
              <button type="button" onClick={() => handleStatusChange("PRINCIPAL_REVIEWED")} disabled={actionBusy !== null}
                className="flex items-center gap-1.5 rounded-2xl bg-[#fbf0fe] border border-[#cfc2d6]/20 px-4 py-2.5 text-xs font-bold text-[#8127cf] hover:bg-[#f0d6fa] transition-all cursor-pointer disabled:opacity-50">
                {actionBusy === "PRINCIPAL_REVIEWED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Mark Reviewed
              </button>
            )}
            {canPublish && (
              <button type="button" onClick={() => handleStatusChange("PUBLISHED")} disabled={actionBusy !== null}
                className="flex items-center gap-1.5 rounded-2xl bg-emerald-50 border border-emerald-200/40 px-4 py-2.5 text-xs font-bold text-emerald-600 hover:bg-emerald-100 transition-all cursor-pointer disabled:opacity-50">
                {actionBusy === "PUBLISHED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />} Publish
              </button>
            )}
            <button type="button" onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-rose-50 hover:text-rose-500 cursor-pointer transition-all duration-200 active:scale-95">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-2xl bg-[#f3f4f9] p-1 mb-6">
          {(["marks", "reports", "analytics"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("rounded-xl px-5 py-2.5 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer",
                tab === t ? "bg-white text-[#8127cf] shadow-md" : "text-[#4d4354]/50 hover:text-[#8127cf]"
              )}>
              {t === "marks" ? "Marks Sheet" : t === "reports" ? `Report Cards (${reportCards.length})` : "Analytics"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3 animate-skeleton-in">
            <div className="overflow-x-auto rounded-2xl border border-[#cfc2d6]/10">
              <div className="grid grid-cols-[40px_1fr_80px_80px_80px_60px_60px] gap-0">
                <div className="col-span-7 flex gap-4 px-4 py-3 bg-[#fbf0fe]/30 border-b border-[#cfc2d6]/10">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="h-2.5 w-14 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                  ))}
                </div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="col-span-7 flex items-center gap-4 px-4 py-3 border-b border-[#cfc2d6]/5 animate-skeleton-in" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="h-3 w-5 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
                    <div className="h-3 w-28 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer flex-1" />
                    <div className="h-3 w-10 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                    <div className="h-3 w-8 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                    <div className="h-3 w-8 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                    <div className="h-3 w-8 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                    <div className="h-3 w-8 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {tab === "marks" && (
              <div className="overflow-x-auto rounded-2xl border border-[#cfc2d6]/10">
                {students.length === 0 ? (
                  <div className="py-16 text-center">
                    <Users className="mx-auto h-10 w-10 text-[#4d4354]/20 mb-3" />
                    <p className="text-sm font-bold text-[#4d4354]/40">No students found for this exam</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#cfc2d6]/10 bg-[#fbf0fe]/30">
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">#</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">Student</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">Roll No</th>
                        {subjects.map((s: any) => (
                          <th key={s.id} className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50 text-center">{s.name}<br /><span className="text-[8px] font-semibold">/ {s.totalMarks}</span></th>
                        ))}
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50 text-center">Total</th>
                        <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50 text-center">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student: any, idx: number) => {
                        const total = subjects.reduce((s: number, sub: any) => s + (getMarkValue(student.id, sub.id) ?? 0), 0);
                        const maxTotal = subjects.reduce((s: number, sub: any) => s + sub.totalMarks, 0);
                        const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
                        return (
                          <tr key={student.id} className="border-b border-[#cfc2d6]/5 hover:bg-[#fbf0fe]/20 transition-colors">
                            <td className="px-4 py-3 text-xs font-bold text-[#4d4354]/30">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-bold text-[#1f1a23] truncate max-w-[180px]">{student.fullName}</p>
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold text-[#4d4354]/50">{student.rollNo}</td>
                            {subjects.map((sub: any) => {
                              const val = getMarkValue(student.id, sub.id);
                              return (
                                <td key={sub.id} className="px-4 py-3 text-center">
                                  <span className={cn("text-sm font-bold", val === null ? "text-[#4d4354]/20" : val < sub.totalMarks * 0.5 ? "text-rose-500" : "text-[#1f1a23]")}>
                                    {val ?? "—"}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-center text-sm font-black text-[#8127cf]">{total}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn("text-sm font-black", pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-500")}>{pct}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === "reports" && (
              <div>
                {reportCards.length === 0 ? (
                  <div className="py-16 text-center">
                    <ClipboardList className="mx-auto h-10 w-10 text-[#4d4354]/20 mb-3" />
                    <p className="text-sm font-bold text-[#4d4354]/40">No report cards generated yet</p>
                    <p className="text-xs font-semibold text-[#4d4354]/30 mt-1">Lock the exam to auto-generate report cards</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {reportCards.map((rc: any) => (
                      <button key={rc.id} type="button" onClick={() => { onClose(); onViewReportCard(rc); }}
                        className="text-left rounded-2xl border border-[#cfc2d6]/10 bg-[#fbf0fe]/20 p-4 hover:bg-[#fbf0fe]/50 hover:shadow-md transition-all cursor-pointer">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#1f1a23] truncate">{rc.student?.fullName}</p>
                            <p className="text-[10px] font-semibold text-[#4d4354]/40 mt-0.5">Roll: {rc.student?.rollNo || "—"}</p>
                          </div>
                          <StatusPill status={rc.status} />
                        </div>
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#cfc2d6]/10">
                          <span className="text-xl font-black text-[#8127cf]">{rc.grade || "—"}</span>
                          <span className="text-sm font-bold text-[#4d4354]/50">{Math.round(rc.percentage || 0)}%</span>
                          <span className="ml-auto text-[10px] font-bold text-[#4d4354]/40">Rank #{rc.rank || "—"}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "analytics" && (
              <div>
                {!analytics ? (
                  <div className="py-16 text-center">
                    <Award className="mx-auto h-10 w-10 text-[#4d4354]/20 mb-3" />
                    <p className="text-sm font-bold text-[#4d4354]/40">Analytics available after report cards are generated</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Class Average", value: `${Math.round(analytics.classAverage || 0)}%`, icon: Award, tone: "bg-[#fbf0fe] text-[#8127cf]" },
                        { label: "Passed", value: analytics.passCount ?? 0, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
                        { label: "Failed", value: analytics.failCount ?? 0, icon: X, tone: "bg-rose-50 text-rose-500" },
                        { label: "Total Students", value: analytics.totalStudents ?? students.length, icon: Users, tone: "bg-[#f3f4f9] text-[#4d4354]" },
                      ].map((s) => (
                        <div key={s.label} className="bg-white p-5 rounded-[28px] border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-wider mb-2">{s.label}</p>
                              <p className="text-2xl font-black text-[#1f1a23]">{s.value}</p>
                            </div>
                            <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", s.tone)}>
                              <s.icon className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {analytics.subjectAverages?.length > 0 && (
                      <div className="bg-white rounded-[28px] border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/40 mb-4">Subject Performance</p>
                        <div className="space-y-3">
                          {analytics.subjectAverages.map((sa: any) => {
                            const avg = Math.round(sa.average || 0);
                            return (
                              <div key={sa.subjectId || sa.name}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs font-bold text-[#1f1a23]">{sa.name}</span>
                                  <span className={cn("text-xs font-black", avg >= 80 ? "text-emerald-600" : avg >= 50 ? "text-amber-600" : "text-rose-500")}>{avg}%</span>
                                </div>
                                <div className="h-2 bg-[#f3f4f9] rounded-full overflow-hidden">
                                  <div className={cn("h-full rounded-full transition-all duration-700",
                                    avg >= 80 ? "bg-emerald-500" : avg >= 50 ? "bg-amber-500" : "bg-rose-500"
                                  )} style={{ width: `${avg}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {analytics.topStudents?.length > 0 && (
                      <div className="bg-white rounded-[28px] border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/40 mb-4">Top Performers</p>
                        <div className="space-y-2">
                          {analytics.topStudents.map((ts: any, idx: number) => (
                            <div key={ts.studentId || idx} className="flex items-center gap-3 p-3 rounded-2xl bg-[#fbf0fe]/30">
                              <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black shrink-0",
                                idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-[#e8e0ec] text-[#4d4354]" : idx === 2 ? "bg-orange-100 text-orange-700" : "bg-[#f3f4f9] text-[#4d4354]/50"
                              )}>#{idx + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-[#1f1a23] truncate">{ts.name || ts.fullName}</p>
                              </div>
                              <span className="text-sm font-black text-[#8127cf]">{Math.round(ts.percentage || 0)}%</span>
                              <span className="text-sm font-bold text-[#1f1a23]">{ts.grade}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {analytics.needsAttention?.length > 0 && (
                      <div className="bg-white rounded-[28px] border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                        <p className="text-[10px] font-black uppercase tracking-wider text-rose-500/70 mb-4">Needs Attention</p>
                        <div className="space-y-2">
                          {analytics.needsAttention.map((ns: any) => (
                            <div key={ns.studentId} className="flex items-center gap-3 p-3 rounded-2xl bg-rose-50/30 border border-rose-100">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-[#1f1a23] truncate">{ns.name || ns.fullName}</p>
                                <p className="text-[10px] font-semibold text-rose-500 mt-0.5">{ns.reason}</p>
                              </div>
                              <span className="text-sm font-black text-rose-500">{Math.round(ns.percentage || 0)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ExamCyclesPanel({
  exams,
  onSelect,
}: {
  exams: any[];
  onSelect?: (exam: any) => void;
}) {
  const [showAllExams, setShowAllExams] = useState(false);
  const [generatingExamId, setGeneratingExamId] = useState<string | null>(null);
  const displayExams = showAllExams ? exams : exams.slice(0, 12);

  const generateReportCards = async (examId: string) => {
    setGeneratingExamId(examId);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", examId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Generation failed");
      toast.success("Report cards generated");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setGeneratingExamId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">{exams.length} Exam{exams.length !== 1 ? "s" : ""}</p>
          <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Exam Cycles</h3>
        </div>
        {exams.length > 12 && (
          <button type="button" onClick={() => setShowAllExams(!showAllExams)}
            className="text-[9px] font-black uppercase tracking-wider text-[#8127cf] hover:underline cursor-pointer">
            {showAllExams ? "Show Less" : `View All (${exams.length})`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {displayExams.map((exam: any, i: number) => (
          <div key={exam.id} role="button" tabIndex={0} onClick={() => onSelect?.(exam)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(exam); } }}
            className="sk-rise group/exam rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:-translate-y-0.5 hover:border-[#8127cf]/25 cursor-pointer" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-[#1f1a23] tracking-tight truncate">{exam.title}</p>
                <p className="mt-1 text-[10px] font-bold text-[#4d4354]/50">{exam.term} - {classLabel(exam.class)}</p>
              </div>
              <StatusPill status={exam.status} />
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[#cfc2d6]/10">
              <span className="text-[9px] font-semibold text-[#4d4354]/50">{exam.missingMarks ?? 0} missing marks</span>
              <span className="text-[9px] font-semibold text-[#4d4354]/50">{exam._count?.reportCards || 0} reports</span>
              {exam.isLocked && exam._count?.reportCards === 0 ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); generateReportCards(exam.id); }} disabled={generatingExamId === exam.id}
                  className="ml-auto flex h-7 items-center gap-1 rounded-lg bg-[#8127cf] px-2.5 text-[8px] font-black uppercase tracking-wider text-white transition-all duration-200 hover:bg-[#6a1fad] active:scale-95 cursor-pointer disabled:opacity-50">
                  {generatingExamId === exam.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Generate Reports"}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {exams.length === 0 ? (
        <div className="sk-rise flex items-center justify-center h-32 rounded-[28px] bg-white border border-[#cfc2d6]/25">
          <p className="text-xs font-bold text-[#4d4354]/40">No exam cycles available yet.</p>
        </div>
      ) : null}
    </div>
  );
}

export function ReportCardsPanel({
  reports,
  onSelect,
}: {
  reports: any[];
  onSelect?: (report: any) => void;
}) {
  const [showAllReports, setShowAllReports] = useState(false);
  const displayReports = showAllReports ? reports : reports.slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">{reports.length} Report{reports.length !== 1 ? "s" : ""}</p>
          <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Report Cards</h3>
        </div>
        {reports.length > 12 && (
          <button type="button" onClick={() => setShowAllReports(!showAllReports)}
            className="text-[9px] font-black uppercase tracking-wider text-[#8127cf] hover:underline cursor-pointer">
            {showAllReports ? "Show Less" : `View All (${reports.length})`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {displayReports.map((report: any, i: number) => (
          <div key={report.id} role="button" tabIndex={0} onClick={() => onSelect?.(report)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(report); } }}
            className="sk-rise group/report rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:-translate-y-0.5 hover:border-[#8127cf]/25 cursor-pointer" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-[#1f1a23] tracking-tight truncate">{report.student?.fullName || "Student"}</p>
                <p className="mt-1 text-[10px] font-bold text-[#4d4354]/50">{report.exam?.title || "Report"} - {report.grade || Math.round(report.percentage || 0) + "%"}</p>
              </div>
              <StatusPill status={report.status} />
            </div>
            <p className="text-[9px] font-semibold text-[#4d4354]/50">{report.student?.class ? classLabel(report.student.class) : "—"}</p>
          </div>
        ))}
      </div>
      {reports.length === 0 ? (
        <div className="sk-rise flex items-center justify-center h-32 rounded-[28px] bg-white border border-[#cfc2d6]/25">
          <p className="text-xs font-bold text-[#4d4354]/40">Report cards will appear after exams are processed.</p>
        </div>
      ) : null}
    </div>
  );
}

export function FacultyPanel({
  teachers,
  pendingInvites,
  onInvite,
  onRemove,
  onViewTeacher,
  onResend,
  onCancel,
}: {
  teachers: any[];
  pendingInvites: any[];
  onInvite: () => void;
  onRemove: (id: string) => void;
  onViewTeacher: (teacher: any) => void;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const filtered = teachers.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.fullName?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q);
  });

  if (teachers.length === 0 && pendingInvites.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No faculty records found"
        description="Invite teachers so subjects and classes can be assigned from the central model."
        action={<BrandButton onClick={onInvite}>Add Teacher</BrandButton>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="group/search flex items-center rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 h-12 w-full max-w-xs transition-all duration-200 focus-within:border-[#8127cf]/30 focus-within:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#4d4354]/40 transition-colors group-focus-within/search:text-[#8127cf]">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text" placeholder="Search teachers..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ml-2 h-full w-full bg-transparent border-none outline-none text-sm font-bold placeholder:text-[#4d4354]/35 tracking-wide"
          />
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={onInvite}>
          Add Teacher
        </BrandButton>
      </div>
      {filtered.map((teacher: any) => (
        <FacultyRow key={teacher.id} teacher={teacher} onView={() => onViewTeacher(teacher)} onRemove={() => onRemove(teacher.id)} />
      ))}
      {!searchQuery.trim() ? pendingInvites.map((invite: any) => (
        <PendingFacultyRow
          key={invite.id}
          invite={invite}
          onResend={() => onResend(invite.id)}
          onCancel={() => onCancel(invite.id)}
        />
      )) : null}
      {filtered.length === 0 && teachers.length > 0 ? <EmptyInline text="No teachers match your search." /> : null}
    </div>
  );
}

export function StudentsPanel({
  students,
  classes,
  onAddStudent,
  onViewStudent,
  onBulkImport,
  onExport,
}: {
  students: any[];
  classes: any[];
  onAddStudent: (classId?: string) => void;
  onViewStudent: (student: any) => void;
  onBulkImport?: () => void;
  onExport?: () => void;
}) {
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 12;
  const classGroups = groupClasses(classes);
  const selectedGroup = classGroups.find((group) => group.key === classFilter);
  const filteredStudents = students.filter((student) => {
    if (sectionFilter !== "all") return student.class?.id === sectionFilter;
    if (classFilter !== "all") return classGroupKey(student.class) === classFilter;
    return true;
  }).filter((student) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      student.fullName?.toLowerCase().includes(q) ||
      student.rollNo?.toLowerCase().includes(q) ||
      student.guardianName?.toLowerCase().includes(q) ||
      student.guardianPhone?.includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pagedStudents = filteredStudents.slice((safePage - 1) * perPage, safePage * perPage);

  useEffect(() => { setPage(1); }, [classFilter, sectionFilter, searchQuery]);

  if (students.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No students linked yet"
        description="Student profiles will appear here after classes and enrollment records are created."
        action={<BrandButton onClick={() => onAddStudent()} disabled={classes.length === 0}>Add Student</BrandButton>}
      />
    );
  }

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <PanelTitle icon={GraduationCap} title="Student Directory" />
          <div className="flex items-center gap-2">
            <BrandButton variant="soft" icon={<Plus className="w-4 h-4" />} onClick={() => onAddStudent()}>
              Add Student
            </BrandButton>
            {onBulkImport ? (
              <BrandButton variant="soft" icon={<FileText className="w-4 h-4" />} onClick={onBulkImport}>
                Bulk Import
              </BrandButton>
            ) : null}
            {onExport ? (
              <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={onExport}>
                Export CSV
              </BrandButton>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Search</span>
            <div className="group/search flex items-center rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 h-14 w-full transition-all duration-200 focus-within:border-[#8127cf]/30 focus-within:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] focus-within:bg-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#4d4354]/40 transition-colors group-focus-within/search:text-[#8127cf]">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text" placeholder="Search students..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ml-2 h-full w-full bg-transparent border-none outline-none text-sm font-bold placeholder:text-[#4d4354]/35 tracking-wide"
              />
            </div>
          </div>
          <FormSelect
            label="Class"
            value={classFilter}
            onChange={(value) => {
              setClassFilter(value);
              setSectionFilter("all");
            }}
          >
            <option value="all">All classes</option>
            {classGroups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.name} - {group.academicYear}
              </option>
            ))}
          </FormSelect>
          <FormSelect label="Section" value={sectionFilter} onChange={setSectionFilter}>
            <option value="all">All sections</option>
            {(selectedGroup?.sections || classes).map((cls) => (
              <option key={cls.id} value={cls.id}>
                {classLabel(cls)}
              </option>
            ))}
          </FormSelect>
          <div className="pb-1.5">
            <StatusPill status={`${filteredStudents.length} Shown`} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {pagedStudents.map((student: any, i: number) => {
          const report = student.reportCards?.[0];
          const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`;
          return (
            <div
              key={student.id}
              role="button"
              tabIndex={0}
              onClick={() => onViewStudent(student)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onViewStudent(student);
                }
              }}
              className="sk-rise group/student relative cursor-pointer overflow-hidden rounded-[24px] border border-[#cfc2d6]/25 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#8127cf]/30 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]/30 focus-visible:ring-offset-1"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#8127cf] via-[#b876f0] to-[#8127cf] opacity-0 transition-opacity duration-300 group-hover/student:opacity-70" />
              <div className="absolute -top-12 -right-12 w-24 h-24 bg-gradient-to-bl from-[#8127cf]/8 to-transparent rounded-full blur-[50px] opacity-0 group-hover/student:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="h-16 w-16 shrink-0 rounded-full bg-gradient-to-br from-[#8127cf]/35 to-[#9c48ea]/20 p-[2.5px] shadow-sm transition-all duration-300 group-hover/student:scale-105 group-hover/student:from-[#8127cf] group-hover/student:to-[#9c48ea] group-hover/student:shadow-md">
                      <div className="h-full w-full overflow-hidden rounded-full border-2 border-white bg-[#fbf0fe]">
                        <img src={avatar} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover/student:scale-110" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-[#1f1a23] tracking-tight transition-colors duration-300 group-hover/student:text-[#8127cf]">{student.fullName}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-[#fbf0fe] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
                          Roll {student.rollNo || "—"}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-[#f3f4f9] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/60">
                          {classLabel(student.class)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <StatusPill status={report ? report.status : "NO_REPORT"} />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#f3f4f9] pt-3.5">
                  <div className="min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-wider text-[#4d4354]/35">Guardian</p>
                    <p className="truncate text-xs font-bold text-[#4d4354]/70">{student.guardianName || "Not linked"}</p>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fbf0fe] text-[#8127cf]/50 transition-all duration-300 group-hover/student:translate-x-0.5 group-hover/student:bg-[#8127cf] group-hover/student:text-white group-hover/student:shadow-sm">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {pagedStudents.length === 0 ? <EmptyInline text="No students match your search and filters." /> : null}
      </div>
      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[#f3f4f9] px-5 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/60 transition-all duration-200 hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95"
          >
            Previous
          </button>
          <span className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[#f3f4f9] px-5 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/60 transition-all duration-200 hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AIPanel({
  features,
  insights,
  reviewItems,
  onComplete,
  title = "Campus AI",
}: {
  features: any[];
  insights: any[];
  reviewItems: any[];
  onComplete: () => void;
  title?: string;
}) {
  const [showAllInsights, setShowAllInsights] = useState(false);
  const displayInsights = showAllInsights ? insights : insights?.slice(0, 5);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-8">
      <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] relative overflow-hidden" style={{ animationDelay: "80ms" }}>
        <CornerSparkles />
        <AiActionPanel title={title} options={features} compact onComplete={onComplete} />
      </div>
      <div className="space-y-8">
        <SnapshotColumn icon={Sparkles} title="AI Review Queue">
          <AIReviewQueue items={reviewItems} onComplete={onComplete} />
        </SnapshotColumn>
        <SnapshotColumn
          icon={FileText}
          title="AI Insights"
          after={insights?.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAllInsights(!showAllInsights)}
              className="text-[9px] font-black uppercase tracking-wider text-[#8127cf] hover:underline cursor-pointer"
            >
              {showAllInsights ? "Show Less" : `View All (${insights.length})`}
            </button>
          ) : null}
        >
          {displayInsights?.length ? (
            displayInsights.map((insight: any) => (
              <div key={insight.id} className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">{insight.feature.replaceAll("_", " ")}</p>
                <p className="mt-1 text-sm font-black text-[#1f1a23]">{insight.title}</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-[#4d4354]/60">{insight.summary}</p>
              </div>
            ))
          ) : (
            <EmptyInline text="Class, review, and intervention drafts will appear here." />
          )}
        </SnapshotColumn>
      </div>
    </div>
  );
}


export function MoveStudentModal({
  student,
  classes,
  classId,
  busy,
  onClassChange,
  onClose,
  onSave,
}: {
  student: any;
  classes: any[];
  classId: string;
  busy: boolean;
  onClassChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const currentClassId = student.class?.id || student.classId;
  const classGroups = groupClasses(classes);
  const selectedClass = classes.find((cls) => cls.id === classId);
  const selectedGroupKey = selectedClass ? classGroupKey(selectedClass) : "";
  const selectedGroup = classGroups.find((group) => group.key === selectedGroupKey);
  const isSameClass = classId === currentClassId;

  const selectClassGroup = (key: string) => {
    const group = classGroups.find((item) => item.key === key);
    const firstNonCurrent = group?.sections?.find((s) => s.id !== currentClassId);
    onClassChange(firstNonCurrent?.id || group?.sections?.[0]?.id || "");
  };

  return (
    <ModalFrame title="Move Student" eyebrow="Class placement" onClose={onClose}>
      <div className="rounded-3xl bg-[#fbf0fe]/65 p-5 mb-5">
        <p className="text-sm font-black text-[#1f1a23]">{student.fullName}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/45">
          Current: {classLabel(student.class)} · Roll: {student.rollNo}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormSelect label="New Class" value={selectedGroupKey} onChange={selectClassGroup}>
          <option value="">Select class</option>
          {classGroups.map((group) => (
            <option key={group.key} value={group.key}>
              {group.name} - {group.academicYear}
            </option>
          ))}
        </FormSelect>
        <FormSelect label="New Section" value={classId} onChange={onClassChange}>
          <option value="">Select section</option>
          {(selectedGroup?.sections || []).map((cls) => (
            <option key={cls.id} value={cls.id} disabled={cls.id === currentClassId}>
              {cls.section ? `Section ${cls.section}` : "Whole class"}{cls.id === currentClassId ? " (current)" : ""}
            </option>
          ))}
        </FormSelect>
      </div>
      {isSameClass && classId ? (
        <p className="mt-3 text-xs font-semibold text-amber-600">Please select a different class or section to move the student.</p>
      ) : null}
      <ModalActions busy={busy || !classId || isSameClass} busyLabel="Moving" actionLabel="Move Student" onClose={onClose} onSave={onSave} />
    </ModalFrame>
  );
}

export function inferTeachingMode(cls: any): "single" | "subject" {
  const classTeacherId = cls.classTeacher?.id || "";
  const hasSeparateSubjectTeacher = (cls.subjects || []).some(
    (subject: any) => subject.teacher?.id && subject.teacher.id !== classTeacherId
  );
  return hasSeparateSubjectTeacher ? "subject" : "single";
}

export function subjectTeacherDefaults(cls: any) {
  const subjects: any[] = cls.subjects || [];
  return subjects.reduce<Record<string, string>>((acc, subject) => {
    acc[subject.id] = subject.teacher?.id || "";
    return acc;
  }, {});
}

export function ClassDetailModal({
  cls,
  students,
  teachers,
  classes,
  teacherBusy,
  subjectBusyId,
  creatingSubject,
  teachingModeBusy,
  classUpdateBusy,
  subjectUpdateBusyId,
  onClose,
  onChangeTeacher,
  onChangeTeachingMode,
  onCreateSubject,
  onChangeSubjectTeacher,
  onAddStudent,
  onViewStudent,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
}: {
  cls: any;
  students: any[];
  teachers: any[];
  classes?: any[];
  teacherBusy: boolean;
  subjectBusyId: string | null;
  creatingSubject: boolean;
  teachingModeBusy?: boolean;
  classUpdateBusy: boolean;
  subjectUpdateBusyId: string | null;
  onClose: () => void;
  onChangeTeacher: (classId: string, classTeacherId: string) => void;
  onChangeTeachingMode: (classId: string, mode: "SINGLE" | "SUBJECT") => void;
  onCreateSubject: (
    classId: string,
    subject: { name: string; totalMarks: number; teacherId: string; applyToAllSections?: boolean }
  ) => Promise<boolean>;
  onChangeSubjectTeacher: (classId: string, subjectId: string, teacherId: string) => void;
  onAddStudent: () => void;
  onViewStudent: (student: any) => void;
  onDeleteClass: (cls: any) => void;
  onUpdateClass: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>;
  onDeleteSubject: (subject: any) => void;
  onUpdateSubject: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  type ManageTab = "overview" | "subjects" | "students";
  const [tab, setTab] = useState<ManageTab>("overview");
  // Campus-wide teacher load/clash data, refreshed after each assignment so
  // warnings reflect the change the admin just made.
  const { availability, refresh: refreshAvailability } = useTeacherAvailability();

  // Teaching mode is a saved property of the section, not a view toggle:
  // SINGLE  = the class teacher takes every subject
  // SUBJECT = each subject has its own teacher
  const teachingMode: "SINGLE" | "SUBJECT" = cls.teachingMode === "SUBJECT" ? "SUBJECT" : "SINGLE";

  const [subjectName, setSubjectName] = useState("");
  const [subjectMarks, setSubjectMarks] = useState("100");
  const [newSubjectTeacherId, setNewSubjectTeacherId] = useState("");
  const [applyToAllSections, setApplyToAllSections] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editSubjectName, setEditSubjectName] = useState("");
  const [editSubjectMarks, setEditSubjectMarks] = useState("100");

  // Only reset the add-subject teacher default when a *different* class is
  // opened. Keying on cls.id alone (not the subjects array, whose identity
  // changes on every parent refetch) is what stops in-progress edits from
  // being wiped mid-interaction.
  useEffect(() => {
    setNewSubjectTeacherId(cls.classTeacher?.id || "");
    setTab("overview");
    setEditingSubjectId(null);
    setApplyToAllSections(false);
  }, [cls.id]);

  const siblingSections = useMemo(
    () => (classes || []).filter((c: any) => classGroupKey(c) === classGroupKey(cls)),
    [classes, cls]
  );

  const createSubject = async () => {
    const created = await onCreateSubject(cls.id, {
      name: subjectName,
      totalMarks: Number(subjectMarks) || 100,
      teacherId: teachingMode === "SINGLE" ? cls.classTeacher?.id || "" : newSubjectTeacherId,
      applyToAllSections,
    });
    if (created) {
      setSubjectName("");
      setSubjectMarks("100");
    }
  };

  const [editingClass, setEditingClass] = useState(false);
  const [editClassName, setEditClassName] = useState(cls.name || "");
  const [editClassSection, setEditClassSection] = useState(cls.section || "");
  const [editClassAcademicYear, setEditClassAcademicYear] = useState(String(cls.academicYear || new Date().getFullYear()));

  useEffect(() => {
    if (!editingClass) {
      setEditClassName(cls.name || "");
      setEditClassSection(cls.section || "");
      setEditClassAcademicYear(String(cls.academicYear || new Date().getFullYear()));
    }
  }, [cls.id, editingClass]);

  const saveClassEdit = async () => {
    await onUpdateClass(cls.id, {
      name: editClassName,
      section: editClassSection,
      academicYear: Number(editClassAcademicYear) || new Date().getFullYear(),
    });
    setEditingClass(false);
  };

  const startEditingSubject = (subject: any) => {
    setEditingSubjectId(subject.id);
    setEditSubjectName(subject.name);
    setEditSubjectMarks(String(subject.totalMarks || 100));
  };

  const saveEditingSubject = async (subjectId: string) => {
    await onUpdateSubject(cls.id, subjectId, {
      name: editSubjectName,
      totalMarks: Number(editSubjectMarks) || 100,
    });
    setEditingSubjectId(null);
  };

  const subjectCount = cls.subjects?.length || 0;
  const unassignedCount = (cls.subjects || []).filter((s: any) => !s.teacher?.id).length;

  const TABS: { key: ManageTab; label: string; icon: LucideIcon; badge?: number }[] = [
    { key: "overview", label: "Overview", icon: LayoutGrid },
    { key: "subjects", label: "Subjects", icon: BookOpen, badge: subjectCount },
    { key: "students", label: "Students", icon: GraduationCap, badge: students.length },
  ];

  return (
    <ModalFrame title={classLabel(cls)} eyebrow="Manage class" onClose={onClose} wide>
      {/* Tabs — the modal used to be one long scroll mixing class settings,
          subjects and students together, which made it hard to tell what a
          given control actually affected. */}
      <div className="mb-5 flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all",
                active ? "bg-white text-[#8127cf] shadow-sm" : "text-[#4d4354]/50 hover:text-[#8127cf]"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.badge !== undefined ? (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[8px]", active ? "bg-[#fbf0fe] text-[#8127cf]" : "bg-white/70 text-[#4d4354]/45")}>
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "overview" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MiniMetric label="Students" value={students.length} active />
            <MiniMetric label="Subjects" value={subjectCount} />
            <MiniMetric label="Academic Year" value={cls.academicYear || "N/A"} />
          </div>

          {/* Teaching mode — the single most important setting on this screen,
              so it leads and explains itself rather than sitting as an
              unexplained toggle next to the teacher field. */}
          <div className="rounded-3xl bg-[#fbf0fe]/65 p-5">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">How is this section taught?</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                { mode: "SINGLE" as const, title: "One teacher", copy: "The class teacher takes every subject in this section." },
                { mode: "SUBJECT" as const, title: "Teacher per subject", copy: "Each subject is assigned its own teacher." },
              ]).map((option) => {
                const active = teachingMode === option.mode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    disabled={teachingModeBusy}
                    onClick={() => { if (!active) onChangeTeachingMode(cls.id, option.mode); }}
                    className={cn(
                      "rounded-2xl border-2 p-4 text-left transition-all cursor-pointer disabled:cursor-wait disabled:opacity-60",
                      active
                        ? "border-[#8127cf] bg-white shadow-[0_8px_22px_-4px_rgba(129,39,207,0.32)]"
                        : "border-transparent bg-white/60 hover:border-[#8127cf]/25 hover:bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-sm font-black", active ? "text-[#8127cf]" : "text-[#1f1a23]")}>{option.title}</p>
                      {active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#8127cf]" /> : null}
                    </div>
                    <p className="mt-1 text-[10px] font-bold leading-relaxed text-[#4d4354]/55">{option.copy}</p>
                  </button>
                );
              })}
            </div>
            {teachingMode === "SINGLE" ? (
              <p className="mt-3 rounded-2xl bg-white/70 p-3 text-[10px] font-bold leading-relaxed text-[#4d4354]/55">
                Every subject below follows the class teacher automatically — changing the class teacher updates them all.
              </p>
            ) : null}
          </div>

          {/* Class teacher — saves on selection, no separate Save click. */}
          <div className="rounded-3xl bg-[#fbf0fe]/65 p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Class Teacher</p>
                <p className="mt-1 truncate text-base font-black tracking-tight text-[#1f1a23]">
                  {cls.classTeacher?.fullName || "Unassigned"}
                </p>
                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/45">
                  {cls.classTeacher?.email || "Assign a teacher to make this roster visible in the teacher dashboard."}
                </p>
              </div>
              {cls.classTeacher?.profileImageUrl ? (
                <div className="hidden h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-white shadow-sm sm:block">
                  <img src={cls.classTeacher.profileImageUrl} alt="" className="h-full w-full object-cover" />
                </div>
              ) : null}
            </div>
            <div className="relative">
              <TeacherPicker
                label={teacherBusy ? "Saving…" : "Change Class Teacher"}
                teachers={teachers}
                availability={availability}
                assignmentMode={teachingMode === "SINGLE" ? "homeroom" : "subject"}
                currentClassId={cls.id}
                value={cls.classTeacher?.id || ""}
                onChange={(value) => {
                  if (value !== (cls.classTeacher?.id || "")) {
                    onChangeTeacher(cls.id, value);
                    setTimeout(refreshAvailability, 600);
                  }
                }}
                allowUnassigned
                showUnassignedHint={!cls.classTeacher?.id}
              />
              {teacherBusy ? (
                <Loader2 className="absolute right-4 top-[42px] h-4 w-4 animate-spin text-[#8127cf]" />
              ) : null}
            </div>
          </div>

          {/* Class identity + destructive actions, kept together at the bottom. */}
          <div className="rounded-3xl border border-[#cfc2d6]/25 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <PanelTitle icon={School} title="Class details" />
              <button
                type="button"
                onClick={() => setEditingClass(!editingClass)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer",
                  editingClass ? "bg-[#f3f4f9] text-[#4d4354]/60" : "bg-[#fbf0fe] text-[#8127cf] hover:bg-[#f0e0f8]"
                )}
              >
                {editingClass ? "Cancel" : "Edit"}
              </button>
            </div>
            {editingClass ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormInput label="Class Name" value={editClassName} placeholder="e.g. Class 10" onChange={setEditClassName} />
                  <FormInput label="Section" value={editClassSection} placeholder="e.g. A" onChange={setEditClassSection} />
                  <FormInput label="Academic Year" type="number" value={editClassAcademicYear} placeholder="2026" onChange={setEditClassAcademicYear} />
                </div>
                <div className="flex justify-end">
                  <BrandButton variant="dark" className="h-12" onClick={saveClassEdit} disabled={classUpdateBusy}>
                    {classUpdateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Class Details"}
                  </BrandButton>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-[#4d4354]/55">
                  {cls.name}{cls.section ? ` · Section ${cls.section}` : ""} · {cls.academicYear}
                </p>
                <button
                  type="button"
                  onClick={() => onDeleteClass(cls)}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-rose-50 px-3 text-[10px] font-black uppercase tracking-wider text-rose-600 transition-all duration-200 hover:bg-rose-100 active:scale-95 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Class
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "subjects" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PanelTitle icon={BookOpen} title="Subjects" />
            <div className="flex items-center gap-2">
              {unassignedCount > 0 && teachingMode === "SUBJECT" ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-600">
                  {unassignedCount} unassigned
                </span>
              ) : null}
              <StatusPill status={teachingMode === "SINGLE" ? "One Teacher" : "Per Subject"} />
            </div>
          </div>

          {teachingMode === "SINGLE" ? (
            <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-[11px] font-bold leading-relaxed text-[#4d4354]/60">
              All subjects are taught by <span className="text-[#8127cf]">{cls.classTeacher?.fullName || "the class teacher (unassigned)"}</span>.
              Switch to “Teacher per subject” on the Overview tab to assign them individually.
            </p>
          ) : null}

          <div className="space-y-3">
            {cls.subjects?.map((subject: any) => {
              const isEditing = editingSubjectId === subject.id;
              return (
                <div key={subject.id} className="rounded-2xl bg-[#fbf0fe]/55 p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <FormInput label="Subject Name" value={editSubjectName} placeholder="Subject name" onChange={setEditSubjectName} />
                        <FormInput label="Total Marks" type="number" value={editSubjectMarks} placeholder="100" onChange={setEditSubjectMarks} />
                      </div>
                      <div className="flex gap-2">
                        <BrandButton
                          variant="dark"
                          className="h-11 flex-1"
                          onClick={() => saveEditingSubject(subject.id)}
                          disabled={subjectUpdateBusyId === subject.id}
                        >
                          {subjectUpdateBusyId === subject.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </BrandButton>
                        <button
                          type="button"
                          onClick={() => setEditingSubjectId(null)}
                          className="h-11 rounded-xl bg-[#f3f4f9] px-4 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/60 transition-all duration-200 hover:bg-[#fbf0fe] hover:text-[#8127cf] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#1f1a23]">{subject.name}</p>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
                            {subject.teacher?.fullName || "Teacher unassigned"} {subject.totalMarks ? `- ${subject.totalMarks} marks` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditingSubject(subject)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4d4354]/40 transition-all hover:bg-white hover:text-[#8127cf] cursor-pointer"
                            title="Edit subject"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSubject(subject)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4d4354]/40 transition-all hover:bg-white hover:text-rose-500 cursor-pointer"
                            title="Delete subject"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {teachingMode === "SUBJECT" ? (
                        <div className="relative mt-4">
                          <TeacherPicker
                            label={subjectBusyId === subject.id ? "Saving…" : "Subject Teacher"}
                            teachers={teachers}
                            availability={availability}
                            assignmentMode="subject"
                            subjectName={subject.name}
                            value={subject.teacher?.id || ""}
                            onChange={(value) => {
                              if (value !== (subject.teacher?.id || "")) {
                                onChangeSubjectTeacher(cls.id, subject.id, value);
                                setTimeout(refreshAvailability, 600);
                              }
                            }}
                            allowUnassigned
                            showUnassignedHint={!subject.teacher?.id}
                          />
                          {subjectBusyId === subject.id ? (
                            <Loader2 className="absolute right-4 top-[42px] h-4 w-4 animate-spin text-[#8127cf]" />
                          ) : null}
                        </div>
                      ) : null}
                      <SubjectSyllabus subjectId={subject.id} />
                    </>
                  )}
                </div>
              );
            })}
            {!subjectCount ? <EmptyInline text="No subjects are attached to this class yet." /> : null}
          </div>

          <div className="rounded-3xl border border-[#cfc2d6]/25 bg-white p-4">
            <PanelTitle icon={Plus} title="Add Subject" />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormInput label="Subject Name" value={subjectName} placeholder="e.g. Mathematics" onChange={setSubjectName} />
              <FormInput label="Total Marks" type="number" value={subjectMarks} placeholder="100" onChange={setSubjectMarks} />
            </div>
            {teachingMode === "SUBJECT" ? (
              <div className="mt-3">
                <TeacherPicker label="Subject Teacher (optional)" teachers={teachers} availability={availability} assignmentMode="subject" subjectName={subjectName} value={newSubjectTeacherId} onChange={setNewSubjectTeacherId} allowUnassigned />
              </div>
            ) : null}
            {siblingSections.length > 1 ? (
              <button
                type="button"
                onClick={() => setApplyToAllSections((v) => !v)}
                className="mt-3 flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-[#fbf0fe]/60 p-3 text-left transition-all hover:bg-[#fbf0fe]"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                    applyToAllSections ? "border-[#8127cf] bg-[#8127cf]" : "border-[#cfc2d6]/50 bg-white"
                  )}
                >
                  {applyToAllSections ? <Check className="h-3 w-3 text-white" strokeWidth={3.5} /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-black text-[#1f1a23]">
                    Add to all {siblingSections.length} sections of {cls.name}
                  </span>
                  <span className="block text-[9px] font-bold text-[#4d4354]/50">
                    Sections that already have this subject are skipped.
                  </span>
                </span>
              </button>
            ) : null}
            <div className="mt-3 flex justify-end">
              <BrandButton variant="dark" className="h-12" onClick={createSubject} disabled={creatingSubject}>
                {creatingSubject ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Subject"}
              </BrandButton>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "students" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <PanelTitle icon={GraduationCap} title="Students" />
            <BrandButton variant="soft" icon={<Plus className="w-4 h-4" />} onClick={onAddStudent}>
              Add Student
            </BrandButton>
          </div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            {students.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => onViewStudent(student)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-[#fbf0fe]/55 px-4 py-3 text-left transition-all hover:bg-white hover:shadow-md"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-white bg-white shadow-sm">
                  <img
                    src={student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
                    Roll {student.rollNo} - Guardian {student.guardianName || "N/A"}
                  </p>
                </div>
              </button>
            ))}
            {students.length === 0 ? <EmptyInline text="No students are enrolled in this class yet." /> : null}
          </div>
        </div>
      ) : null}
    </ModalFrame>
  );
}

export function StudentDetailModal({
  student,
  busy,
  onClose,
  onMove,
  onDelete,
  onUpdate,
}: {
  student: any;
  busy: boolean;
  onClose: () => void;
  onMove: () => void;
  onDelete: (student: any) => void;
  onUpdate: (studentId: string, updates: Record<string, any>) => Promise<void>;
}) {
  const report = student.reportCards?.[0];
  const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`;
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [parentLink, setParentLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  const generateParentLink = async () => {
    setGeneratingLink(true);
    try {
      const res = await fetch("/api/parent/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
      });
      const json = await res.json();
      if (json.success) {
        setParentLink(json.portalUrl);
        toast.success("Parent portal link generated (valid 30 days)");
      } else {
        toast.error(json.error || "Failed to generate link");
      }
    } catch {
      toast.error("Failed to generate parent link");
    } finally {
      setGeneratingLink(false);
    }
  };

  const copyParentLink = () => {
    if (!parentLink) return;
    navigator.clipboard.writeText(parentLink);
    setLinkCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setLinkCopied(false), 2000);
  };

  useEffect(() => {
    setEdits({
      fullName: student.fullName || "",
      nameUr: student.nameUr || "",
      rollNo: student.rollNo || "",
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split("T")[0] : "",
      gender: student.gender || "",
      bloodType: student.bloodType || "",
      nationality: student.nationality || "",
      phone: student.phone || "",
      guardianName: student.guardianName || "",
      guardianNameUr: student.guardianNameUr || "",
      guardianPhone: student.guardianPhone || "",
      guardianEmail: student.guardianEmail || "",
      guardianRelationship: student.guardianRelationship || "",
      guardianOccupation: student.guardianOccupation || "",
      city: student.city || "",
      province: student.province || "",
      postalCode: student.postalCode || "",
      address: student.address || "",
      medicalNotes: student.medicalNotes || "",
      specialNeeds: student.specialNeeds || "",
      allergies: student.allergies || "",
      medications: student.medications || "",
      previousSchool: student.previousSchool || "",
    });
  }, [student.id]);

  const ed = (field: string) => edits[field] || "";
  const setEd = (field: string, value: string) => setEdits((p) => ({ ...p, [field]: value }));

  const saveEdits = async () => {
    const updates: Record<string, any> = {};
    const strFields = [
      "fullName", "nameUr", "rollNo", "gender", "bloodType", "nationality", "phone",
      "guardianName", "guardianNameUr", "guardianPhone", "guardianEmail",
      "guardianRelationship", "guardianOccupation",
      "city", "province", "postalCode", "address",
      "medicalNotes", "specialNeeds", "allergies", "medications", "previousSchool",
    ];
    for (const f of strFields) updates[f] = edits[f] || null;
    if (edits.fullName) updates.fullName = edits.fullName;
    if (edits.rollNo) updates.rollNo = edits.rollNo;
    if (edits.dateOfBirth) updates.dateOfBirth = edits.dateOfBirth;
    await onUpdate(student.id, updates);
    setEditing(false);
  };

  const formatDob = (d: any) => {
    if (!d) return "N/A";
    try { return new Date(d).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" }); } catch { return "N/A"; }
  };

  const genderLabel = (g: string) => {
    if (g === "MALE") return "Male";
    if (g === "FEMALE") return "Female";
    if (g === "OTHER") return "Other";
    return g || "N/A";
  };

  const relationshipLabel = (r: string) => {
    const map: Record<string, string> = { FATHER: "Father", MOTHER: "Mother", GUARDIAN: "Guardian", UNCLE: "Uncle", AUNT: "Aunt", GRANDPARENT: "Grandparent", SIBLING: "Sibling" };
    return map[r] || r || "N/A";
  };

  return (
    <ModalFrame title={student.fullName} eyebrow="Student profile" onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onDelete(student)} className="flex h-9 items-center gap-1.5 rounded-xl bg-rose-50 px-3 text-[10px] font-black uppercase tracking-wider text-rose-600 transition-all duration-200 hover:bg-rose-100 active:scale-95 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />Delete Student
          </button>
          <button type="button" onClick={onMove} className="flex h-9 items-center gap-1.5 rounded-xl bg-[#fbf0fe] px-3 text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-all duration-200 hover:bg-[#8127cf] hover:text-white active:scale-95 cursor-pointer">
            <ArrowRightLeft className="h-3.5 w-3.5" />Move Class
          </button>
          <button type="button" onClick={generateParentLink} disabled={generatingLink} className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-wider text-emerald-600 transition-all duration-200 hover:bg-emerald-100 active:scale-95 cursor-pointer disabled:opacity-50">
            {generatingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
            Parent Portal Link
          </button>
        </div>
        <button type="button" onClick={() => setEditing(!editing)} className={cn(
          "flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer",
          editing ? "bg-[#f3f4f9] text-[#4d4354]/60" : "bg-[#fbf0fe] text-[#8127cf] hover:bg-[#f0e0f8]"
        )}>
          <Pencil className="h-3.5 w-3.5" />{editing ? "Cancel" : "Edit Details"}
        </button>
      </div>

      {parentLink && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200/50 p-3">
          <ExternalLink className="h-4 w-4 text-emerald-600 shrink-0" />
          <input type="text" readOnly value={parentLink} className="flex-1 bg-transparent text-xs font-mono text-emerald-800 outline-none truncate" />
          <button type="button" onClick={copyParentLink} className="flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[9px] font-black uppercase text-white hover:bg-emerald-700 transition-colors cursor-pointer shrink-0">
            {linkCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {linkCopied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-[#fbf0fe]/65 p-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Full Name (English)" value={ed("fullName")} placeholder="Student name" onChange={(v) => setEd("fullName", v)} />
                <FormInput label="Full Name (Urdu)" value={ed("nameUr")} placeholder="اردو نام" onChange={(v) => setEd("nameUr", v)} />
              </div>
              <FormInput label="Roll Number" value={ed("rollNo")} placeholder="Roll number" onChange={(v) => setEd("rollNo", v)} />
            </div>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Student Record</p>
              <h3 className="mt-1 truncate text-3xl font-black tracking-tight text-[#1f1a23]">{student.fullName}</h3>
              {student.nameUr ? <p className="mt-0.5 text-lg font-semibold text-[#4d4354]/70" dir="rtl">{student.nameUr}</p> : null}
              <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-[#4d4354]/55">
                {student.rollNo || "No roll number"} - {classLabel(student.class)}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Roll No" value={student.rollNo || "N/A"} active />
        <MiniMetric label="Class" value={classLabel(student.class)} />
        <MiniMetric label="Status" value={student.status === "active" ? "Active" : student.status || "Active"} />
        <MiniMetric label="Latest Result" value={report ? report.grade || `${Math.round(report.percentage || 0)}%` : "N/A"} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal Info */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={User} title="Personal Info" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Date of Birth" value={ed("dateOfBirth")} placeholder="YYYY-MM-DD" onChange={(v) => setEd("dateOfBirth", v)} />
              <FormSelect label="Gender" value={ed("gender")} onChange={(v) => setEd("gender", v)}>
                <option value="">Not specified</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </FormSelect>
              <FormSelect label="Blood Type" value={ed("bloodType")} onChange={(v) => setEd("bloodType", v)}>
                <option value="">Not known</option>
                {["A+","A-","B+","B-","O+","O-","AB+","AB-"].map((bt) => <option key={bt} value={bt}>{bt}</option>)}
              </FormSelect>
              <FormInput label="Nationality" value={ed("nationality")} placeholder="Pakistan" onChange={(v) => setEd("nationality", v)} />
              <FormInput label="Phone" value={ed("phone")} placeholder="+92 300 1234567" onChange={(v) => setEd("phone", v)} />
              <FormInput label="Previous School" value={ed("previousSchool")} placeholder="Previous school" onChange={(v) => setEd("previousSchool", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Student Login" value={student.studentUser?.email || "Not linked"} />
              <DetailRow label="Date of Birth" value={formatDob(student.dateOfBirth)} />
              <DetailRow label="Gender" value={genderLabel(student.gender)} />
              <DetailRow label="Blood Type" value={student.bloodType || "N/A"} />
              <DetailRow label="Nationality" value={student.nationality || "N/A"} />
              <DetailRow label="Phone" value={student.phone || "N/A"} />
              <DetailRow label="Previous School" value={student.previousSchool || "N/A"} />
              <DetailRow label="Enrolled" value={formatDob(student.enrollmentDate)} />
            </div>
          )}
        </div>

        {/* Guardian Details */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Users} title="Guardian" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Name (English)" value={ed("guardianName")} placeholder="Guardian name" onChange={(v) => setEd("guardianName", v)} />
                <FormInput label="Name (Urdu)" value={ed("guardianNameUr")} placeholder="سرپرست کا نام" onChange={(v) => setEd("guardianNameUr", v)} />
              </div>
              <FormSelect label="Relationship" value={ed("guardianRelationship")} onChange={(v) => setEd("guardianRelationship", v)}>
                <option value="">Select</option>
                {["FATHER","MOTHER","GUARDIAN","UNCLE","AUNT","GRANDPARENT","SIBLING"].map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
              </FormSelect>
              <FormInput label="Occupation" value={ed("guardianOccupation")} placeholder="Occupation" onChange={(v) => setEd("guardianOccupation", v)} />
              <FormInput label="Phone" value={ed("guardianPhone")} placeholder="Guardian phone" onChange={(v) => setEd("guardianPhone", v)} />
              <FormInput label="Email" value={ed("guardianEmail")} placeholder="Guardian email" onChange={(v) => setEd("guardianEmail", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Name" value={student.guardianName || "N/A"} />
              {student.guardianNameUr ? <DetailRow label="Name (Urdu)" value={<span dir="rtl">{student.guardianNameUr}</span>} /> : null}
              <DetailRow label="Relationship" value={relationshipLabel(student.guardianRelationship)} />
              <DetailRow label="Occupation" value={student.guardianOccupation || "N/A"} />
              <DetailRow label="Phone" value={student.guardianPhone || student.guardianWhatsapp || "N/A"} />
              <DetailRow label="Email" value={student.guardianEmail || "N/A"} />
            </div>
          )}
        </div>

        {/* Address */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={MapPin} title="Address" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Address" value={ed("address")} placeholder="Street address" onChange={(v) => setEd("address", v)} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="City" value={ed("city")} placeholder="City" onChange={(v) => setEd("city", v)} />
                <FormInput label="Province" value={ed("province")} placeholder="Province" onChange={(v) => setEd("province", v)} />
              </div>
              <FormInput label="Postal Code" value={ed("postalCode")} placeholder="Postal code" onChange={(v) => setEd("postalCode", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Address" value={student.address || "N/A"} />
              <DetailRow label="City" value={student.city || "N/A"} />
              <DetailRow label="Province" value={student.province || "N/A"} />
              <DetailRow label="Postal Code" value={student.postalCode || "N/A"} />
            </div>
          )}
        </div>

        {/* Medical & Report */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Heart} title="Medical & Health" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Medical Notes" value={ed("medicalNotes")} placeholder="Medical conditions" onChange={(v) => setEd("medicalNotes", v)} />
              <FormInput label="Special Needs" value={ed("specialNeeds")} placeholder="Special needs" onChange={(v) => setEd("specialNeeds", v)} />
              <FormInput label="Allergies" value={ed("allergies")} placeholder="Allergies" onChange={(v) => setEd("allergies", v)} />
              <FormInput label="Medications" value={ed("medications")} placeholder="Medications" onChange={(v) => setEd("medications", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Medical Notes" value={student.medicalNotes || "None"} />
              <DetailRow label="Special Needs" value={student.specialNeeds || "None"} />
              <DetailRow label="Allergies" value={student.allergies || "None"} />
              <DetailRow label="Medications" value={student.medications || "None"} />
            </div>
          )}
        </div>
      </div>

      {/* Report Card */}
      <div className="mt-5 rounded-3xl bg-[#fbf0fe]/60 p-5">
        <PanelTitle icon={FileText} title="Report Card" />
        {report ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DetailRow label="Exam" value={report.exam?.title || "N/A"} />
            <DetailRow label="Status" value={<StatusPill status={report.status} />} />
            <DetailRow label="Generated" value={formatDate(report.generatedAt)} />
          </div>
        ) : (
          <div className="mt-4">
            <EmptyInline text="No report card has been generated for this student yet." />
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {editing ? (
          <BrandButton variant="dark" className="h-12" onClick={saveEdits} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </BrandButton>
        ) : null}
        <BrandButton variant="soft" icon={<School className="w-4 h-4" />} onClick={onMove}>
          Move Class / Section
        </BrandButton>
      </div>
    </ModalFrame>
  );
}

export function TeacherDetailModal({ teacher, onClose, onUpdate }: { teacher: any; onClose: () => void; onUpdate?: (teacherId: string, updates: Record<string, any>) => Promise<void> }) {
  const ledClasses = teacher.ledClasses || [];
  const taughtSubjects = teacher.taughtSubjects || [];
  const avatar = teacher.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teacher.fullName)}`;
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [teachesAll, setTeachesAll] = useState(false);
  const [specialtyDraft, setSpecialtyDraft] = useState("");

  useEffect(() => {
    setSpecialties(
      teacher.subjectSpecialties?.length
        ? teacher.subjectSpecialties
        : (teacher.specialization || "").split(",").map((x: string) => x.trim()).filter(Boolean)
    );
    setTeachesAll(Boolean(teacher.teachesAllSubjects));
    setSpecialtyDraft("");
  }, [teacher.id]);

  useEffect(() => {
    setEdits({
      fullName: teacher.fullName || "",
      phone: teacher.phone || "",
      cnic: teacher.cnic || "",
      dateOfBirth: teacher.dateOfBirth ? new Date(teacher.dateOfBirth).toISOString().split("T")[0] : "",
      gender: teacher.gender || "",
      qualification: teacher.qualification || "",
      specialization: teacher.specialization || "",
      experience: teacher.experience || "",
      joiningDate: teacher.joiningDate ? new Date(teacher.joiningDate).toISOString().split("T")[0] : "",
      address: teacher.address || "",
      city: teacher.city || "",
      province: teacher.province || "",
      postalCode: teacher.postalCode || "",
      emergencyContact: teacher.emergencyContact || "",
      emergencyPhone: teacher.emergencyPhone || "",
    });
  }, [teacher.id]);

  const ed = (field: string) => edits[field] || "";
  const setEd = (field: string, value: string) => setEdits((p) => ({ ...p, [field]: value }));

  const saveEdits = async () => {
    if (!onUpdate) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      const strFields = [
        "fullName", "phone", "cnic", "gender", "qualification", "specialization",
        "experience", "address", "city", "province", "postalCode",
        "emergencyContact", "emergencyPhone",
      ];
      for (const f of strFields) updates[f] = edits[f] || null;
      updates.subjectSpecialties = specialties;
      updates.teachesAllSubjects = teachesAll;
      // Keep the legacy free-text field readable for anything still showing it.
      updates.specialization = teachesAll ? "All subjects" : specialties.join(", ") || null;
      if (edits.fullName) updates.fullName = edits.fullName;
      if (edits.dateOfBirth) updates.dateOfBirth = edits.dateOfBirth;
      if (edits.joiningDate) updates.joiningDate = edits.joiningDate;
      await onUpdate(teacher.id, updates);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: any) => {
    if (!d) return "N/A";
    try { return new Date(d).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" }); } catch { return "N/A"; }
  };

  const genderLabel = (g: string) => {
    if (g === "MALE") return "Male";
    if (g === "FEMALE") return "Female";
    if (g === "OTHER") return "Other";
    return g || "N/A";
  };

  return (
    <ModalFrame title={teacher.fullName} eyebrow="Teacher profile" onClose={onClose} wide>
      <div className="mb-4 flex justify-end">
        {onUpdate ? (
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer",
              editing ? "bg-[#f3f4f9] text-[#4d4354]/60" : "bg-[#fbf0fe] text-[#8127cf] hover:bg-[#f0e0f8]"
            )}
          >
            <Pencil className="h-3 w-3" />
            {editing ? "Cancel" : "Edit Details"}
          </button>
        ) : null}
      </div>

      {/* ── Header Card ── */}
      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-[#fbf0fe]/65 p-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <FormInput label="Full Name" value={ed("fullName")} placeholder="Teacher name" onChange={(v) => setEd("fullName", v)} />
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Faculty Record</p>
              <h3 className="mt-1 truncate text-3xl font-black tracking-tight text-[#1f1a23]">{teacher.fullName}</h3>
              <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-[#4d4354]/55">
                {teacher.email || "No email"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Subjects" value={teacher._count?.taughtSubjects || taughtSubjects.length} active />
        <MiniMetric label="Class Teacher" value={teacher._count?.ledClasses || ledClasses.length} />
        <MiniMetric label="Status" value={teacher.isActive ? "Active" : "Inactive"} />
        <MiniMetric label="Onboarding" value={teacher.onboardingComplete ? "Done" : "Pending"} />
      </div>

      {/* ── Profile Sections ── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal Info */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={User} title="Personal Info" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Email" value={teacher.email || ""} placeholder="Email" onChange={() => {}} />
              <FormInput label="Phone" value={ed("phone")} placeholder="+92 300 1234567" onChange={(v) => setEd("phone", v)} />
              <FormInput label="CNIC" value={ed("cnic")} placeholder="12345-1234567-1" onChange={(v) => setEd("cnic", v)} />
              <FormInput label="Date of Birth" value={ed("dateOfBirth")} placeholder="YYYY-MM-DD" onChange={(v) => setEd("dateOfBirth", v)} />
              <FormSelect label="Gender" value={ed("gender")} onChange={(v) => setEd("gender", v)}>
                <option value="">Not specified</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </FormSelect>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Email" value={teacher.email || "N/A"} />
              <DetailRow label="Phone" value={teacher.phone || "N/A"} />
              <DetailRow label="CNIC" value={teacher.cnic || "N/A"} />
              <DetailRow label="Date of Birth" value={formatDate(teacher.dateOfBirth)} />
              <DetailRow label="Gender" value={genderLabel(teacher.gender)} />
            </div>
          )}
        </div>

        {/* Professional Details */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Briefcase} title="Professional" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormSelect label="Qualification" value={ed("qualification")} onChange={(v) => setEd("qualification", v)}>
                <option value="">Select qualification</option>
                <option value="Matric">Matric</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Bachelors">Bachelors</option>
                <option value="Masters">Masters</option>
                <option value="MPhil">MPhil</option>
                <option value="PhD">PhD</option>
                <option value="B.Ed">B.Ed</option>
                <option value="M.Ed">M.Ed</option>
              </FormSelect>
              <FormInput label="Experience" value={ed("experience")} placeholder="e.g. 5 years" onChange={(v) => setEd("experience", v)} />
              <FormInput label="Joining Date" value={ed("joiningDate")} placeholder="YYYY-MM-DD" onChange={(v) => setEd("joiningDate", v)} />
              <div className="sm:col-span-2">
                <SpecialtyEditor
                  specialties={specialties}
                  teachesAll={teachesAll}
                  draft={specialtyDraft}
                  onDraftChange={setSpecialtyDraft}
                  onAdd={(name) => {
                    const clean = name.trim();
                    if (!clean) return;
                    setSpecialties((cur) => (cur.some((s) => s.toLowerCase() === clean.toLowerCase()) ? cur : [...cur, clean]));
                    setSpecialtyDraft("");
                  }}
                  onRemove={(name) => setSpecialties((cur) => cur.filter((s) => s !== name))}
                  onToggleAll={() => setTeachesAll((v) => !v)}
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Qualification" value={teacher.qualification || "N/A"} />
              <DetailRow
                label="Teaches"
                value={teachesAll ? "All subjects" : specialties.length ? specialties.join(", ") : "Not set"}
              />
              <DetailRow label="Experience" value={teacher.experience || "N/A"} />
              <DetailRow label="Joining Date" value={formatDate(teacher.joiningDate)} />
            </div>
          )}
        </div>

        {/* Address */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={MapPin} title="Address" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Address" value={ed("address")} placeholder="Street address" onChange={(v) => setEd("address", v)} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="City" value={ed("city")} placeholder="City" onChange={(v) => setEd("city", v)} />
                <FormSelect label="Province" value={ed("province")} onChange={(v) => setEd("province", v)}>
                  <option value="">Select province</option>
                  <option value="Punjab">Punjab</option>
                  <option value="Sindh">Sindh</option>
                  <option value="KPK">KPK</option>
                  <option value="Balochistan">Balochistan</option>
                  <option value="Islamabad">Islamabad</option>
                  <option value="AJK">AJK</option>
                  <option value="Gilgit-Baltistan">Gilgit-Baltistan</option>
                </FormSelect>
              </div>
              <FormInput label="Postal Code" value={ed("postalCode")} placeholder="Postal code" onChange={(v) => setEd("postalCode", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Address" value={teacher.address || "N/A"} />
              <DetailRow label="City" value={teacher.city || "N/A"} />
              <DetailRow label="Province" value={teacher.province || "N/A"} />
              <DetailRow label="Postal Code" value={teacher.postalCode || "N/A"} />
            </div>
          )}
        </div>

        {/* Emergency Contact */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Shield} title="Emergency Contact" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Contact Person" value={ed("emergencyContact")} placeholder="Emergency contact name" onChange={(v) => setEd("emergencyContact", v)} />
              <FormInput label="Contact Phone" value={ed("emergencyPhone")} placeholder="Emergency phone" onChange={(v) => setEd("emergencyPhone", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Contact Person" value={teacher.emergencyContact || "N/A"} />
              <DetailRow label="Contact Phone" value={teacher.emergencyPhone || "N/A"} />
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-6 flex justify-end">
          <BrandButton variant="dark" className="h-12" onClick={saveEdits} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </BrandButton>
        </div>
      ) : null}

      {/* ── Led Classes & Taught Subjects ── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={School} title="Led Classes" />
            <StatusPill status={`${ledClasses.length} Classes`} />
          </div>
          <div className="space-y-2">
            {ledClasses.map((cls: any) => (
              <div key={cls.id} className="rounded-2xl bg-[#fbf0fe]/55 px-4 py-3">
                <p className="text-sm font-black text-[#1f1a23]">{classLabel(cls)}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
                  {cls._count?.students || 0} students - {cls._count?.subjects || 0} subjects
                </p>
              </div>
            ))}
            {ledClasses.length === 0 ? <EmptyInline text="This teacher is not the class teacher for any class yet." /> : null}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={BookOpen} title="Taught Subjects" />
            <StatusPill status={`${taughtSubjects.length} Subjects`} />
          </div>
          <div className="space-y-2">
            {taughtSubjects.map((subject: any) => (
              <div key={subject.id} className="rounded-2xl bg-[#fbf0fe]/55 px-4 py-3">
                <p className="text-sm font-black text-[#1f1a23]">{subject.name}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
                  {classLabel(subject.class)} - {subject.totalMarks || 100} marks
                </p>
              </div>
            ))}
            {taughtSubjects.length === 0 ? <EmptyInline text="No subjects are assigned to this teacher yet." /> : null}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

export function ModalFrame({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5 animate-backdrop-enter">
      <div className={cn(
        "bg-white w-full max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/15 custom-scrollbar animate-modal-enter",
        wide ? "max-w-4xl" : "max-w-lg"
      )}>
        <div className="flex justify-between items-start gap-5 mb-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">{eyebrow}</p>
            <h3 className="mt-1.5 text-2xl font-black text-[#1f1a23] tracking-tight">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-rose-50 hover:text-rose-500 cursor-pointer transition-all duration-200 active:scale-95">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalActions({
  busy,
  busyLabel,
  actionLabel,
  onClose,
  onSave,
}: {
  busy: boolean;
  busyLabel: string;
  actionLabel: string;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-8 flex gap-3 pt-6 border-t border-[#cfc2d6]/10">
      <BrandButton variant="soft" className="flex-1 h-13" onClick={onClose}>
        Cancel
      </BrandButton>
      <BrandButton variant="dark" className="flex-[2] h-13" onClick={onSave} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {busyLabel}
          </>
        ) : (
          actionLabel
        )}
      </BrandButton>
    </div>
  );
}

export function FormInput({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block group/input">
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 transition-colors duration-200 group-focus-within/input:text-[#8127cf]">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all duration-250 placeholder:text-[#4d4354]/30 focus:border-[#8127cf]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] hover:border-[#cfc2d6]/40"
      />
    </label>
  );
}

export function FormSelect({
  label,
  value,
  children,
  onChange,
}: {
  label: string;
  value: string;
  children: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block group/select">
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 transition-colors duration-200 group-focus-within/select:text-[#8127cf]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all duration-250 focus:border-[#8127cf]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] hover:border-[#cfc2d6]/40"
      >
        {children}
      </select>
    </label>
  );
}

export function ClassGroupCard({
  group,
  teachers,
  students,
  onAddStudent,
  onBulkImport,
  onViewClass,
  onChangeTeacher,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
  onAddSection,
}: {
  group: { name: string; academicYear: number | string; sections: any[] };
  teachers: any[];
  students: any[];
  onAddStudent: (classId?: string) => void;
  onBulkImport?: (classId?: string) => void;
  onViewClass: (cls: any) => void;
  onChangeTeacher: (classId: string, teacherId: string) => Promise<void>;
  onDeleteClass?: (cls: any) => void;
  onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>;
  onDeleteSubject?: (subject: any) => void;
  onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
  onAddSection?: (name: string, section: string, academicYear: number, convertClassId?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSectionBusy, setAddingSectionBusy] = useState(false);
  const studentCount = group.sections.reduce((sum, cls) => sum + (cls._count?.students || 0), 0);
  const subjectCount = group.sections.reduce((sum, cls) => sum + (cls._count?.subjects || cls.subjects?.length || 0), 0);
  const sectionless = isSectionless(group);

  const handleAddSection = async () => {
    if (!newSectionName.trim()) return;
    setAddingSectionBusy(true);
    try {
      if (onAddSection) {
        // A sectionless class already occupies the "no section" slot. Adding
        // its first real section must rename that row, otherwise the students
        // stay stranded on an unnamed sibling class.
        await onAddSection(
          group.name,
          newSectionName.trim(),
          Number(group.academicYear),
          sectionless ? group.sections[0]?.id : undefined
        );
      }
      setNewSectionName("");
      setAddingSection(false);
    } finally {
      setAddingSectionBusy(false);
    }
  };

  return (
    <div className={cn(
      "sk-rise group rounded-[32px] border bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all self-start",
      open
        ? "border-[#cfc2d6]/25 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]"
        : "border-[#cfc2d6]/5 hover:border-[#8127cf]/10"
    )}>
      {/* div, not <button>: the Delete control below is itself a button, and
          nested interactive elements are invalid HTML (triggers a hydration
          mismatch). This reproduces button semantics/keyboard behavior without
          that constraint. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]/30 focus-visible:ring-offset-1",
          open ? "p-5" : "px-4 py-3"
        )}
        aria-expanded={open}
      >
        <div className="relative flex items-center gap-3 min-w-0">
          <div className={cn(
            "relative flex shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] shadow-sm transition-all",
            open ? "h-10 w-10" : "h-8 w-8"
          )}>
            <BookOpen className={cn("transition-all", open ? "h-5 w-5" : "h-4 w-4")} />
          </div>
          <div className="min-w-0">
            <p className={cn("truncate font-black text-[#1f1a23] transition-all", open ? "text-base" : "text-sm")}>
              {group.name}
            </p>
            {open ? (
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
                {group.academicYear} - {sectionless
                  ? "No sections"
                  : `${group.sections.length} section${group.sections.length === 1 ? "" : "s"}`} · {studentCount} student{studentCount === 1 ? "" : "s"} · {subjectCount} subject{subjectCount === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDeleteClass ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteClass(group.sections[0]); }}
              className="flex h-8 items-center gap-1 rounded-lg bg-rose-50 px-2 text-[8px] font-black uppercase tracking-wider text-rose-600 transition-all duration-200 hover:bg-rose-100 active:scale-95 cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          ) : null}
          <span className="text-[8px] font-black uppercase tracking-wider text-[#4d4354]/40">
            {group.sections.length} cls
          </span>
          <ChevronDown
            className={cn(
              "text-[#8127cf] transition-all duration-200",
              open ? "h-5 w-5 rotate-180" : "h-4 w-4"
            )}
          />
        </div>
      </div>

      {open ? (
        <div className="border-t border-[#cfc2d6]/10 p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Students" value={studentCount} active />
            <MiniMetric label="Subjects" value={subjectCount} />
          </div>
          {group.sections.map((cls) => (
            <SectionCard
              key={cls.id}
              cls={cls}
              teachers={teachers}
              classTeacherId={cls.classTeacher?.id || ""}
              students={(students || []).filter((s: any) => s.class?.id === cls.id || s.classId === cls.id)}
              onViewClass={onViewClass}
              onAddStudent={onAddStudent}
              onBulkImport={onBulkImport}
              onChangeTeacher={onChangeTeacher}
              onDeleteClass={onDeleteClass}
              onUpdateClass={onUpdateClass}
              onDeleteSubject={onDeleteSubject}
              onUpdateSubject={onUpdateSubject}
            />
          ))}
          <div className="pt-2">
            {addingSection ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder={sectionless ? "First section name (e.g. A)" : "Section name (e.g. C)"}
                  className="h-10 flex-1 rounded-xl bg-white border border-[#8127cf]/20 px-3 text-xs font-bold text-[#1f1a23] outline-none placeholder:text-[#4d4354]/30"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
                />
                <button
                  type="button"
                  onClick={handleAddSection}
                  disabled={addingSectionBusy || !newSectionName.trim()}
                  className="flex h-10 items-center gap-1 rounded-xl bg-[#8127cf] px-4 text-[9px] font-black uppercase tracking-wider text-white transition-all duration-200 hover:bg-[#6a1fad] active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {addingSectionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingSection(false); setNewSectionName(""); }}
                  className="flex h-10 items-center gap-1 rounded-xl bg-[#f3f4f9] px-4 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/60 transition-all duration-200 hover:bg-[#fbf0fe] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingSection(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#cfc2d6]/30 py-3 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/40 transition-all duration-200 hover:border-[#8127cf]/30 hover:text-[#8127cf] hover:bg-[#fbf0fe]/30 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {sectionless ? "Split into sections" : "Add Section"}
              </button>
            )}
            {sectionless && addingSection ? (
              <p className="mt-2 px-1 text-[9px] font-bold leading-relaxed text-[#4d4354]/50">
                This class currently has no sections. Naming one moves the existing
                students and subjects into it — nothing is lost.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SectionCard({
  cls,
  teachers,
  classTeacherId,
  students,
  onViewClass,
  onAddStudent,
  onBulkImport,
  onChangeTeacher,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
}: {
  cls: any;
  teachers: any[];
  classTeacherId: string;
  students: any[];
  onViewClass: (cls: any) => void;
  onAddStudent: (classId?: string) => void;
  onBulkImport?: (classId?: string) => void;
  onChangeTeacher: (classId: string, teacherId: string) => Promise<void>;
  onDeleteClass?: (cls: any) => void;
  onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>;
  onDeleteSubject?: (subject: any) => void;
  onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const subjectCount = cls.subjects?.length || cls._count?.subjects || 0;
  const studentCount = students.length || cls._count?.students || 0;
  const displayStudents = showAllStudents ? students : students.slice(0, 6);

  return (
    <div className="rounded-2xl bg-[#fbf0fe]/55 overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-[#1f1a23]">{cls.section ? `Section ${cls.section}` : "Whole class"}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
              <UserCheck className="h-3 w-3" />
              {cls.classTeacher?.fullName || "No class teacher"}
            </span>
            <span className="text-[#4d4354]/20">|</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">{studentCount} student{studentCount !== 1 ? "s" : ""}</span>
            <span className="text-[#4d4354]/20">|</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">{subjectCount} subject{subjectCount !== 1 ? "s" : ""}</span>
            <span
              className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#8127cf]"
              title={cls.teachingMode === "SUBJECT" ? "Each subject has its own teacher" : "The class teacher takes every subject"}
            >
              {cls.teachingMode === "SUBJECT" ? "Per subject" : "One teacher"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewClass(cls); }}
            className="flex h-8 items-center gap-1 rounded-lg bg-[#8127cf]/10 px-2.5 text-[8px] font-black uppercase tracking-wider text-[#8127cf] transition-all duration-200 hover:bg-[#8127cf] hover:text-white active:scale-95 cursor-pointer"
            title="Manage section: teachers, subjects, syllabus"
          >
            <Settings className="h-3 w-3" />
            Manage
          </button>
          {onDeleteClass ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteClass(cls); }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4d4354]/40 transition-all hover:bg-white hover:text-rose-500 cursor-pointer"
              title="Delete section"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onAddStudent ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddStudent(cls.id); }}
              className="h-8 cursor-pointer rounded-lg bg-white px-2 text-[8px] font-black uppercase tracking-wider text-[#8127cf] transition-all duration-200 hover:bg-[#8127cf] hover:text-white active:scale-95"
              title="Add a single student"
            >
              + Student
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8127cf] transition-all hover:bg-white cursor-pointer"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", detailsOpen && "rotate-180")} />
          </button>
        </div>
      </div>

      {detailsOpen ? (
        <div className="border-t border-[#cfc2d6]/10">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                Subjects ({subjectCount})
              </p>
            </div>
            {cls.subjects?.length ? (
              <div className="space-y-1.5">
                {cls.subjects.map((subject: any) => (
                  <div key={subject.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-[#1f1a23] truncate">{subject.name}</p>
                      <p className="text-[8px] font-bold uppercase tracking-wider text-[#4d4354]/40 mt-0.5">
                        {subject.teacher?.fullName || "No teacher"} · {subject.totalMarks || 100} marks
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[7px] font-black uppercase tracking-wider",
                        subject.teacher?.id ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                      )}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", subject.teacher?.id ? "bg-emerald-500" : "bg-amber-500")} />
                        {subject.teacher?.id ? "Assigned" : "Unassigned"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-white/70 px-3 py-2 text-[10px] font-bold text-[#4d4354]/45">
                No subjects yet. Click Manage to add subjects, assign teachers, and build the syllabus.
              </p>
            )}
          </div>

          <div className="border-t border-[#cfc2d6]/10 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 flex items-center gap-1">
                <GraduationCap className="h-3 w-3" />
                Students ({studentCount})
              </p>
              {students.length > 6 ? (
                <button
                  type="button"
                  onClick={() => setShowAllStudents(!showAllStudents)}
                  className="text-[8px] font-black uppercase tracking-wider text-[#8127cf] hover:underline cursor-pointer"
                >
                  {showAllStudents ? "Show Less" : `View All ${students.length}`}
                </button>
              ) : null}
            </div>
            {students.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5">
                {displayStudents.map((student: any) => (
                  <div key={student.id} className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2">
                    <div className="h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-[#fbf0fe] border border-white">
                      <img
                        src={student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-[#1f1a23] truncate">{student.fullName}</p>
                      <p className="text-[7px] font-bold uppercase tracking-wider text-[#4d4354]/35">Roll {student.rollNo || "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-white/70 px-3 py-2 text-[10px] font-bold text-[#4d4354]/45">
                No students enrolled yet. Click + Student to add.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminRow({ admin, currentUserId, onRemove }: { admin: any; currentUserId?: string; onRemove: () => void }) {
  const isCurrentUser = admin.id === currentUserId;

  return (
    <div className="group/row relative bg-gradient-to-br from-[#fbf0fe]/50 via-white to-[#fbf0fe]/20 p-5 rounded-[28px] border border-transparent transition-all duration-300 hover:border-[#8127cf]/15 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden">
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-gradient-to-bl from-[#8127cf]/6 to-transparent rounded-full blur-[50px] opacity-0 group-hover/row:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 min-w-0">
          <div className="relative shrink-0">
            <div className="absolute -inset-2 bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/8 rounded-2xl blur-md opacity-0 group-hover/row:opacity-100 transition-opacity duration-500" />
            <div className="relative h-14 w-14 rounded-2xl bg-white border-2 border-[#8127cf]/10 shadow-sm flex items-center justify-center overflow-hidden transition-all duration-300 group-hover/row:border-[#8127cf]/30 group-hover/row:shadow-md">
              <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(admin.email)}`} alt="" className="h-full w-full object-cover" />
            </div>
            <div className={`absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white ${isCurrentUser ? "bg-emerald-500" : "bg-[#8127cf]"}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-black text-[#1f1a23] tracking-tight leading-none truncate">{admin.fullName}</h4>
              {isCurrentUser && (
                <span className="shrink-0 inline-flex items-center rounded-full bg-gradient-to-r from-[#8127cf] to-[#b876f0] px-2 py-0.5 text-[7px] font-black uppercase tracking-wider text-white shadow-sm">
                  Owner
                </span>
              )}
            </div>
            <p className="text-[9px] font-bold text-[#4d4354]/45 uppercase tracking-wider leading-none mt-1 truncate">{admin.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-[#8127cf]/60">
                <Shield className="w-2.5 h-2.5" />
                {isCurrentUser ? "Current session" : formatStatus(admin.role)}
              </span>
            </div>
          </div>
        </div>
        {!isCurrentUser && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 h-10 rounded-xl bg-rose-50 px-4 text-[9px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5 justify-center border border-rose-100 transition-all hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md hover:shadow-rose-500/20 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}

export function CompactRoleRow({ icon: Icon, label, name, email }: { icon: any; label: string; name: string; email?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 flex items-center justify-center text-[#8127cf] shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[7px] font-black uppercase tracking-wider text-[#4d4354]/40">{label}</p>
        <p className="text-xs font-bold text-[#1f1a23] truncate">{name}</p>
      </div>
      {email ? (
        <p className="text-[9px] font-medium text-[#4d4354]/50 truncate hidden sm:block">{email}</p>
      ) : null}
    </div>
  );
}

export function PendingFacultyRow({ invite, onResend, onCancel }: { invite: any; onResend: () => void; onCancel: () => void }) {
  const expired = invite.expiresAt ? new Date() > new Date(invite.expiresAt) : false;
  const expiryLabel = invite.expiresAt
    ? new Date(invite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  const inviteName = invite.profile?.fullName || null;

  return (
    <div className="group/pending relative bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 p-5 rounded-[28px] border border-amber-200/60 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden">
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-gradient-to-bl from-amber-300/10 to-transparent rounded-full blur-[50px] pointer-events-none" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 min-w-0">
          <div className="relative shrink-0">
            <div className="absolute -inset-2 bg-amber-200/20 rounded-2xl blur-md opacity-0 group-hover/pending:opacity-100 transition-opacity duration-500" />
            <div className="relative h-14 w-14 rounded-2xl bg-white border-2 border-amber-200 shadow-sm flex items-center justify-center transition-all duration-300 group-hover/pending:border-amber-300 group-hover/pending:shadow-md">
              <Clock className={`w-6 h-6 ${expired ? "text-rose-500" : "text-amber-500"}`} />
            </div>
            <div className={`absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white ${expired ? "bg-rose-500" : "bg-amber-400"}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-black text-[#1f1a23] tracking-tight leading-none truncate">{inviteName || "Invitation pending"}</h4>
              <StatusPill status={expired ? "Expired" : formatStatus(invite.role)} />
            </div>
            <p className="text-[9px] font-bold text-[#4d4354]/50 uppercase tracking-wider leading-none mt-1 truncate">{invite.email}</p>
            {expiryLabel ? (
              <div className="flex items-center gap-1.5 mt-2">
                <Clock className={`w-2.5 h-2.5 ${expired ? "text-rose-500" : "text-amber-500"}`} />
                <span className={`text-[8px] font-black uppercase tracking-wider ${expired ? "text-rose-600" : "text-amber-600"}`}>
                  {expired ? "Expired" : "Expires"} {expiryLabel}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button type="button" onClick={onResend} className="h-10 rounded-xl bg-white px-4 text-[9px] font-black uppercase tracking-wider text-[#8127cf] flex items-center gap-1.5 justify-center border border-[#8127cf]/10 shadow-sm transition-all hover:bg-[#8127cf] hover:text-white hover:border-[#8127cf] hover:shadow-md hover:shadow-[#8127cf]/20 cursor-pointer">
            <Send className="w-3.5 h-3.5" />
            Resend
          </button>
          <button type="button" onClick={onCancel} className="h-10 rounded-xl bg-rose-50 px-4 text-[9px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5 justify-center border border-rose-100 transition-all hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md hover:shadow-rose-500/20 cursor-pointer">
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function FacultyRow({ teacher, onView, onRemove }: { teacher: any; onView: () => void; onRemove: () => void }) {
  const avatar = teacher.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teacher.fullName)}`;

  return (
    <div className="sk-rise group/faculty relative bg-gradient-to-br from-[#fbf0fe]/50 via-white to-[#fbf0fe]/20 p-5 rounded-[28px] border border-transparent transition-all duration-300 hover:border-[#8127cf]/15 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden">
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-gradient-to-bl from-[#8127cf]/6 to-transparent rounded-full blur-[50px] opacity-0 group-hover/faculty:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 min-w-0">
          <div className="relative shrink-0">
            <div className="absolute -inset-2 bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/8 rounded-2xl blur-md opacity-0 group-hover/faculty:opacity-100 transition-opacity duration-500" />
            <div className="relative h-12 w-12 bg-[#fbf0fe] rounded-xl overflow-hidden border-2 border-white shadow-sm flex items-center justify-center transition-all duration-300 group-hover/faculty:border-[#8127cf]/20 group-hover/faculty:shadow-md">
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            </div>
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-black text-[#1f1a23] tracking-tight leading-none mb-1 truncate">{teacher.fullName}</h4>
            <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-wider leading-none truncate">{teacher.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-emerald-600">
            {teacher._count?.taughtSubjects || 0} subjects
          </span>
          <button
            type="button"
            onClick={onView}
            className="h-9 rounded-xl bg-[#fbf0fe] px-4 text-[9px] font-black uppercase tracking-wider text-[#8127cf] flex items-center gap-1.5 justify-center hover:bg-[#8127cf] hover:text-white transition-all duration-200 active:scale-95 cursor-pointer"
          >
            View
          </button>
          <button type="button" onClick={onRemove} className="h-9 rounded-xl bg-rose-50 px-4 text-[9px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5 justify-center border border-rose-100 hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md hover:shadow-rose-500/20 transition-all duration-200 active:scale-95 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
            Revoke
          </button>
        </div>
      </div>
    </div>
  );
}

export function PanelTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-black tracking-tight text-[#1f1a23]">{title}</h3>
    </div>
  );
}

export function SnapshotColumn({ icon: Icon, title, after, children }: { icon: LucideIcon; title: string; after?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const childCount = useMemo(() => {
    let count = 0;
    if (Array.isArray(children)) {
      count = children.filter(Boolean).length;
    } else if (children) {
      count = 1;
    }
    return count;
  }, [children]);

  return (
    <div className={cn(
      "sk-rise group rounded-[32px] border bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all self-start",
      open
        ? "border-[#cfc2d6]/25 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]"
        : "border-[#cfc2d6]/5 hover:border-[#8127cf]/10"
    )}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-4 text-left transition-all",
          open ? "p-5" : "px-4 py-3"
        )}
        aria-expanded={open}
      >
        <div className="relative flex items-center gap-3 min-w-0">
          <div className="absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[#8127cf]/18" />
          <div className={cn(
            "relative flex shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf] shadow-sm transition-all",
            open ? "h-10 w-10" : "h-8 w-8"
          )}>
            <Icon className={cn("transition-all", open ? "h-5 w-5" : "h-4 w-4")} />
          </div>
          <div className="min-w-0">
            <p className={cn("truncate font-black text-[#1f1a23] transition-all", open ? "text-base" : "text-sm")}>
              {title}
            </p>
            {open ? (
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
                {childCount} item{childCount === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {open ? null : (
            <span className="text-[8px] font-black uppercase tracking-wider text-[#4d4354]/40">
              {childCount} items
            </span>
          )}
          <ChevronDown
            className={cn(
              "text-[#8127cf] transition-all duration-200",
              open ? "h-5 w-5 rotate-180" : "h-4 w-4"
            )}
          />
        </div>
      </button>

      {open ? (
        <div className="border-t border-[#cfc2d6]/10 p-5">
          {after ? (
            <div className="mb-3 flex justify-end">{after}</div>
          ) : null}
          <div className="space-y-3">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

export function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#fbf0fe]/60 px-4 py-3 transition-colors duration-200 hover:bg-[#fbf0fe]">
      <span className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/45">{label}</span>
      <span className="truncate text-sm font-black text-[#1f1a23]">{value}</span>
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3 transition-colors duration-200 hover:bg-white">
      <span className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40 shrink-0">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-bold text-[#1f1a23]">{value}</span>
    </div>
  );
}

export function MiniMetric({ label, value, active }: { label: string; value: any; active?: boolean }) {
  return (
    <div className={cn(
      "rounded-2xl px-4 py-3.5 transition-all duration-200",
      active ? "bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] shadow-sm" : "bg-[#fbf0fe]/60"
    )}>
      <p className="text-[8px] font-black uppercase tracking-wider text-[#4d4354]/40 leading-none">{label}</p>
      <p className={cn("mt-1.5 truncate text-base font-black leading-none", active ? "text-[#8127cf]" : "text-[#1f1a23]")}>{value}</p>
    </div>
  );
}

export function StatusPill({ status }: { status?: string }) {
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-wider transition-all duration-200",
      statusTone(status)
    )}>
      {formatStatus(status)}
    </span>
  );
}

export function EmptyInline({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#fbf0fe]/60 to-[#f3eeff]/40 border border-[#cfc2d6]/8 p-5 text-center">
      <p className="text-sm font-semibold text-[#4d4354]/50 leading-relaxed">{text}</p>
    </div>
  );
}


export function ActivityLogModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filter !== "all") params.set("tableName", filter);
      const res = await fetch(`/api/audit-log?${params}`);
      const result = await res.json();
      if (res.ok) setLogs(result.data || []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [filter]);

  const filtered = logs;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pagedLogs = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  useEffect(() => { setPage(1); }, [filter]);

  const tableOptions = [
    { value: "all", label: "All Events" },
    { value: "student", label: "Students" },
    { value: "class", label: "Classes" },
    { value: "subject", label: "Subjects" },
    { value: "invitation", label: "Invitations" },
    { value: "marks", label: "Marks" },
  ];

  function describeLog(log: any): { label: string; detail: string; userName: string } {
    const userName = log.user?.fullName || log.user?.email || "System";
    const table = log.tableName.replace(/_/g, " ");
    const isCreate = !log.oldValue;
    const isDelete = !log.newValue;
    const oldV = log.oldValue || {};
    const newV = log.newValue || {};

    if (table === "student") {
      const name = newV.fullName || oldV.fullName || "a student";
      if (isCreate) return { label: `Added ${name}`, detail: `Roll ${newV.rollNo || ""}`, userName };
      if (oldV.classId && newV.classId && oldV.classId !== newV.classId)
        return { label: `Moved ${name}`, detail: `Class changed`, userName };
      return { label: `Updated ${name}`, detail: "", userName };
    }
    if (table === "class") {
      const name = newV.name || oldV.name || "";
      const section = newV.section || oldV.section || "";
      if (isCreate) return { label: `Created class ${name}`, detail: `Section ${section}, ${newV.academicYear || ""}`, userName };
      const oldTeacher = oldV.classTeacherId;
      const newTeacher = newV.classTeacherId;
      if (oldTeacher !== undefined && newTeacher !== undefined && oldTeacher !== newTeacher)
        return { label: `Changed teacher for ${name}`, detail: `Teacher assigned`, userName };
      return { label: `Updated class ${name}`, detail: `Section ${section}`, userName };
    }
    if (table === "subject") {
      const name = newV.name || oldV.name || "";
      if (isCreate) return { label: `Added subject ${name}`, detail: "", userName };
      if (isDelete) return { label: `Removed subject ${name}`, detail: "", userName };
      const oldT = oldV.teacherId;
      const newT = newV.teacherId;
      if (oldT !== newT)
        return { label: `Changed teacher for ${name}`, detail: newT ? `Teacher assigned` : "Unassigned", userName };
      return { label: `Updated subject ${name}`, detail: "", userName };
    }
    if (table === "invitation") {
      const email = newV.email || oldV.email || "";
      const role = newV.role || oldV.role || "";
      if (isCreate) return { label: `Invited ${role?.replace(/_/g, " ")}`, detail: email, userName };
      return { label: `Updated invitation`, detail: email, userName };
    }
    if (table === "marks") {
      return { label: `Entered marks`, detail: `${Object.keys(newV).length} subjects`, userName };
    }
    return { label: `${isCreate ? "Created" : isDelete ? "Deleted" : "Updated"} ${table}`, detail: "", userName };
  }

  return (
    <ModalFrame title="Activity Log" eyebrow="Campus audit trail" onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1">
          {tableOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer",
                filter === opt.value ? "bg-white text-[#8127cf] shadow-sm" : "text-[#4d4354]/50 hover:text-[#8127cf]"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-[9px] font-bold text-[#4d4354]/40">{filtered.length} entries</span>
      </div>

      {loading ? (
        <div className="space-y-2 animate-skeleton-in">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-[#fbf0fe]/50 px-4 py-3 animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5 flex-1">
                  <div className="h-3 w-32 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                  <div className="h-2 w-20 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
                  <div className="h-2 w-16 rounded-full bg-[#e8e0ec]/25 skeleton-shimmer" />
                </div>
                <div className="h-2 w-14 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer shrink-0" />
              </div>
            </div>
          ))}
        </div>
      ) : pagedLogs.length === 0 ? (
        <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-[#4d4354]/55">No activity recorded yet.</p>
      ) : (
        <>
          <div className="max-h-80 overflow-y-auto custom-scrollbar space-y-2">
            {pagedLogs.map((log) => {
              const { label, detail, userName } = describeLog(log);
              return (
                <div key={log.id} className="rounded-2xl bg-[#fbf0fe]/50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-[#1f1a23]">{label}</p>
                      {detail ? (
                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
                          {detail}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/35">
                        by {userName}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[9px] font-bold text-[#4d4354]/40">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="flex h-9 items-center gap-1 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/60 transition-all duration-200 hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95"
              >
                Previous
              </button>
              <span className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="flex h-9 items-center gap-1 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/60 transition-all duration-200 hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95"
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </ModalFrame>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalFrame title="Help Center" eyebrow="Campus support" onClose={onClose}>
      <div className="space-y-5">
        <div className="rounded-3xl bg-[#fbf0fe]/65 p-5">
          <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">Getting Started</p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-[#4d4354]/70">
            This is your campus admin workspace. From here you can manage classes, teachers, students, exams, and AI-powered insights.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 transition-all duration-200 hover:border-[#8127cf]/15 hover:shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">Classes</p>
            <p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Add classes with sections, assign class teachers, create subjects, and enroll students.</p>
          </div>
          <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 transition-all duration-200 hover:border-[#8127cf]/15 hover:shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">Teachers</p>
            <p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Invite teachers, assign them to subjects or as class teachers, and manage their access.</p>
          </div>
          <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 transition-all duration-200 hover:border-[#8127cf]/15 hover:shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">Students</p>
            <p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Add students individually or via CSV bulk import. Track report cards and move between classes.</p>
          </div>
          <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 transition-all duration-200 hover:border-[#8127cf]/15 hover:shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">Exams & Reports</p>
            <p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Create exam cycles, enter marks from teacher dashboards, and generate report cards.</p>
          </div>
        </div>
        <div className="rounded-3xl bg-[#fbf0fe]/50 p-5">
          <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Need more help?</p>
          <p className="mt-1 text-xs font-semibold text-[#4d4354]/55">
            Contact your school administration for advanced support. Additional documentation and FAQs are available through your school&apos;s IT department.
          </p>
        </div>
      </div>
    </ModalFrame>
  );
}

/**
 * Chip-based editor for a teacher's subject specialities.
 *
 * Free text rather than a fixed list, because subject naming varies by school
 * ("Maths" vs "Mathematics") and specialities aren't always real subject rows.
 * The "teaches all subjects" toggle covers generalists (primary class teachers),
 * for whom an out-of-speciality warning would just be noise.
 */
export function SpecialtyEditor({
  specialties,
  teachesAll,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  onToggleAll,
}: {
  specialties: string[];
  teachesAll: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  onToggleAll: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/40 p-4">
      <p className="mb-2 pl-1 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
        Teaching specialities
      </p>

      <button
        type="button"
        onClick={onToggleAll}
        className="mb-3 flex w-full cursor-pointer items-center gap-3 rounded-xl bg-white p-3 text-left transition-all hover:shadow-sm"
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
            teachesAll ? "border-emerald-500 bg-emerald-500" : "border-[#cfc2d6]/50 bg-white"
          )}
        >
          {teachesAll ? <Check className="h-3 w-3 text-white" strokeWidth={3.5} /> : null}
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-black text-[#1f1a23]">Can teach all subjects</span>
          <span className="block text-[9px] font-bold text-[#4d4354]/50">
            Generalist — never warned about subject mismatch.
          </span>
        </span>
      </button>

      {!teachesAll ? (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {specialties.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-[#8127cf]/10 px-2.5 py-1 text-[9px] font-black text-[#8127cf]"
              >
                {s}
                <button
                  type="button"
                  onClick={() => onRemove(s)}
                  className="cursor-pointer text-[#8127cf]/60 transition-colors hover:text-rose-500"
                  aria-label={`Remove ${s}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {specialties.length === 0 ? (
              <span className="text-[9px] font-bold text-[#4d4354]/40">
                No specialities yet — add the subjects this teacher is qualified for.
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdd(draft);
                }
              }}
              placeholder="e.g. Mathematics"
              className="h-10 flex-1 rounded-xl border border-[#cfc2d6]/25 bg-white px-3 text-xs font-bold text-[#1f1a23] outline-none transition-all placeholder:text-[#4d4354]/30 focus:border-[#8127cf]/40"
            />
            <button
              type="button"
              onClick={() => onAdd(draft)}
              className="h-10 shrink-0 cursor-pointer rounded-xl bg-[#8127cf] px-4 text-[10px] font-black uppercase tracking-wider text-white transition-all hover:bg-[#9c48ea] active:scale-95"
            >
              Add
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
