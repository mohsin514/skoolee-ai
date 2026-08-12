"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  Archive,
  Award,
  Banknote,
  BookOpen,
  Briefcase,
  Building,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  DoorOpen,
  Download,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  Heart,
  History,
  Landmark,
  LayoutGrid,
  Layers,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  Pencil,
  Phone,
  PhoneCall,
  Plane,
  Plus,
  Printer,
  RotateCcw,
  School,
  Send,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  User,
  UserCheck,
  Users,
  Upload,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { AiActionPanel, AIReviewQueue, BrandButton, EmptyState } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { CornerSparkles } from "@/components/CornerSparkles";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { TeacherPicker, useTeacherAvailability } from "@/components/shared-admin/teacher-picker";
export { TeacherConflictsBanner } from "@/components/shared-admin/teacher-conflicts-banner";
import { SubjectSyllabus } from "@/components/shared-admin/subject-syllabus";
import { AvatarImage } from "@/components/ui/avatar-image";

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
  onInviteAccountant,
  onInviteLibrarian,
  onInviteReceptionist,
  onRemove,
  onResend,
  onCancel,
  onActivityLog,
}: {
  data: any;
  onInviteAdmin: () => void;
  onInvitePrincipal: () => void;
  onInviteAccountant?: () => void;
  onInviteLibrarian?: () => void;
  onInviteReceptionist?: () => void;
  onRemove: (id: string, label: string) => void;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
  onActivityLog?: () => void;
}) {
  const adminCount = data.campusAdmins?.length || 0;
  const principalAssigned = data.principal ? 1 : 0;
  const pendingCount = data.pendingAdminInvitations?.length || 0;
  const opsCount = data.operationsStaff?.length || 0;
  const totalRoles = adminCount + principalAssigned + pendingCount + opsCount || 1;

  const donutData = [
    { name: "Admins", value: adminCount, color: "#8127cf" },
    { name: "Principal", value: principalAssigned, color: "#10b981" },
    { name: "Operations", value: opsCount, color: "#3b82f6" },
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
                    { label: "Operations", value: opsCount, color: "#3b82f6" },
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

          {/* Operations Staff Card */}
          <div className="bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Operations</p>
                <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Operations Staff</h3>
              </div>
              <div className="flex items-center gap-2">
                {opsCount > 0 ? (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-blue-600">
                    {opsCount} active
                  </span>
                ) : null}
              </div>
            </div>
            <div className="space-y-3">
              {data.operationsStaff?.map((staff: any) => (
                <div key={staff.id} className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#fbf0fe]/30 via-white to-blue-50/30 px-4 py-3 border border-transparent hover:border-blue-100 transition-all">
                  <div className="relative shrink-0">
                    <div className="h-10 w-10 rounded-xl bg-white border border-blue-100 shadow-sm flex items-center justify-center overflow-hidden">
                      <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(staff.email)}`} alt="" className="h-full w-full object-cover" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-[#1f1a23] truncate">{staff.fullName}</h4>
                    <p className="text-[9px] font-bold text-[#4d4354]/45 uppercase tracking-wider truncate">{staff.email}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-blue-600">
                    {staff.role}
                  </span>
                  <button type="button" onClick={() => onRemove(staff.id, staff.role)}
                    className="shrink-0 h-8 rounded-lg bg-rose-50 px-3 text-[9px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1 justify-center border border-rose-100 transition-all hover:bg-rose-500 hover:text-white cursor-pointer">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {data.pendingOperationsInvitations?.map((invite: any) => (
                <PendingFacultyRow key={invite.id} invite={invite} onResend={() => onResend(invite.id)} onCancel={() => onCancel(invite.id)} />
              ))}
              {!data.operationsStaff?.length && !data.pendingOperationsInvitations?.length ? (
                <div className="flex items-center justify-center h-16 rounded-2xl bg-blue-50/30">
                  <p className="text-xs font-bold text-[#4d4354]/40">No operations staff assigned yet</p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {onInviteAccountant ? (
                <BrandButton variant="soft" icon={<Plus className="w-3 h-3" />} onClick={onInviteAccountant}>
                  Add Accountant
                </BrandButton>
              ) : null}
              {onInviteLibrarian ? (
                <BrandButton variant="soft" icon={<Plus className="w-3 h-3" />} onClick={onInviteLibrarian}>
                  Add Librarian
                </BrandButton>
              ) : null}
              {onInviteReceptionist ? (
                <BrandButton variant="soft" icon={<Plus className="w-3 h-3" />} onClick={onInviteReceptionist}>
                  Add Receptionist
                </BrandButton>
              ) : null}
            </div>
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
      } catch { if (!cancelled) toast.error("Failed to load exam data"); }
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

export function ExamCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [classes, setClasses] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState("");
  const [term, setTerm] = useState("Mid Term");
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [examType, setExamType] = useState("MID_TERM");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/classes")
      .then((r) => r.json())
      .then((j) => {
        const list = j.success ? (j.data || []) : (Array.isArray(j) ? j : []);
        setClasses(list);
        if (list.length === 1) setClassId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !classId) {
      toast.error("Exam title and class are required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), classId, term, academicYear: Number(academicYear) || new Date().getFullYear(), examType }),
      });
      const result = await res.json();
      if (!res.ok) {
        const err = result.error || "Failed to create exam";
        throw new Error(typeof err === "string" ? err : JSON.stringify(err));
      }
      await onCreated();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalFrame title="New Exam Cycle" eyebrow="Exams & Grading" onClose={onClose}>
      <div className="space-y-5">
        <FormInput label="Exam Title" value={title} placeholder="e.g. Final Term 2026" onChange={setTitle} />
        <div className="grid grid-cols-2 gap-4">
          <FormSelect label="Class" value={classId} onChange={setClassId}>
            <option value="">— Select class —</option>
            {classes.map((c: any) => (
              <option key={c.id} value={c.id}>
                {classLabel(c)}
              </option>
            ))}
          </FormSelect>
          <FormInput label="Academic Year" type="number" placeholder="e.g. 2026" value={academicYear} onChange={setAcademicYear} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormSelect label="Term" value={term} onChange={setTerm}>
            {["Mid Term", "Final Term", "Quiz", "Class Test", "Custom"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </FormSelect>
          <FormSelect label="Exam Type" value={examType} onChange={setExamType}>
            <option value="MID_TERM">Mid Term</option>
            <option value="FINAL">Final</option>
            <option value="CLASS_TEST">Class Test</option>
            <option value="QUIZ">Quiz</option>
            <option value="CUSTOM">Custom</option>
          </FormSelect>
        </div>
        {classes.length === 0 && (
          <p className="text-[10px] font-semibold text-amber-600">
            No classes found. Create a class first, then add an exam cycle.
          </p>
        )}
        <ModalActions busy={busy} busyLabel="Creating..." actionLabel="Create Exam Cycle" onClose={onClose} onSave={handleCreate} />
      </div>
    </ModalFrame>
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
  const [fetchedExams, setFetchedExams] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (exams.length > 0) return;
    fetch("/api/exams")
      .then((r) => r.json())
      .then((j) => { if (j.success) setFetchedExams(j.exams || []); })
      .catch(() => {});
  }, [exams.length]);

  const allExams = useMemo(() => {
    if (exams.length > 0) {
      const extra = fetchedExams.filter((f) => !exams.some((e) => e.id === f.id));
      return extra.length ? [...exams, ...extra] : exams;
    }
    return fetchedExams;
  }, [exams, fetchedExams]);

  const displayExams = showAllExams ? allExams : allExams.slice(0, 12);

  const refreshExams = async () => {
    try {
      const res = await fetch("/api/exams");
      const j = await res.json();
      if (j.success) setFetchedExams(j.exams || []);
    } catch { toast.error("Failed to load exams"); }
  };

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
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">{allExams.length} Exam{allExams.length !== 1 ? "s" : ""}</p>
          <h3 className="text-lg font-bold text-[#1d1b20] mt-0.5">Exam Cycles</h3>
        </div>
        <div className="flex items-center gap-3">
          {allExams.length > 12 && (
            <button type="button" onClick={() => setShowAllExams(!showAllExams)}
              className="text-[9px] font-black uppercase tracking-wider text-[#8127cf] hover:underline cursor-pointer">
              {showAllExams ? "Show Less" : `View All (${allExams.length})`}
            </button>
          )}
          <BrandButton icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            New Exam Cycle
          </BrandButton>
        </div>
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
      {allExams.length === 0 ? (
        <div className="sk-rise flex items-center justify-center h-32 rounded-[28px] bg-white border border-[#cfc2d6]/25">
          <p className="text-xs font-bold text-[#4d4354]/40">No exam cycles available yet.</p>
        </div>
      ) : null}
      {createOpen && (
        <ExamCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            await refreshExams();
            toast.success("Exam cycle created");
          }}
        />
      )}
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
                        <AvatarImage src={avatar} alt="Student photo" className="h-full w-full object-cover transition-transform duration-500 group-hover/student:scale-110" />
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
                        {student.category?.name ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                            {student.category.name}
                          </span>
                        ) : null}
                        {student.group?.name ? (
                          <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-sky-600">
                            {student.group.name}
                          </span>
                        ) : null}
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
                  <AvatarImage src={cls.classTeacher.profileImageUrl} alt="Teacher photo" />
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
  const [tags, setTags] = useState<{ categories: any[]; groups: any[] }>({ categories: [], groups: [] });
  const [profileTab, setProfileTab] = useState<"overview" | "siblings" | "documents" | "timeline">("overview");
  const [siblingsVersion, setSiblingsVersion] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/student-categories").then((r) => r.json()),
      fetch("/api/student-groups").then((r) => r.json()),
    ])
      .then(([cats, grps]) => {
        if (!active) return;
        setTags({
          categories: cats.success ? cats.data : [],
          groups: grps.success ? grps.data : [],
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [student.id]);

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
      categoryId: student.category?.id || "",
      groupId: student.group?.id || "",
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
    updates.categoryId = edits.categoryId || null;
    updates.groupId = edits.groupId || null;
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

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {([
          ["overview", "Overview", User],
          ["siblings", "Siblings", Users],
          ["documents", "Documents", FileText],
          ["timeline", "Timeline", History],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setProfileTab(key)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer",
              profileTab === key
                ? "bg-[#8127cf] text-white shadow-lg shadow-[#8127cf]/20"
                : "bg-[#fbf0fe]/70 text-[#4d4354]/60 hover:bg-[#f0e0f8] hover:text-[#8127cf]"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {profileTab !== "overview" ? (
        <StudentAdmissionsPanel
          student={student}
          tab={profileTab}
          onUpdate={onUpdate}
          version={siblingsVersion}
          onVersionBump={() => setSiblingsVersion((v) => v + 1)}
        />
      ) : (
      <>
      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-[#fbf0fe]/65 p-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <AvatarImage src={avatar} />
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
              <div className="grid grid-cols-2 gap-3">
                <FormSelect label="Category" value={ed("categoryId")} onChange={(v) => setEd("categoryId", v)}>
                  <option value="">No category</option>
                  {tags.categories
                    .filter((c) => c.isActive !== false || c.id === student.category?.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </FormSelect>
                <FormSelect label="Group" value={ed("groupId")} onChange={(v) => setEd("groupId", v)}>
                  <option value="">No group</option>
                  {tags.groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </FormSelect>
              </div>
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
              <DetailRow label="Category" value={student.category?.name || "None"} />
              <DetailRow label="Group" value={student.group?.name || "None"} />
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
      </>
      )}

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

export function StudentAdmissionsPanel({
  student,
  tab,
  onUpdate,
  version,
  onVersionBump,
}: {
  student: any;
  tab: "siblings" | "documents" | "timeline";
  onUpdate: (studentId: string, updates: Record<string, any>) => Promise<void>;
  version: number;
  onVersionBump: () => void;
}) {
  const [siblings, setSiblings] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadKind, setUploadKind] = useState("BIRTH_CERTIFICATE");
  const fileInput = useRef<HTMLInputElement>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<any[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      tab === "siblings"
        ? fetch(`/api/students/siblings?studentId=${encodeURIComponent(student.id)}`).then((r) => r.json())
        : Promise.resolve({ success: true, data: [] }),
      tab === "documents"
        ? fetch(`/api/students/documents?studentId=${encodeURIComponent(student.id)}`).then((r) => r.json())
        : Promise.resolve({ success: true, data: [] }),
      tab === "timeline"
        ? fetch(`/api/students/timeline?studentId=${encodeURIComponent(student.id)}`).then((r) => r.json())
        : Promise.resolve({ success: true, data: [] }),
    ])
      .then(([sib, doc, tl]) => {
        if (!active) return;
        if (sib.success) setSiblings(sib.data || []);
        if (doc.success) setDocuments(doc.data || []);
        if (tl.success) setTimeline(tl.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [student.id, tab, version]);

  const uploadFile = async (file: File) => {
    const kindsLabel: Record<string, string> = {
      BIRTH_CERTIFICATE: "Birth certificate",
      TRANSFER_CERTIFICATE: "Transfer certificate",
      PHOTO: "Photo",
      OTHER: "Other",
    };
    const safeName = file.name.replace(/[^\w.\- ]/g, "_");
    setUploading(true);
    try {
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          fileName: safeName,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presign.success) throw new Error(presign.error || "Presign failed");

      const putRes = await fetch(presign.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      const recRes = await fetch("/api/students/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          kind: uploadKind,
          fileKey: presign.data.key,
          fileName: safeName,
        }),
      });
      const rec = await recRes.json();
      if (!rec.success) throw new Error(rec.error || "Could not save document");

      toast.success(`${kindsLabel[uploadKind] ?? "Document"} uploaded`);
      onVersionBump();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const deleteDocument = async (doc: any) => {
    try {
      const res = await fetch(`/api/students/documents?id=${encodeURIComponent(doc.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Delete failed");
      toast.success("Document deleted");
      onVersionBump();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const addNote = async () => {
    if (!noteDraft.trim()) return;
    setNoteBusy(true);
    try {
      const res = await fetch("/api/students/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, title: noteDraft.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not add note");
      setNoteDraft("");
      toast.success("Note added to timeline");
      onVersionBump();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add note");
    } finally {
      setNoteBusy(false);
    }
  };

  const linkSiblings = async (targetId: string) => {
    setLinkBusy(true);
    try {
      await onUpdate(student.id, { siblingStudentId: targetId });
      onVersionBump();
      toast.success("Linked as siblings");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Link failed");
    } finally {
      setLinkBusy(false);
    }
  };

  const kindLabel = (kind: string) => {
    const map: Record<string, string> = {
      BIRTH_CERTIFICATE: "Birth Certificate",
      TRANSFER_CERTIFICATE: "Transfer Certificate",
      PHOTO: "Photo",
      OTHER: "Other",
    };
    return map[kind] || kind;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm font-bold text-[#4d4354]/50">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (tab === "siblings") {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Users} title="Siblings" />
          {siblings.length === 0 ? (
            <div className="mt-4">
              <EmptyInline text="Not linked to any siblings yet. Link the student to a sibling below (or pick the guardian when admitting a new child — the group auto-links)." />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {siblings.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3">
                  <div>
                    <p className="text-sm font-black text-[#1f1a23]">
                      {s.id === student.id ? `${s.fullName} (this student)` : s.fullName}
                    </p>
                    <p className="text-xs font-semibold text-[#4d4354]/55">
                      {s.rollNo || "No roll"} · {classLabel(s.class)}
                    </p>
                  </div>
                  {s.id !== student.id ? (
                    <span className="rounded-full bg-[#8127cf]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
                      Sibling
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={UserCheck} title="Link a sibling" />
          <div className="mt-4 space-y-3">
            <FormInput
              label="Search a student by name, roll or admission no."
              value={linkSearch}
              placeholder="e.g. Ahmed or ALG-A-001"
              onChange={(v) => {
                setLinkSearch(v);
                const q = v.trim().toLowerCase();
                fetch(`/api/students?search=${encodeURIComponent(q)}&limit=6`)
                  .then((r) => r.json())
                  .then((j) => {
                    if (j.success) {
                      setLinkResults((j.data || []).filter((s: any) => s.id !== student.id));
                    }
                  })
                  .catch(() => {});
              }}
            />
            {linkResults.length > 0 ? (
              <div className="space-y-2">
                {linkResults.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-[#1f1a23]">{s.fullName}</p>
                      <p className="text-xs font-semibold text-[#4d4354]/55">{s.rollNo} · {classLabel(s.class)}</p>
                    </div>
                    <BrandButton variant="soft" className="h-8 px-3 text-[10px]" onClick={() => linkSiblings(s.id)} disabled={linkBusy}>
                      {linkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Link"}
                    </BrandButton>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-semibold text-[#4d4354]/45">Type at least 2 characters to search.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (tab === "documents") {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={FileText} title="Admission Documents" />
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-48">
              <FormSelect label="Document type" value={uploadKind} onChange={setUploadKind}>
                {["BIRTH_CERTIFICATE", "TRANSFER_CERTIFICATE", "PHOTO", "OTHER"].map((k) => (
                  <option key={k} value={k}>{kindLabel(k)}</option>
                ))}
              </FormSelect>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
              }}
            />
            <BrandButton
              variant="dark"
              className="h-14"
              icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Upload (max 10 MB)"}
            </BrandButton>
          </div>
        </div>

        {documents.length === 0 ? (
          <EmptyInline text="No documents uploaded yet." />
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#1f1a23]">{doc.fileName}</p>
                  <p className="text-xs font-semibold text-[#4d4354]/55">
                    {kindLabel(doc.kind)} · {formatDate(doc.uploadedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {doc.downloadUrl ? (
                    <a
                      href={doc.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-8 items-center gap-1.5 rounded-xl bg-[#fbf0fe] px-3 text-[10px] font-black uppercase tracking-wider text-[#8127cf] hover:bg-[#8127cf] hover:text-white transition-all"
                    >
                      <Download className="h-3 w-3" />View
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => deleteDocument(doc)}
                    className="flex h-8 items-center gap-1.5 rounded-xl bg-rose-50 px-3 text-[10px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-100 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
        <PanelTitle icon={History} title="Timeline" />
        <div className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <FormInput label="Add a note" value={noteDraft} placeholder="e.g. Fee discount applied, meeting held…" onChange={setNoteDraft} />
          </div>
          <BrandButton variant="dark" className="h-10" icon={<Plus className="h-4 w-4" />} onClick={addNote} disabled={noteBusy || !noteDraft.trim()}>
            {noteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </BrandButton>
        </div>
      </div>

      {timeline.length === 0 ? (
        <EmptyInline text="No timeline events yet. Admissions, class transfers, fee payments and document uploads are recorded here automatically." />
      ) : (
        <div className="space-y-0">
          {timeline.map((ev, idx) => (
            <div key={ev.id} className="relative flex gap-3 pl-5">
              {idx < timeline.length - 1 ? <div className="absolute left-[5px] top-5 h-full w-px bg-[#cfc2d6]/40" /> : null}
              <div className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#8127cf] bg-white" />
              <div className="pb-4">
                <p className="text-sm font-bold text-[#1f1a23]">{ev.title}</p>
                {ev.detail ? <p className="text-xs font-semibold text-[#4d4354]/55">{ev.detail}</p> : null}
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/40">
                  {ev.kind} · {formatDate(ev.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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

  // ── Staff Records (payroll / bank / documents / timeline) ──
  const isStaffAdmin = Boolean(onUpdate);
  const [staff, setStaff] = useState<any>(null);
  const [staffDocs, setStaffDocs] = useState<any[]>([]);
  const [staffTimeline, setStaffTimeline] = useState<any[]>([]);
  const [editStaff, setEditStaff] = useState(false);
  const [staffForm, setStaffForm] = useState<Record<string, string>>({});
  const [staffSaving, setStaffSaving] = useState(false);
  const [allowances, setAllowances] = useState<{ name: string; amount: string }[]>([]);
  const [deductions, setDeductions] = useState<{ name: string; amount: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadKind, setUploadKind] = useState("CV");
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadStaffRecords = useCallback(async () => {
    if (!isStaffAdmin) return;
    try {
      const res = await fetch(`/api/staff/profile?userId=${encodeURIComponent(teacher.id)}`);
      const json = await res.json();
      if (!json.success) return;
      setStaff(json.data);
      setStaffDocs(json.data.staffDocuments || []);
      setStaffTimeline(json.data.staffTimelineEvents || []);
    } catch {
    }
  }, [isStaffAdmin, teacher.id]);

  useEffect(() => {
    loadStaffRecords();
  }, [loadStaffRecords]);

  const openStaffEditor = () => {
    const p = staff?.staffProfile || {};
    setStaffForm({
      designation: p.designation || "",
      contractType: p.contractType || "",
      basicSalary: String((p.basicSalary ?? 0) / 100),
      bankAccountName: p.bankAccountName || "",
      bankAccountNumber: p.bankAccountNumber || "",
      bankName: p.bankName || "",
    });
    setAllowances(
      Object.entries((p.allowancesJson as Record<string, number>) || {}).map(([name, amount]) => ({
        name,
        amount: String(amount / 100),
      }))
    );
    setDeductions(
      Object.entries((p.deductionsJson as Record<string, number>) || {}).map(([name, amount]) => ({
        name,
        amount: String(amount / 100),
      }))
    );
    setEditStaff(true);
  };

  const saveStaff = async () => {
    setStaffSaving(true);
    try {
      const toObject = (rows: { name: string; amount: string }[]) => {
        const out: Record<string, number> = {};
        for (const row of rows) {
          const name = row.name.trim();
          const amount = Math.round(Number(row.amount) * 100);
          if (name && Number.isFinite(amount) && amount !== 0) out[name] = amount;
        }
        return out;
      };
      const res = await fetch("/api/staff/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: teacher.id,
          designation: staffForm.designation,
          contractType: staffForm.contractType,
          basicSalary: Math.round(Number(staffForm.basicSalary) * 100) || 0,
          allowances: toObject(allowances),
          deductions: toObject(deductions),
          bankAccountName: staffForm.bankAccountName,
          bankAccountNumber: staffForm.bankAccountNumber,
          bankName: staffForm.bankName,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not save staff record");
      toast.success(json.events ? `Saved (${json.events} change${json.events === 1 ? "" : "s"} logged)` : "Staff record saved");
      setEditStaff(false);
      await loadStaffRecords();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setStaffSaving(false);
    }
  };

  const uploadStaffDoc = async (file: File) => {
    const safeName = file.name.replace(/[^\w.\- ]/g, "_");
    setUploading(true);
    try {
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: teacher.id,
          fileName: safeName,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presign.success) throw new Error(presign.error || "Presign failed");

      const putRes = await fetch(presign.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      const recRes = await fetch("/api/staff/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: teacher.id,
          kind: uploadKind,
          fileKey: presign.data.key,
          fileName: safeName,
        }),
      });
      const rec = await recRes.json();
      if (!rec.success) throw new Error(rec.error || "Could not save document");
      toast.success("Document uploaded");
      await loadStaffRecords();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const deleteStaffDoc = async (doc: any) => {
    setDocBusy(doc.id);
    try {
      const res = await fetch(`/api/staff/documents?id=${encodeURIComponent(doc.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Delete failed");
      toast.success("Document deleted");
      await loadStaffRecords();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDocBusy(null);
    }
  };

  const rupee = (paisa: number) => `Rs. ${(paisa / 100).toLocaleString("en-PK")}`;
  const maskAccount = (num: string) =>
    num.length <= 4 ? (num ? "••••" : "") : `•••• •••• ${num.slice(-4)}`;
  const formatStaffDate = (d: any) => {
    if (!d) return "N/A";
    try { return new Date(d).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" }); } catch { return "N/A"; }
  };

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
          <AvatarImage src={avatar} />
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

      {isStaffAdmin ? (
        <div className="mt-6 rounded-3xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#55208b] text-white shadow-[0_6px_16px_-4px_rgba(129,39,207,0.5)]">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-black tracking-tight text-[#1f1a23]">Staff Records</h3>
                <p className="text-[11px] font-bold text-[#4d4354]/55">Payroll · Bank · Documents · Timeline</p>
              </div>
            </div>
            <BrandButton
              variant={editStaff ? "soft" : "dark"}
              icon={editStaff ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              onClick={editStaff ? () => setEditStaff(false) : openStaffEditor}
            >
              {editStaff ? "Cancel Edit" : staff?.staffProfile ? "Edit Staff Record" : "Set Up Staff Record"}
            </BrandButton>
          </div>

          {editStaff ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-3xl bg-white/80 p-5">
                <PanelTitle icon={Banknote} title="Payroll" />
                <div className="mt-4 space-y-3">
                  <FormInput label="Designation" value={staffForm.designation || ""} placeholder="e.g. Senior Maths Teacher" onChange={(v) => setStaffForm((p) => ({ ...p, designation: v }))} />
                  <FormSelect label="Contract Type" value={staffForm.contractType || ""} onChange={(v) => setStaffForm((p) => ({ ...p, contractType: v }))}>
                    <option value="">Not specified</option>
                    <option value="PERMANENT">Permanent</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="PART_TIME">Part-time</option>
                  </FormSelect>
                  <FormInput label="Basic Salary (Rs / month)" type="number" value={staffForm.basicSalary || ""} placeholder="e.g. 85000" onChange={(v) => setStaffForm((p) => ({ ...p, basicSalary: v }))} />
                  <AmountRowsEditor title="Allowances" rows={allowances} onChange={setAllowances} />
                  <AmountRowsEditor title="Deductions" rows={deductions} onChange={setDeductions} />
                </div>
              </div>
              <div className="rounded-3xl bg-white/80 p-5">
                <PanelTitle icon={Landmark} title="Bank Details" />
                <p className="mt-1 text-[10px] font-bold text-[#4d4354]/45">Sensitive — only visible to administrators</p>
                <div className="mt-4 space-y-3">
                  <FormInput label="Account Holder Name" value={staffForm.bankAccountName || ""} placeholder="Name on account" onChange={(v) => setStaffForm((p) => ({ ...p, bankAccountName: v }))} />
                  <FormInput label="Account Number" value={staffForm.bankAccountNumber || ""} placeholder="IBAN / account number" onChange={(v) => setStaffForm((p) => ({ ...p, bankAccountNumber: v }))} />
                  <FormInput label="Bank Name" value={staffForm.bankName || ""} placeholder="e.g. HBL, Meezan" onChange={(v) => setStaffForm((p) => ({ ...p, bankName: v }))} />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-3xl bg-white/80 p-5">
                <PanelTitle icon={Banknote} title="Payroll" />
                <div className="mt-4 space-y-3">
                  <DetailRow label="Designation" value={staff?.staffProfile?.designation || "Not set"} />
                  <DetailRow label="Contract Type" value={staff?.staffProfile?.contractType ? staff.staffProfile.contractType.replace("_", " ") : "Not set"} />
                  <DetailRow label="Basic Salary" value={staff?.staffProfile ? rupee(staff.staffProfile.basicSalary) : "Not set"} />
                  <DetailRow
                    label="Allowances"
                    value={
                      staff?.staffProfile?.allowancesJson
                        ? Object.entries(staff.staffProfile.allowancesJson as Record<string, number>)
                            .map(([name, amt]) => `${name} (${rupee(amt)})`)
                            .join(", ")
                        : "None"
                    }
                  />
                  <DetailRow
                    label="Deductions"
                    value={
                      staff?.staffProfile?.deductionsJson
                        ? Object.entries(staff.staffProfile.deductionsJson as Record<string, number>)
                            .map(([name, amt]) => `${name} (${rupee(amt)})`)
                            .join(", ")
                        : "None"
                    }
                  />
                </div>
              </div>
              <div className="rounded-3xl bg-white/80 p-5">
                <PanelTitle icon={Landmark} title="Bank Details" />
                <p className="mt-1 text-[10px] font-bold text-[#4d4354]/45">Sensitive — only visible to administrators</p>
                <div className="mt-4 space-y-3">
                  <DetailRow label="Account Holder" value={staff?.staffProfile?.bankAccountName || "Not set"} />
                  <DetailRow label="Account Number" value={staff?.staffProfile?.bankAccountNumber ? maskAccount(staff.staffProfile.bankAccountNumber) : "Not set"} />
                  <DetailRow label="Bank" value={staff?.staffProfile?.bankName || "Not set"} />
                </div>
              </div>
            </div>
          )}

          {editStaff ? (
            <div className="mt-5 flex justify-end">
              <BrandButton variant="dark" className="h-11" onClick={saveStaff} disabled={staffSaving}>
                {staffSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Staff Record"}
              </BrandButton>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-3xl bg-white/80 p-5">
              <PanelTitle icon={FileText} title="Documents" />
              <div className="mt-4 space-y-2">
                {staffDocs.length === 0 ? (
                  <EmptyInline text="No documents uploaded yet." />
                ) : (
                  staffDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 rounded-2xl bg-[#fbf0fe]/55 px-4 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#8127cf]">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-[#1f1a23]">{doc.fileName}</p>
                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
                          {doc.kind} · {formatStaffDate(doc.uploadedAt)}
                        </p>
                      </div>
                      <a href={doc.downloadUrl || "#"} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-xl text-[#4d4354]/45 transition-colors hover:bg-white hover:text-[#8127cf]">
                        <Download className="h-4 w-4" />
                      </a>
                      <button type="button" onClick={() => deleteStaffDoc(doc)} disabled={docBusy === doc.id} className="flex h-8 w-8 items-center justify-center rounded-xl text-[#4d4354]/45 transition-colors hover:bg-white hover:text-rose-500 cursor-pointer">
                        {docBusy === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  ))
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <FormSelect label="" value={uploadKind} onChange={setUploadKind}>
                    <option value="CV">CV</option>
                    <option value="CNIC">CNIC</option>
                    <option value="DEGREE">Degree</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="PHOTO">Photo</option>
                    <option value="OTHER">Other</option>
                  </FormSelect>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadStaffDoc(file);
                    }}
                  />
                  <BrandButton variant="soft" icon={<Upload className="w-4 h-4" />} onClick={() => fileInput.current?.click()} disabled={uploading} className="h-9">
                    {uploading ? "Uploading..." : "Upload Document"}
                  </BrandButton>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white/80 p-5">
              <PanelTitle icon={History} title="Timeline" />
              <div className="mt-4 space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                {staffTimeline.length === 0 ? (
                  <EmptyInline text="No staff record events yet." />
                ) : (
                  staffTimeline.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 rounded-2xl bg-[#fbf0fe]/55 px-4 py-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-[#8127cf]">
                        {event.kind === "SALARY" ? <Banknote className="h-3.5 w-3.5" /> : event.kind === "BANK" ? <CreditCard className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-[#1f1a23]">{event.title}</p>
                        {event.detail ? <p className="mt-0.5 text-[10px] font-semibold text-[#4d4354]/55">{event.detail}</p> : null}
                        <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/40">{formatStaffDate(event.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </ModalFrame>
  );
}

function AmountRowsEditor({
  title,
  rows,
  onChange,
}: {
  title: string;
  rows: { name: string; amount: string }[];
  onChange: (rows: { name: string; amount: string }[]) => void;
}) {
  const update = (index: number, field: "name" | "amount", value: string) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  return (
    <div>
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">{title}</span>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={row.name}
              placeholder="Label"
              onChange={(e) => update(index, "name", e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-3 text-xs font-bold outline-none focus:border-[#8127cf]/40 focus:bg-white"
            />
            <input
              value={row.amount}
              type="number"
              placeholder="Rs"
              onChange={(e) => update(index, "amount", e.target.value)}
              className="h-10 w-24 rounded-xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-3 text-xs font-bold outline-none focus:border-[#8127cf]/40 focus:bg-white"
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#4d4354]/45 transition-colors hover:bg-white hover:text-rose-500 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...rows, { name: "", amount: "" }])}
          className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:bg-[#fbf0fe] cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> Add {title.toLowerCase()}
        </button>
      </div>
    </div>
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
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5 animate-backdrop-enter" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(e) => e.stopPropagation()} className={cn(
        "bg-white w-full max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/15 custom-scrollbar animate-modal-enter",
        wide ? "max-w-4xl" : "max-w-lg"
      )}>
        <div className="flex justify-between items-start gap-5 mb-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">{eyebrow}</p>
            <h3 className="mt-1.5 text-2xl font-black text-[#1f1a23] tracking-tight">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-rose-50 hover:text-rose-500 cursor-pointer transition-all duration-200 active:scale-95">
            <X className="w-5 h-5" /><span className="sr-only">Close</span>
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
              <AvatarImage src={avatar} />
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

// ─── STUDENT SETUP (Categories & Groups) ───────────────────
// Self-contained CRUD for the student tag lists. Both tags feed fee
// discounts (Module 2) and reports; both are optional per student.
// Deletion is blocked (409) while any student references the tag.

type StudentTagKind = "category" | "group";

const STUDENT_TAG_API: Record<StudentTagKind, string> = {
  category: "/api/student-categories",
  group: "/api/student-groups",
};

export function StudentSetupPanel() {
  const [categories, setCategories] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ kind: StudentTagKind; item: any } | null>(null);
  const [creating, setCreating] = useState<StudentTagKind | null>(null);
  const [deleting, setDeleting] = useState<{ kind: StudentTagKind; item: any } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, grps] = await Promise.all([
        fetch(STUDENT_TAG_API.category).then((r) => r.json()),
        fetch(STUDENT_TAG_API.group).then((r) => r.json()),
      ]);
      setCategories(cats.success ? cats.data : []);
      setGroups(grps.success ? grps.data : []);
    } catch {
      toast.error("Could not load student categories and groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveTag = async (kind: StudentTagKind, payload: { name: string; description?: string; isActive?: boolean }) => {
    setBusy(true);
    try {
      const body = editing
        ? { id: editing.item.id, ...payload }
        : payload;
      const res = await fetch(STUDENT_TAG_API[kind], {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      toast.success(editing ? `${kind === "category" ? "Category" : "Group"} updated` : `${kind === "category" ? "Category" : "Group"} created`);
      setEditing(null);
      setCreating(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const deleteTag = async () => {
    if (!deleting) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`${STUDENT_TAG_API[deleting.kind]}?id=${deleting.item.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not delete");
      toast.success(deleting.kind === "category" ? "Category deleted" : "Group deleted");
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
      setDeleting(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const modal = editing || (creating ? { kind: creating, item: null } : null);
  const kind = modal?.kind as StudentTagKind;

  return (
    <div className="space-y-8">
      <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <PanelTitle icon={Tag} title="Student Setup" />
        <p className="mt-2 max-w-2xl text-xs font-semibold leading-relaxed text-[#4d4354]/60">
          Categories tag a student's fee or scholarship eligibility (General, Scholarship, Orphan, Staff Child…) and
          drive fee discounts. Groups tag logistics and cohorts (Transport users, Hostel residents, House A…). Both are
          optional per student and can be assigned during admission or from a student's profile.
        </p>
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <TagListCard
            kind="category"
            icon={Tag}
            title="Student Categories"
            items={categories}
            loading={loading}
            onAdd={() => setCreating("category")}
            onEdit={(item) => setEditing({ kind: "category", item })}
            onDelete={(item) => setDeleting({ kind: "category", item })}
          />
          <TagListCard
            kind="group"
            icon={Layers}
            title="Student Groups"
            items={groups}
            loading={loading}
            onAdd={() => setCreating("group")}
            onEdit={(item) => setEditing({ kind: "group", item })}
            onDelete={(item) => setDeleting({ kind: "group", item })}
          />
        </div>
      </div>

      {modal ? (
        <TagFormModal
          kind={kind}
          item={editing?.item}
          busy={busy}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
          onSave={saveTag}
        />
      ) : null}

      <ConfirmAction
        open={Boolean(deleting)}
        title={`Delete ${deleting?.kind === "category" ? "category" : "group"}?`}
        description={
          deleting
            ? `"${deleting.item.name}" will be permanently removed. Students already tagged with it keep their links until reassigned.`
            : ""
        }
        confirmLabel="Delete"
        tone="danger"
        busy={confirmBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={deleteTag}
      />
    </div>
  );
}

function TagListCard({
  kind,
  icon: Icon,
  title,
  items,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: {
  kind: StudentTagKind;
  icon: LucideIcon;
  title: string;
  items: any[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
}) {
  return (
    <div className="rounded-[28px] border border-[#cfc2d6]/25 bg-white p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-black tracking-tight text-[#1f1a23]">{title}</h4>
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/45">
              {items.length} {items.length === 1 ? "tag" : "tags"}
            </p>
          </div>
        </div>
        <BrandButton variant="soft" icon={<Plus className="w-4 h-4" />} onClick={onAdd}>
          Add
        </BrandButton>
      </div>

      <div className="space-y-2.5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-[#fbf0fe]/50 py-8 text-[#8127cf]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <EmptyInline text={`No ${kind === "category" ? "categories" : "groups"} yet — add your first one.`} />
        ) : (
          items.map((item) => {
            const studentCount = item._count?.students ?? 0;
            return (
              <div
                key={item.id}
                className="group flex items-center gap-3 rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 py-3 transition-all hover:border-[#8127cf]/25 hover:bg-white"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-black text-[#1f1a23]">{item.name}</p>
                    {kind === "category" ? (
                      <StatusPill status={item.isActive === false ? "Inactive" : "Active"} />
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[10px] font-semibold text-[#4d4354]/55">
                    {item.description || "No description"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#8127cf] shadow-sm">
                  {studentCount} student{studentCount === 1 ? "" : "s"}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl text-[#4d4354]/45 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                    title={`Rename ${kind}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl text-[#4d4354]/45 transition-all hover:bg-rose-50 hover:text-rose-500"
                    title={`Delete ${kind}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TagFormModal({
  kind,
  item,
  busy,
  onClose,
  onSave,
}: {
  kind: StudentTagKind;
  item: any;
  busy: boolean;
  onClose: () => void;
  onSave: (kind: StudentTagKind, payload: { name: string; description?: string; isActive?: boolean }) => void;
}) {
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [isActive, setIsActive] = useState(item?.isActive !== false);
  const [error, setError] = useState("");

  const submit = () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    onSave(kind, {
      name: name.trim(),
      description: description.trim() || undefined,
      ...(kind === "category" ? { isActive } : {}),
    });
  };

  return (
    <ModalFrame
      title={item ? `Edit ${kind === "category" ? "category" : "group"}` : `New ${kind === "category" ? "category" : "group"}`}
      eyebrow="Student Setup"
      onClose={onClose}
    >
      <div className="space-y-4">
        <FormInput label="Name" value={name} placeholder={kind === "category" ? "e.g. Scholarship" : "e.g. Transport users"} onChange={setName} />
        {error ? <p className="pl-2 text-xs font-semibold text-rose-500">{error}</p> : null}
        <label className="block group/input">
          <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === "category" ? "e.g. 50% fee concession for staff children" : "e.g. Students using the morning van route"}
            rows={3}
            className="w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 py-3 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-[#4d4354]/30 focus:border-[#8127cf]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
          />
        </label>
        {kind === "category" ? (
          <button
            type="button"
            onClick={() => setIsActive((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 p-3 text-left transition-all hover:border-[#8127cf]/25"
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                isActive ? "border-emerald-500 bg-emerald-500" : "border-[#cfc2d6]/50 bg-white"
              )}
            >
              {isActive ? <Check className="h-3 w-3 text-white" strokeWidth={3.5} /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-black text-[#1f1a23]">Active</span>
              <span className="block text-[9px] font-bold text-[#4d4354]/50">
                Inactive categories stay on existing students but can't be chosen for new admissions.
              </span>
            </span>
          </button>
        ) : null}
      </div>
      <ModalActions
        busy={busy}
        busyLabel={item ? "Saving" : "Creating"}
        actionLabel={item ? "Save Changes" : `Create ${kind === "category" ? "Category" : "Group"}`}
        onClose={onClose}
        onSave={submit}
      />
    </ModalFrame>
  );
}

const QUERY_SOURCES_LABELS: Record<string, string> = {
  WALK_IN: "Walk-in",
  PHONE: "Phone call",
  WEBSITE: "Website",
  REFERRAL: "Referral",
  ADVERT: "Advert",
};

function querySourceIcon(source: string) {
  if (source === "PHONE") return Phone;
  if (source === "WEBSITE") return Globe;
  if (source === "REFERRAL") return Users;
  if (source === "ADVERT") return Megaphone;
  return UserCheck;
}

export function AdmissionQueriesPanel({
  classes,
  version,
  onVersionBump,
  onConvert,
}: {
  classes: any[];
  version: number;
  onVersionBump: () => void;
  onConvert: (query: any) => void;
}) {
  const [queries, setQueries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOverdue, setShowOverdue] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const loadQueries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (sourceFilter !== "ALL") params.set("source", sourceFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (showOverdue) params.set("overdue", "true");
      const res = await fetch(`/api/admission-queries?${params.toString()}`);
      const json = await res.json();
      if (json.success) setQueries(json.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter, searchQuery, showOverdue]);

  useEffect(() => {
    loadQueries();
  }, [loadQueries, version]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ACTIVE: 0, FOLLOW_UP: 0, CONVERTED: 0, LOST: 0, OVERDUE: 0 };
    for (const q of queries) {
      if (c[q.status] !== undefined) c[q.status] += 1;
      if (
        ["ACTIVE", "FOLLOW_UP"].includes(q.status) &&
        q.nextFollowUp &&
        new Date(q.nextFollowUp).getTime() < now
      ) {
        c.OVERDUE += 1;
      }
    }
    return c;
  }, [queries, now]);

  const filtered = queries.filter((q) => {
    if (statusFilter !== "ALL" && q.status !== statusFilter) return false;
    if (sourceFilter !== "ALL" && q.source !== sourceFilter) return false;
    if (searchQuery.trim()) {
      const s = searchQuery.toLowerCase();
      if (!q.name.toLowerCase().includes(s) && !q.phone.includes(s) && !(q.email || "").toLowerCase().includes(s)) return false;
    }
    if (showOverdue) {
      if (!["ACTIVE", "FOLLOW_UP"].includes(q.status)) return false;
      if (!q.nextFollowUp || new Date(q.nextFollowUp).getTime() >= now) return false;
    }
    return true;
  });

  const filterChip = (key: string, label: string, value: string, setValue: (v: string) => void) => (
    <button
      key={key}
      type="button"
      onClick={() => setValue(value)}
      className={cn(
        "h-9 rounded-full px-3.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer",
        value === key
          ? "bg-[#8127cf] text-white shadow-[0_4px_14px_-2px_rgba(129,39,207,0.45)]"
          : "bg-white text-[#4d4354]/60 border border-[#cfc2d6]/25 hover:border-[#8127cf]/30 hover:text-[#8127cf]"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <PanelTitle icon={PhoneCall} title="Admission Queries" />
          <BrandButton variant="soft" icon={<Plus className="w-4 h-4" />} onClick={() => setShowNewModal(true)}>
            New Query
          </BrandButton>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { key: "ALL", label: `All (${queries.length})` },
            { key: "ACTIVE", label: `Active (${counts.ACTIVE})` },
            { key: "FOLLOW_UP", label: `Follow-up (${counts.FOLLOW_UP})` },
            { key: "CONVERTED", label: `Converted (${counts.CONVERTED})` },
            { key: "OVERDUE", label: `Overdue (${counts.OVERDUE})` },
          ].map((c) => filterChip(`status-${c.key}`, c.label, c.key, (v) => {
            setStatusFilter(v === "OVERDUE" ? "ALL" : v);
            setShowOverdue(v === "OVERDUE");
            setSourceFilter("ALL");
          }))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Search</span>
            <div className="group/search flex items-center rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 h-14 w-full transition-all duration-200 focus-within:border-[#8127cf]/30 focus-within:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] focus-within:bg-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#4d4354]/40 transition-colors group-focus-within/search:text-[#8127cf]">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text" placeholder="Search by name, phone or email..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ml-2 h-full w-full bg-transparent border-none outline-none text-sm font-bold placeholder:text-[#4d4354]/35 tracking-wide"
              />
            </div>
          </div>
          <FormSelect label="Source" value={sourceFilter} onChange={setSourceFilter}>
            <option value="ALL">All sources</option>
            {Object.entries(QUERY_SOURCES_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </FormSelect>
          <div className="pb-1.5">
            <StatusPill status={`${filtered.length} shown`} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyInline text="No admission queries match these filters" />
      ) : (
        <div className="space-y-3">
          {filtered.map((q, i) => {
            const overdue = ["ACTIVE", "FOLLOW_UP"].includes(q.status) && q.nextFollowUp && new Date(q.nextFollowUp).getTime() < now;
            const SourceIcon = querySourceIcon(q.source);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelected(q)}
                className={cn(
                  "group/q relative w-full overflow-hidden rounded-[20px] border bg-white p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] active:scale-[0.99] cursor-pointer",
                  overdue
                    ? "border-rose-300/70 bg-rose-50/40 hover:border-rose-400/60"
                    : "border-[#cfc2d6]/25 hover:border-[#8127cf]/30"
                )}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {overdue ? (
                  <span className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-rose-500" />
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm transition-all duration-300 group-hover/q:from-[#8127cf] group-hover/q:to-[#9c48ea] group-hover/q:text-white">
                      <SourceIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-black text-[#1f1a23] tracking-tight">{q.name}</p>
                      <p className="mt-0.5 truncate text-xs font-bold text-[#4d4354]/55">
                        {q.phone}
                        {q.email ? ` · ${q.email}` : ""}
                        {q.classInterested ? ` · ${classLabel(q.classInterested)}` : " · Class not set"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusPill status={q.status} />
                    <span className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                      {QUERY_SOURCES_LABELS[q.source] || q.source}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f3f4f9] pt-2.5">
                  {q.nextFollowUp ? (
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider",
                      overdue ? "bg-rose-100 text-rose-600" : "bg-[#fbf0fe] text-[#8127cf]"
                    )}>
                      <CalendarClock className="h-3 w-3" />
                      {overdue ? "Overdue · " : "Next "}{formatDate(q.nextFollowUp)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f3f4f9] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">
                      <Clock className="h-3 w-3" /> No follow-up set
                    </span>
                  )}
                  {q.assignedTo ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-sky-600">
                      <User className="h-3 w-3" /> {q.assignedTo.fullName}
                    </span>
                  ) : null}
                  {q.convertedStudent ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                      <UserCheck className="h-3 w-3" /> {q.convertedStudent.fullName}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showNewModal ? (
        <NewQueryModal
          classes={classes}
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            loadQueries();
            onVersionBump();
          }}
        />
      ) : null}

      {selected ? (
        <QueryDetailModal
          query={selected}
          classes={classes}
          now={now}
          onConvert={() => onConvert(selected)}
          onClose={() => setSelected(null)}
          onChanged={(updated) => {
            setSelected(updated);
            loadQueries();
            onVersionBump();
          }}
        />
      ) : null}
    </div>
  );
}

function NewQueryModal({
  classes,
  onClose,
  onCreated,
}: {
  classes: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    classInterestedId: "",
    source: "WALK_IN",
    note: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admission-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, classInterestedId: form.classInterestedId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create query");
      toast.success("Admission query created");
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create query");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalFrame title="New Admission Query" eyebrow="Lead CRM" onClose={onClose}>
      <div className="space-y-4">
        <FormInput label="Name *" value={form.name} placeholder="Guardian or student name" onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput label="Phone *" value={form.phone} placeholder="+92 300 1234567" onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
          <FormInput label="Email" value={form.email} placeholder="optional" onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormSelect label="Class interested in" value={form.classInterestedId} onChange={(v) => setForm((f) => ({ ...f, classInterestedId: v }))}>
            <option value="">Not specified</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
            ))}
          </FormSelect>
          <FormSelect label="Source" value={form.source} onChange={(v) => setForm((f) => ({ ...f, source: v }))}>
            {Object.entries(QUERY_SOURCES_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </FormSelect>
        </div>
        <label className="block">
          <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Note</span>
          <textarea
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="What is this enquiry about?"
            className="min-h-24 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 py-3 text-sm font-bold text-[#1f1a23] outline-none transition-all duration-250 placeholder:text-[#4d4354]/30 focus:border-[#8127cf]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
          />
        </label>
      </div>
      <ModalActions busy={busy} busyLabel="Creating" actionLabel="Create Query" onClose={onClose} onSave={submit} />
    </ModalFrame>
  );
}

function QueryDetailModal({
  query,
  classes,
  now,
  onConvert,
  onClose,
  onChanged,
}: {
  query: any;
  classes: any[];
  now: number;
  onConvert: () => void;
  onClose: () => void;
  onChanged: (updated: any) => void;
}) {
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: query.name, phone: query.phone, email: query.email || "" });

  const loadFollowUps = useCallback(async () => {
    const res = await fetch(`/api/admission-queries/follow-ups?queryId=${query.id}`);
    const json = await res.json();
    if (json.success) setFollowUps(json.data || []);
  }, [query.id]);

  useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  const patch = async (body: Record<string, any>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admission-queries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: query.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast.success("Query updated");
      onChanged(data.data);
      return data.data;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addFollowUp = async () => {
    if (!noteDraft.trim()) {
      toast.error("Please write a follow-up note");
      return;
    }
    await patch({
      followUp: {
        note: noteDraft.trim(),
        nextDate: nextDate || null,
      },
    });
    setNoteDraft("");
    setNextDate("");
    loadFollowUps();
  };

  const setStatus = async (status: string) => {
    const updated = await patch({ status });
    if (updated?.status === "LOST") setDeleteConfirm(false);
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admission-queries?id=${query.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete");
      toast.success("Query deleted");
      onChanged({ ...query, _deleted: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  };

  const overdue = ["ACTIVE", "FOLLOW_UP"].includes(query.status) && query.nextFollowUp && new Date(query.nextFollowUp).getTime() < now;

  return (
    <ModalFrame title={query.name} eyebrow={`Admission Query · ${QUERY_SOURCES_LABELS[query.source] || query.source}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={query.status} />
            {overdue ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-rose-600">
                <CalendarClock className="h-3 w-3" /> Follow-up overdue
              </span>
            ) : null}
          </div>

          {editing ? (
            <div className="space-y-3">
              <FormInput label="Name" value={editForm.name} placeholder="Name" onChange={(v) => setEditForm((f) => ({ ...f, name: v }))} />
              <FormInput label="Phone" value={editForm.phone} placeholder="Phone" onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
              <FormInput label="Email" value={editForm.email} placeholder="Email" onChange={(v) => setEditForm((f) => ({ ...f, email: v }))} />
              <div className="flex gap-2">
                <BrandButton variant="soft" onClick={() => setEditing(false)}>Cancel</BrandButton>
                <BrandButton
                  onClick={async () => {
                    const updated = await patch({ name: editForm.name, phone: editForm.phone, email: editForm.email });
                    if (updated) setEditing(false);
                  }}
                  disabled={busy}
                >
                  Save
                </BrandButton>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 p-4">
                <DetailRow label="Phone" value={query.phone} />
                <DetailRow label="Email" value={query.email || "—"} />
                <DetailRow label="Class interested" value={query.classInterested ? classLabel(query.classInterested) : "Not specified"} />
                <DetailRow label="Assigned to" value={query.assignedTo?.fullName || "Unassigned"} />
                <DetailRow label="Next follow-up" value={query.nextFollowUp ? `${formatDate(query.nextFollowUp)}${overdue ? " (overdue)" : ""}` : "None"} />
                <DetailRow label="Logged on" value={formatDate(query.createdAt)} />
                {query.convertedStudent ? (
                  <DetailRow label="Converted to" value={`${query.convertedStudent.fullName} (${query.convertedStudent.rollNo})`} />
                ) : null}
              </div>
              {query.note ? (
                <div className="rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 p-4">
                  <p className="mb-1.5 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Note</p>
                  <p className="whitespace-pre-wrap text-sm font-bold text-[#1f1a23]/80">{query.note}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <BrandButton variant="soft" icon={<Pencil className="w-4 h-4" />} onClick={() => setEditing(true)}>
                  Edit
                </BrandButton>
                {query.status !== "CONVERTED" ? (
                  <>
                    {query.status !== "LOST" ? (
                      <BrandButton variant="soft" icon={<Send className="w-4 h-4" />} onClick={() => setStatus("FOLLOW_UP")} disabled={busy}>
                        Mark Follow-up
                      </BrandButton>
                    ) : null}
                    <BrandButton variant="soft" icon={<UserCheck className="w-4 h-4" />} onClick={onConvert} disabled={busy}>
                      Convert to Student
                    </BrandButton>
                    {query.status !== "LOST" ? (
                      <BrandButton variant="soft" icon={<X className="w-4 h-4" />} onClick={() => setStatus("LOST")} disabled={busy}>
                        Mark Lost
                      </BrandButton>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          )}

          <div className="flex items-center justify-between border-t border-[#cfc2d6]/10 pt-4">
            <span className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
              {query._count?.followUps ?? followUps.length} follow-ups
            </span>
            {!deleteConfirm ? (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-500 transition-all duration-200 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete query
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-rose-600">Sure?</span>
                <BrandButton variant="soft" onClick={() => setDeleteConfirm(false)}>Keep</BrandButton>
                <BrandButton variant="dark" onClick={doDelete} disabled={busy} className="bg-rose-600 hover:bg-rose-700">
                  Delete
                </BrandButton>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="mb-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Follow-up Timeline</p>
          </div>
          <div className="max-h-[420px] space-y-3 overflow-y-auto custom-scrollbar pr-1">
            {followUps.length === 0 ? (
              <EmptyInline text="No follow-ups yet — log the first call below" />
            ) : (
              followUps.map((fu) => (
                <div key={fu.id} className="rounded-2xl border border-[#cfc2d6]/20 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
                      {formatDate(fu.date)}
                    </span>
                    {fu.actor?.fullName ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/40">
                        by {fu.actor.fullName}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm font-bold text-[#1f1a23]/85">{fu.note}</p>
                  {fu.nextDate ? (
                    <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-[#8127cf]">
                      Next: {formatDate(fu.nextDate)}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 p-4">
            <p className="mb-2.5 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Log a follow-up</p>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="What happened on this call / visit?"
              className="min-h-20 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 py-3 text-sm font-bold text-[#1f1a23] outline-none transition-all duration-250 placeholder:text-[#4d4354]/30 focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="w-48">
                <span className="mb-1.5 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Next follow-up</span>
                <input
                  type="date"
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all duration-250 focus:border-[#8127cf]/40"
                />
              </div>
              <BrandButton variant="dark" icon={<Send className="w-4 h-4" />} onClick={addFollowUp} disabled={busy} className="ml-auto">
                Log follow-up
              </BrandButton>
            </div>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

const ARCHIVED_STATUS_LABELS: Record<string, string> = {
  inactive: "Inactive",
  archived: "Archived",
  transferred: "Transferred",
  graduated: "Graduated",
};

export function ArchivedStudentsPanel({ version, onVersionBump }: { version: number; onVersionBump: () => void }) {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [graduating, setGraduating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/students?status=archived&limit=200");
      const json = await res.json();
      if (json.success) setStudents(json.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const filtered = students.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.fullName?.toLowerCase().includes(q) ||
      s.rollNo?.toLowerCase().includes(q) ||
      s.guardianName?.toLowerCase().includes(q)
    );
  });

  const changeStatus = async (student: any, status: string, successMsg: string) => {
    const setBusy = status === "active" ? setRestoring : setGraduating;
    setBusy(student.id);
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: student.id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast.success(successMsg);
      await load();
      onVersionBump();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={Archive} title="Archived & Inactive Students" />
        <div className="pb-1.5">
          <StatusPill status={`${filtered.length} records`} />
        </div>
      </div>

      <div className="mb-4 max-w-xs">
        <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">Search</span>
        <div className="group/search flex items-center rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 h-14 w-full transition-all duration-200 focus-within:border-[#8127cf]/30 focus-within:shadow-[0_0_0_3px_rgba(129,39,207,0.08)] focus-within:bg-white">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#4d4354]/40 transition-colors group-focus-within/search:text-[#8127cf]">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text" placeholder="Search archived students..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ml-2 h-full w-full bg-transparent border-none outline-none text-sm font-bold placeholder:text-[#4d4354]/35 tracking-wide"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyInline text="No archived or inactive students — archived profiles appear here" />
      ) : (
        <div className="space-y-3">
          {filtered.map((s, i) => (
            <div
              key={s.id}
              className="sk-rise flex flex-wrap items-center gap-4 rounded-[20px] border border-[#cfc2d6]/25 bg-white p-4 transition-all duration-300 hover:border-[#8127cf]/30 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f3f4f9] text-[#4d4354]/50">
                <Archive className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-black text-[#1f1a23] tracking-tight">{s.fullName}</p>
                <p className="mt-0.5 truncate text-xs font-bold text-[#4d4354]/55">
                  {s.rollNo}
                  {s.class ? ` · ${classLabel(s.class)}` : " · No class"}
                  {s.guardianPhone ? ` · ${s.guardianPhone}` : ""}
                </p>
              </div>
              <StatusPill status={ARCHIVED_STATUS_LABELS[s.status] || s.status} />
              <div className="flex shrink-0 items-center gap-2">
                {s.status === "graduated" ? null : (
                  <BrandButton
                    variant="soft"
                    icon={<RotateCcw className="w-4 h-4" />}
                    disabled={restoring === s.id}
                    onClick={() => changeStatus(s, "active", `${s.fullName} restored to active roster`)}
                  >
                    {restoring === s.id ? "Restoring..." : "Restore"}
                  </BrandButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const LEAVE_TABS = [
  { id: "requests", label: "Approve Queue", icon: CheckCircle2 },
  { id: "types", label: "Leave Types", icon: Layers },
  { id: "allocations", label: "Allocations", icon: UserCheck },
  { id: "balances", label: "Staff Balances", icon: Users },
] as const;

const LEAVE_STATUS_STYLES: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-600",
  CANCELLED: "border-[#cfc2d6]/20 bg-[#f3f4f9] text-[#4d4354]/55",
};

function leaveDaysLabel(tenths: number) {
  const d = tenths / 10;
  return Number.isInteger(d) ? `${d} day${d === 1 ? "" : "s"}` : `${d} days`;
}

function leaveDateLabel(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso?.slice(0, 10) || "N/A";
  }
}

export function LeaveManagementPanel({ campusId }: { campusId?: string }) {
  const [tab, setTab] = useState<(typeof LEAVE_TABS)[number]["id"]>("requests");
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState("");

  const [types, setTypes] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  const [showAddType, setShowAddType] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: "", defaultDays: "10" });
  const [typeBusy, setTypeBusy] = useState(false);

  const [showAddAllocation, setShowAddAllocation] = useState(false);
  const [allocForm, setAllocForm] = useState({ leaveTypeId: "", scope: "role", role: "TEACHER", userId: "", days: "10" });
  const [allocBusy, setAllocBusy] = useState(false);

  const [staffBalances, setStaffBalances] = useState<any[]>([]);

  const [reviewNote, setReviewNote] = useState("");
  const [overrideBalance, setOverrideBalance] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [typesJson, allocJson, reqJson] = await Promise.all([
        fetch(`/api/leave/types${campusId ? `?campusId=${campusId}` : ""}`).then((r) => r.json()),
        fetch(`/api/leave/allocations?academicYear=${academicYear}${campusId ? `&campusId=${campusId}` : ""}`).then((r) => r.json()),
        fetch(`/api/leave?mode=all&academicYear=${academicYear}${statusFilter ? `&status=${statusFilter}` : ""}${campusId ? `&campusId=${campusId}` : ""}`).then((r) => r.json()),
      ]);
      if (typesJson.success) setTypes(typesJson.data || []);
      if (allocJson.success) setAllocations(allocJson.data || []);
      if (reqJson.success) {
        setRequests(reqJson.data.requests || []);
        setStaffUsers(reqJson.data.users || []);
      }
      const balJson = await fetch(`/api/leave?mode=balances&academicYear=${academicYear}${campusId ? `&campusId=${campusId}` : ""}`).then((r) => r.json());
      if (balJson.success) setStaffBalances(balJson.data.staff || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [campusId, academicYear, statusFilter]);

  useEffect(() => {
    load();
  }, [load, reloadTick]);

  const addType = async () => {
    if (!typeForm.name.trim()) {
      toast.error("Type name is required");
      return;
    }
    setTypeBusy(true);
    try {
      const res = await fetch("/api/leave/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: typeForm.name, defaultDays: Number(typeForm.defaultDays) || 0, campusId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not create leave type");
      toast.success(`Leave type "${typeForm.name}" created`);
      setShowAddType(false);
      setTypeForm({ name: "", defaultDays: "10" });
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      setTypeBusy(false);
    }
  };

  const updateTypeDays = async (id: string, defaultDays: string) => {
    try {
      const res = await fetch("/api/leave/types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, defaultDays: Number(defaultDays) || 0 }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Update failed");
      toast.success("Default days updated");
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  const deleteType = async (type: any) => {
    try {
      const res = await fetch(`/api/leave/types?id=${type.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Delete failed");
      toast.success(`Leave type "${type.name}" deleted`);
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const addAllocation = async () => {
    if (!allocForm.leaveTypeId) {
      toast.error("Select a leave type");
      return;
    }
    setAllocBusy(true);
    try {
      const res = await fetch("/api/leave/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId: allocForm.leaveTypeId,
          role: allocForm.scope === "role" ? allocForm.role : null,
          userId: allocForm.scope === "user" ? allocForm.userId : null,
          days: Number(allocForm.days) || 0,
          academicYear,
          campusId,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not create allocation");
      toast.success("Allocation created");
      setShowAddAllocation(false);
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      setAllocBusy(false);
    }
  };

  const deleteAllocation = async (id: string) => {
    try {
      const res = await fetch(`/api/leave/allocations?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Delete failed");
      toast.success("Allocation removed");
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const review = async (request: any, status: "APPROVED" | "REJECTED") => {
    setReviewing(request.id);
    try {
      const res = await fetch("/api/leave/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, status, reviewNote, override: overrideBalance }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Review failed");
      toast.success(`Request ${status.toLowerCase()}`);
      setReviewNote("");
      setOverrideBalance(false);
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    } finally {
      setReviewing(null);
    }
  };

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={Plane} title="Leave Management" />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={academicYear}
            onChange={(e) => setAcademicYear(Number(e.target.value) || new Date().getFullYear())}
            className="h-9 w-24 rounded-xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-3 text-xs font-black text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
          />
          <StatusPill status={`${pendingCount} pending`} />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {LEAVE_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer",
                tab === t.id ? "bg-[#8127cf] text-white shadow-md" : "bg-[#fbf0fe]/60 text-[#4d4354]/60 hover:bg-[#f0e0f8]"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" />
        </div>
      ) : tab === "requests" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 cursor-pointer rounded-xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-3 text-xs font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {requests.length === 0 ? (
            <EmptyInline text="No leave requests for this year." />
          ) : (
            requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-[20px] border border-[#cfc2d6]/25 bg-white p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#1f1a23]">
                    {r.user?.fullName || "Unknown"} <span className="text-[#4d4354]/45">({r.user?.role || "—"})</span>
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-[#4d4354]/55">
                    {r.leaveType?.name || "Leave"} · {leaveDaysLabel(r.days)} · {leaveDateLabel(r.fromDate)} → {leaveDateLabel(r.toDate)}
                  </p>
                  {r.reason ? <p className="mt-1 text-[11px] font-semibold text-[#4d4354]/45">{r.reason}</p> : null}
                  {r.reviewedBy ? (
                    <p className="mt-1 text-[10px] font-bold text-[#4d4354]/40">
                      Reviewed by {r.reviewedBy.fullName}{r.reviewNote ? ` — ${r.reviewNote}` : ""}
                    </p>
                  ) : null}
                </div>
                <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-wider ${LEAVE_STATUS_STYLES[r.status] || LEAVE_STATUS_STYLES.PENDING}`}>
                  {r.status}
                </span>
                {r.status === "PENDING" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="Review note"
                      className="h-10 w-44 rounded-xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-3 text-xs font-bold outline-none focus:border-[#8127cf]/40"
                    />
                    <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideBalance}
                        onChange={(e) => setOverrideBalance(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[#8127cf]"
                      />
                      Override balance
                    </label>
                    <BrandButton variant="soft" disabled={reviewing === r.id} onClick={() => review(r, "APPROVED")} className="h-10">
                      {reviewing === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                    </BrandButton>
                    <BrandButton variant="soft" disabled={reviewing === r.id} onClick={() => review(r, "REJECTED")} className="h-10 bg-rose-50 text-rose-600 hover:bg-rose-100">
                      Reject
                    </BrandButton>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : tab === "types" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <BrandButton variant="dark" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddType(true)} className="h-10">
              Add Leave Type
            </BrandButton>
          </div>
          {types.length === 0 ? (
            <EmptyInline text="No leave types defined for this campus." />
          ) : (
            types.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-4 rounded-[20px] border border-[#cfc2d6]/25 bg-white p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
                  <Layers className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#1f1a23]">{t.name}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[#4d4354]/55">
                    {t._count?.allocations || 0} allocation(s) · {t._count?.requests || 0} request(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50">
                    Default
                    <input
                      type="number"
                      defaultValue={t.defaultDaysDisplay}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== t.defaultDaysDisplay) updateTypeDays(t.id, e.target.value);
                      }}
                      className="h-10 w-20 rounded-xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-3 text-xs font-black outline-none focus:border-[#8127cf]/40"
                    />
                    days
                  </label>
                  <button
                    type="button"
                    onClick={() => deleteType(t)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-[#4d4354]/40 transition-colors hover:bg-rose-50 hover:text-rose-500 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === "allocations" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <BrandButton variant="dark" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddAllocation(true)} className="h-10">
              Add Allocation
            </BrandButton>
          </div>
          {allocations.length === 0 ? (
            <EmptyInline text="No allocations for this year yet. Add role-wide or per-user allocations." />
          ) : (
            allocations.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-4 rounded-[20px] border border-[#cfc2d6]/25 bg-white p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
                  {a.userId ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#1f1a23]">
                    {a.leaveType?.name || "Leave"} · {leaveDaysLabel(a.days)}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-[#4d4354]/55">
                    {a.userId ? `User: ${a.user?.fullName || "—"}` : `All ${a.role || "staff"} members`} · {a.academicYear}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteAllocation(a.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-[#4d4354]/40 transition-colors hover:bg-rose-50 hover:text-rose-500 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {showAddType ? (
        <ModalFrame title="Add Leave Type" eyebrow="Leave Management" onClose={() => setShowAddType(false)}>
          <div className="space-y-4">
            <FormInput label="Type Name" value={typeForm.name} placeholder="e.g. Casual Leave" onChange={(v) => setTypeForm((p) => ({ ...p, name: v }))} />
            <FormInput label="Default Days / Year" type="number" value={typeForm.defaultDays} placeholder="e.g. 10" onChange={(v) => setTypeForm((p) => ({ ...p, defaultDays: v }))} />
            <div className="flex justify-end">
              <BrandButton variant="dark" icon={<Plus className="w-4 h-4" />} onClick={addType} disabled={typeBusy} className="h-11">
                {typeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Type"}
              </BrandButton>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {showAddAllocation ? (
        <ModalFrame title="Add Leave Allocation" eyebrow="Leave Management" onClose={() => setShowAddAllocation(false)}>
          <div className="space-y-4">
            <FormSelect label="Leave Type" value={allocForm.leaveTypeId} onChange={(v) => setAllocForm((p) => ({ ...p, leaveTypeId: v }))}>
              <option value="">Select type</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </FormSelect>
            <FormSelect label="Scope" value={allocForm.scope} onChange={(v) => setAllocForm((p) => ({ ...p, scope: v }))}>
              <option value="role">Whole role</option>
              <option value="user">Specific staff member</option>
            </FormSelect>
            {allocForm.scope === "role" ? (
              <FormSelect label="Role" value={allocForm.role} onChange={(v) => setAllocForm((p) => ({ ...p, role: v }))}>
                <option value="CAMPUS_ADMIN">Campus Admin</option>
                <option value="ADMIN">Admin</option>
                <option value="PRINCIPAL">Principal</option>
                <option value="TEACHER">Teacher</option>
              </FormSelect>
            ) : (
              <FormSelect label="Staff Member" value={allocForm.userId} onChange={(v) => setAllocForm((p) => ({ ...p, userId: v }))}>
                <option value="">Select staff member</option>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>
                ))}
              </FormSelect>
            )}
            <FormInput label="Days / Year" type="number" value={allocForm.days} placeholder="e.g. 10" onChange={(v) => setAllocForm((p) => ({ ...p, days: v }))} />
            <div className="flex justify-end">
              <BrandButton variant="dark" icon={<Plus className="w-4 h-4" />} onClick={addAllocation} disabled={allocBusy} className="h-11">
                {allocBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Allocation"}
              </BrandButton>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {/* ── Staff Balances ──────────────────────────────── */}
      {tab === "balances" ? (
        <div className="space-y-3">
          {staffBalances.length === 0 ? (
            <EmptyInline text="No staff with leave allocations yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#cfc2d6]/15 text-[#4d4354]/55 text-xs uppercase tracking-wider">
                    <th className="text-left py-2 px-3 font-medium">Staff Member</th>
                    <th className="text-left py-2 px-3 font-medium">Role</th>
                    {types.map((t: any) => (
                      <th key={t.id} className="text-center py-2 px-3 font-medium" colSpan={3}>{t.name}</th>
                    ))}
                  </tr>
                  {types.length > 0 ? (
                    <tr className="border-b border-[#cfc2d6]/10 text-[#4d4354]/40 text-[10px] uppercase">
                      <th />
                      <th />
                      {types.map((t: any) => (
                        <React.Fragment key={t.id}>
                          <th className="text-center py-1 px-1 font-normal">Alloc</th>
                          <th className="text-center py-1 px-1 font-normal">Used</th>
                          <th className="text-center py-1 px-1 font-normal">Left</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  ) : null}
                </thead>
                <tbody>
                  {staffBalances.map((row: any) => (
                    <tr key={row.user.id} className="border-b border-[#cfc2d6]/8 hover:bg-[#f3f4f9]/50">
                      <td className="py-2 px-3 font-medium text-[#4d4354]">{row.user.fullName}</td>
                      <td className="py-2 px-3 text-[#4d4354]/60 capitalize">{row.user.role.toLowerCase().replace("_", " ")}</td>
                      {types.map((t: any) => {
                        const b = (row.balances as any[]).find((bl: any) => bl.leaveTypeId === t.id);
                        const alloc = b ? b.allocated / 10 : 0;
                        const used = b ? b.approved / 10 : 0;
                        const left = b ? b.remaining / 10 : 0;
                        return (
                          <React.Fragment key={t.id}>
                            <td className="text-center py-2 px-1 text-[#4d4354]/70">{alloc}</td>
                            <td className="text-center py-2 px-1 text-[#4d4354]/70">{used}</td>
                            <td className={`text-center py-2 px-1 font-semibold ${left <= 0 && alloc > 0 ? "text-rose-600" : left <= alloc * 0.2 && alloc > 0 ? "text-amber-600" : "text-emerald-600"}`}>{left}</td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Module 10 — Payroll
// Search by role + month + year → Generate DRAFT run → edit lines →
// mark paid (posts an idempotent EXPENSE ledger entry) → printable report.
const PAYROLL_ROLES = ["", "TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN"];

function paisa(value: number) {
  return `Rs ${(value / 100).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PayrollPanel({ campusId }: { campusId?: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [role, setRole] = useState("");

  const [run, setRun] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;

  const loadRun = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll?month=${month}&year=${year}${role ? `&role=${role}` : ""}${campusId ? `&campusId=${campusId}` : ""}`);
      const json = await res.json();
      if (json.success) {
        setRun(json.data.run);
        setPaymentMethods(json.data.paymentMethods || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [campusId, month, year, role]);

  useEffect(() => {
    loadRun();
  }, [loadRun]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, role: role || null, campusId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Generation failed");
      setRun(json.data);
      toast.success(json.regenerated ? `Payroll ${monthLabel} regenerated` : `Payroll ${monthLabel} generated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const saveLine = async (id: string, field: "basic" | "allowances" | "deductions" | "bonus", raw: string) => {
    setSavingId(id);
    try {
      const res = await fetch("/api/payroll/lines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: Math.round((Number(raw) || 0) * 100) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Save failed");
      setRun((prev: any) => ({
        ...prev,
        lines: (prev?.lines || []).map((l: any) => (l.id === id ? { ...l, ...json.data } : l)),
      }));
      toast.success("Line updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  const markPaid = async (line: any) => {
    if (!paymentMethods.length) {
      toast.error("Add a payment method in Accounts first");
      return;
    }
    setSavingId(line.id);
    try {
      const res = await fetch("/api/payroll/lines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: line.id, status: "PAID", paymentMethodId: paymentMethods[0].id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Marking paid failed");
      setRun((prev: any) => ({
        ...prev,
        lines: (prev?.lines || []).map((l: any) => (l.id === line.id ? { ...l, ...json.data } : l)),
      }));
      toast.success(json.alreadyPaid ? "Already paid" : `Paid ${line.user?.fullName} — expense posted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Marking paid failed");
    } finally {
      setSavingId(null);
    }
  };

  const loadReport = async () => {
    setReportLoading(true);
    try {
      const res = await fetch(`/api/payroll/report?from=${monthLabel}&to=${monthLabel}${campusId ? `&campusId=${campusId}` : ""}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Report failed");
      setReport(json.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report failed");
    } finally {
      setReportLoading(false);
    }
  };

  const totals = useMemo(() => {
    const t = { basic: 0, allowances: 0, deductions: 0, bonus: 0, net: 0, paid: 0 };
    for (const l of run?.lines || []) {
      t.basic += l.basic;
      t.allowances += l.allowances;
      t.deductions += l.deductions;
      t.bonus += l.bonus;
      t.net += l.net;
      if (l.status === "PAID") t.paid += l.net;
    }
    return t;
  }, [run]);

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={Banknote} title="Payroll" />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={String(month)}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="h-10 w-28 cursor-pointer rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleString("default", { month: "short" })}
              </option>
            ))}
          </select>
          <select
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-10 w-28 cursor-pointer rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-10 w-40 cursor-pointer rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
          >
            {PAYROLL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r ? r.replace("_", " ") : "All roles"}
              </option>
            ))}
          </select>
          <BrandButton variant="dark" icon={<Sparkles className="h-4 w-4" />} onClick={generate} disabled={generating}>
            {generating ? "Generating…" : run ? "Regenerate" : "Generate Payroll"}
          </BrandButton>
        </div>
      </div>

      {run ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-[#f6f2fa] px-4 py-3">
          <span className="text-sm font-bold text-[#4d4354]">
            {monthLabel} · {run.lines.length} staff · {run.status}
          </span>
          <span className="text-sm font-black text-[#8127cf]">{paisa(totals.net)} net</span>
          <span className="text-xs font-semibold text-emerald-600">{paisa(totals.paid)} paid</span>
        </div>
      ) : null}

      {loading ? (
        <EmptyInline text="Loading payroll…" />
      ) : run && run.lines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#cfc2d6]/15 text-[#4d4354]/55 text-xs uppercase tracking-wider">
                <th className="text-left py-2 px-3 font-medium">Staff Member</th>
                <th className="text-left py-2 px-3 font-medium">Role</th>
                <th className="text-right py-2 px-3 font-medium">Basic</th>
                <th className="text-right py-2 px-3 font-medium">Allowances</th>
                <th className="text-right py-2 px-3 font-medium">Deductions</th>
                <th className="text-right py-2 px-3 font-medium">Bonus</th>
                <th className="text-right py-2 px-3 font-medium">Net</th>
                <th className="text-center py-2 px-3 font-medium">Status</th>
                <th className="text-right py-2 px-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {run.lines.map((line: any) => (
                <tr key={line.id} className="border-b border-[#cfc2d6]/8 hover:bg-[#f3f4f9]/50">
                  <td className="py-2 px-3 font-medium text-[#4d4354]">{line.user?.fullName}</td>
                  <td className="py-2 px-3 text-[#4d4354]/60 capitalize">{(line.user?.role || "").toLowerCase().replace("_", " ")}</td>
                  <EditableAmountCell
                    value={line.basic}
                    disabled={line.status === "PAID" || savingId === line.id}
                    onSave={(raw) => saveLine(line.id, "basic", raw)}
                  />
                  <EditableAmountCell
                    value={line.allowances}
                    disabled={line.status === "PAID" || savingId === line.id}
                    onSave={(raw) => saveLine(line.id, "allowances", raw)}
                  />
                  <EditableAmountCell
                    value={line.deductions}
                    disabled={line.status === "PAID" || savingId === line.id}
                    onSave={(raw) => saveLine(line.id, "deductions", raw)}
                  />
                  <EditableAmountCell
                    value={line.bonus}
                    disabled={line.status === "PAID" || savingId === line.id}
                    onSave={(raw) => saveLine(line.id, "bonus", raw)}
                  />
                  <td className="text-right py-2 px-3 font-black text-[#1f1a23]">{paisa(line.net)}</td>
                  <td className="text-center py-2 px-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                        line.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {line.status === "PAID" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {line.status}
                    </span>
                  </td>
                  <td className="text-right py-2 px-3">
                    {line.status === "PAID" ? (
                      <span className="text-xs font-semibold text-[#4d4354]/45">{line.paidAt ? new Date(line.paidAt).toLocaleDateString() : ""}</span>
                    ) : (
                      <BrandButton variant="soft" icon={<Check className="h-3.5 w-3.5" />} onClick={() => markPaid(line)} disabled={savingId === line.id}>
                        {savingId === line.id ? "Saving…" : "Mark Paid"}
                      </BrandButton>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#f6f2fa] font-black text-[#1f1a23]">
                <td className="py-2.5 px-3" colSpan={2}>
                  Totals
                </td>
                <td className="text-right py-2.5 px-3">{paisa(totals.basic)}</td>
                <td className="text-right py-2.5 px-3">{paisa(totals.allowances)}</td>
                <td className="text-right py-2.5 px-3">{paisa(totals.deductions)}</td>
                <td className="text-right py-2.5 px-3">{paisa(totals.bonus)}</td>
                <td className="text-right py-2.5 px-3">{paisa(totals.net)}</td>
                <td className="text-center py-2.5 px-3 text-[#4d4354]/60">
                  {run.lines.filter((l: any) => l.status === "PAID").length}/{run.lines.length} paid
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyInline text={`No payroll run for ${monthLabel}. Set a staff member's basic salary (Staff Records) and click Generate Payroll.`} />
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#cfc2d6]/15 pt-5">
        <div>
          <h4 className="text-sm font-black tracking-tight text-[#1f1a23]">Payroll Report</h4>
          <p className="text-xs font-bold text-[#4d4354]/55">Summary for {monthLabel} — totals per run and per staff</p>
        </div>
        <div className="flex gap-2">
          <BrandButton variant="soft" icon={<Download className="h-4 w-4" />} onClick={loadReport} disabled={reportLoading}>
            {reportLoading ? "Loading…" : "Load Report"}
          </BrandButton>
          <BrandButton variant="dark" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()} disabled={!report}>
            Print
          </BrandButton>
        </div>
      </div>

      {report ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[#cfc2d6]/15">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#cfc2d6]/15 bg-[#f6f2fa] text-[#4d4354]/55 text-xs uppercase tracking-wider">
                <th className="text-left py-2 px-3 font-medium">Run</th>
                <th className="text-right py-2 px-3 font-medium">Basic</th>
                <th className="text-right py-2 px-3 font-medium">Allowances</th>
                <th className="text-right py-2 px-3 font-medium">Deductions</th>
                <th className="text-right py-2 px-3 font-medium">Bonus</th>
                <th className="text-right py-2 px-3 font-medium">Net</th>
                <th className="text-right py-2 px-3 font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {report.runs.map((r: any) => (
                <tr key={r.id} className="border-b border-[#cfc2d6]/8">
                  <td className="py-2 px-3 font-medium text-[#4d4354]">
                    {r.year}-{String(r.month).padStart(2, "0")} <span className="text-[#4d4354]/45 font-semibold">({r.lines.length} lines)</span>
                  </td>
                  <td className="text-right py-2 px-3">{paisa(r.totals.basic)}</td>
                  <td className="text-right py-2 px-3">{paisa(r.totals.allowances)}</td>
                  <td className="text-right py-2 px-3">{paisa(r.totals.deductions)}</td>
                  <td className="text-right py-2 px-3">{paisa(r.totals.bonus)}</td>
                  <td className="text-right py-2 px-3 font-bold">{paisa(r.totals.net)}</td>
                  <td className="text-right py-2 px-3 font-bold text-emerald-600">{paisa(r.totals.paid)}</td>
                </tr>
              ))}
              <tr className="bg-[#f6f2fa] font-black text-[#1f1a23]">
                <td className="py-2.5 px-3">Grand Total</td>
                <td className="text-right py-2.5 px-3">{paisa(report.grand.basic)}</td>
                <td className="text-right py-2.5 px-3">{paisa(report.grand.allowances)}</td>
                <td className="text-right py-2.5 px-3">{paisa(report.grand.deductions)}</td>
                <td className="text-right py-2.5 px-3">{paisa(report.grand.bonus)}</td>
                <td className="text-right py-2.5 px-3">{paisa(report.grand.net)}</td>
                <td className="text-right py-2.5 px-3 text-emerald-600">{paisa(report.grand.paid)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function EditableAmountCell({ value, disabled, onSave }: { value: number; disabled?: boolean; onSave: (raw: string) => void }) {
  const [draft, setDraft] = useState(String((value / 100).toFixed(2)));
  useEffect(() => {
    setDraft(String((value / 100).toFixed(2)));
  }, [value]);

  if (disabled) {
    return <td className="text-right py-2 px-3 text-[#4d4354]/60">{paisa(value)}</td>;
  }
  return (
    <td className="py-1 px-3 text-right">
      <input
        className="w-24 rounded-lg border border-[#cfc2d6]/25 bg-white px-2 py-1 text-right text-sm font-semibold text-[#4d4354] focus:border-[#8127cf] focus:outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (Number(draft) >= 0 && draft !== String((value / 100).toFixed(2))) onSave(draft);
          else setDraft(String((value / 100).toFixed(2)));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </td>
  );
}

// ────────────────────────────────────────────────────────────
// Module 11 — Roles & Permissions Matrix
// Modules down, View/Add/Edit/Delete across, one tab per role.
// APP_OWNER / SUPER_ADMIN are fixed (full access, not editable).
const PERM_ROLES = [
  { id: "CAMPUS_ADMIN", label: "Campus Admin" },
  { id: "PRINCIPAL", label: "Principal" },
  { id: "TEACHER", label: "Teacher" },
  { id: "ACCOUNTANT", label: "Accountant" },
  { id: "LIBRARIAN", label: "Librarian" },
  { id: "RECEPTIONIST", label: "Receptionist" },
  { id: "PARENT", label: "Parent" },
  { id: "STUDENT", label: "Student" },
];

const PERM_ACTIONS = [
  { key: "canView", label: "View" },
  { key: "canAdd", label: "Add" },
  { key: "canEdit", label: "Edit" },
  { key: "canDelete", label: "Delete" },
] as const;

export function RolePermissionsPanel() {
  const [matrix, setMatrix] = useState<any>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [activeRole, setActiveRole] = useState("PRINCIPAL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/roles/permissions");
      const json = await res.json();
      if (json.success) {
        setMatrix(json.data.matrix);
        setModules(json.data.modules || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (module: string, action: string) => {
    if (!matrix || matrix[activeRole]._fixed) return;
    const current = matrix[activeRole][module][action];
    setSaving(`${module}:${action}`);
    try {
      const res = await fetch("/api/roles/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: activeRole, module, [action]: !current }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Update failed");
      setMatrix((prev: any) => ({
        ...prev,
        [activeRole]: {
          ...prev[activeRole],
          [module]: { ...prev[activeRole][module], [action]: !current },
        },
      }));
      toast.success(`${action.replace("can", "").toUpperCase()} ${module} updated for ${PERM_ROLES.find((r) => r.id === activeRole)?.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setSaving(null);
    }
  };

  const roleRow = PERM_ROLES.find((r) => r.id === activeRole);
  const isFixed = matrix?.[activeRole]?._fixed;

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={Shield} title="Role Permissions" />
        <div className="flex flex-wrap items-center gap-2">
          {PERM_ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveRole(r.id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                activeRole === r.id
                  ? "bg-[#1f1a23] text-white"
                  : "bg-[#f3f4f9] text-[#4d4354]/70 hover:bg-[#e9e6ef]"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isFixed ? (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#f6f2fa] px-4 py-3 text-sm font-bold text-[#4d4354]">
          <Lock className="h-4 w-4 text-[#8127cf]" />
          {roleRow?.label} has full access by default and cannot be edited — a school can never lock itself out.
        </div>
      ) : null}

      {loading ? (
        <EmptyInline text="Loading permissions…" />
      ) : !matrix ? (
        <EmptyInline text="Could not load permissions." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#cfc2d6]/15 text-[#4d4354]/55 text-xs uppercase tracking-wider">
                <th className="text-left py-2 px-3 font-medium">Module</th>
                {PERM_ACTIONS.map((a) => (
                  <th key={a.key} className="text-center py-2 px-3 font-medium">
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((module: string) => {
                const flags = matrix[activeRole][module] || {};
                return (
                  <tr key={module} className="border-b border-[#cfc2d6]/8 hover:bg-[#f3f4f9]/50">
                    <td className="py-2 px-3 font-semibold capitalize text-[#4d4354]">{module.replace("-", " ")}</td>
                    {PERM_ACTIONS.map((a) => {
                      const on = Boolean(flags[a.key]);
                      return (
                        <td key={a.key} className="text-center py-2 px-3">
                          {isFixed ? (
                            <CheckCircle2 className={cn("mx-auto h-4.5 w-4.5", on ? "text-emerald-500" : "text-[#cfc2d6]/40")} />
                          ) : (
                            <button
                              onClick={() => toggle(module, a.key)}
                              disabled={saving === `${module}:${a.key}`}
                              className={cn(
                                "relative inline-flex h-5.5 w-10 items-center rounded-full transition-colors",
                                on ? "bg-[#8127cf]" : "bg-[#ddd6e4]",
                                saving === `${module}:${a.key}` && "opacity-60"
                              )}
                              aria-label={`${module} ${a.label}`}
                            >
                              <span
                                className={cn(
                                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                  on ? "translate-x-5" : "translate-x-0.5"
                                )}
                              />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs font-bold text-[#4d4354]/45">
            Changes apply immediately to that role across all admins without re-login. Enforcement is server-side — the UI
            only mirrors what the API enforces.
          </p>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Module 12 — Class Rooms
const ROOM_COLORS = [
  "bg-gradient-to-br from-[#8127cf] to-[#55208b]",
  "bg-gradient-to-br from-[#0ea5e9] to-[#1d4ed8]",
  "bg-gradient-to-br from-[#10b981] to-[#047857]",
  "bg-gradient-to-br from-[#f59e0b] to-[#b45309]",
  "bg-gradient-to-br from-[#ef4444] to-[#991b1b]",
  "bg-gradient-to-br from-[#8b5cf6] to-[#5b21b6]",
];

export function RoomsPanel({ campusId }: { campusId?: string }) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ roomNumber: "", capacity: "0", note: "" });
  const [busy, setBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/academic/rooms${campusId ? `?campusId=${campusId}` : ""}`);
      const json = await res.json();
      if (json.success) setRooms(json.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [campusId]);

  useEffect(() => {
    load();
  }, [load, reloadTick]);

  const addRoom = async () => {
    if (!form.roomNumber.trim()) {
      toast.error("Room number is required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/academic/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomNumber: form.roomNumber, capacity: Number(form.capacity) || 0, note: form.note, campusId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Create failed");
      toast.success(`Room "${form.roomNumber}" added`);
      setShowAdd(false);
      setForm({ roomNumber: "", capacity: "0", note: "" });
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const updateRoom = async (id: string, field: "capacity" | "roomNumber", value: string) => {
    try {
      const res = await fetch("/api/academic/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: field === "capacity" ? Number(value) || 0 : value }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Update failed");
      toast.success("Room updated");
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  const deleteRoom = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/academic/rooms?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Delete failed");
      toast.success("Room removed");
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={Building} title="Class Rooms" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd((v) => !v)}>
          Add Room
        </BrandButton>
      </div>

      {showAdd ? (
        <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#cfc2d6]/20 bg-[#f6f2fa] p-4">
          <div>
            <label className="mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45">Room Number</label>
            <input
              className="h-10 w-32 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
              value={form.roomNumber}
              onChange={(e) => setForm((f) => ({ ...f, roomNumber: e.target.value }))}
              placeholder="R-101"
            />
          </div>
          <div>
            <label className="mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45">Capacity</label>
            <input
              type="number"
              min={0}
              className="h-10 w-24 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            />
          </div>
          <div className="min-w-40 flex-1">
            <label className="mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45">Note</label>
            <input
              className="h-10 w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-semibold text-[#4d4354] outline-none focus:border-[#8127cf]/40"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <BrandButton variant="dark" icon={<Check className="h-4 w-4" />} onClick={addRoom} disabled={busy}>
            {busy ? "Adding…" : "Create"}
          </BrandButton>
        </div>
      ) : null}

      {loading ? (
        <EmptyInline text="Loading rooms…" />
      ) : rooms.length === 0 ? (
        <EmptyInline text="No rooms yet. Add your first class room above." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room, i) => (
            <div
              key={room.id}
              className="rounded-3xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/30 p-5 transition-shadow hover:shadow-[0_8px_24px_-8px_rgba(129,39,207,0.25)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black text-white ${ROOM_COLORS[i % ROOM_COLORS.length]}`}>
                  {room.roomNumber.slice(0, 2).toUpperCase()}
                </div>
                <button
                  onClick={() => deleteRoom(room.id)}
                  disabled={deleting === room.id}
                  className="rounded-lg p-1.5 text-[#4d4354]/35 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Delete room"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input
                className="mt-3 w-full bg-transparent text-lg font-black tracking-tight text-[#1f1a23] outline-none focus:border-b focus:border-[#8127cf]/30"
                value={room.roomNumber}
                onChange={(e) => updateRoom(room.id, "roomNumber", e.target.value)}
                onBlur={(e) => {
                  if (e.target.value.trim() !== room.roomNumber) updateRoom(room.id, "roomNumber", e.target.value.trim());
                }}
              />
              <div className="mt-2 flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-[#4d4354]/40" />
                <input
                  type="number"
                  min={0}
                  className="w-20 bg-transparent text-sm font-bold text-[#4d4354] outline-none focus:border-b focus:border-[#8127cf]/30"
                  value={room.capacity}
                  onChange={(e) => updateRoom(room.id, "capacity", e.target.value)}
                  onBlur={(e) => {
                    if (Number(e.target.value) !== room.capacity) updateRoom(room.id, "capacity", e.target.value);
                  }}
                />
                <span className="text-xs font-semibold text-[#4d4354]/40">seats</span>
              </div>
              {room.note ? <p className="mt-2 text-xs font-semibold text-[#4d4354]/55">{room.note}</p> : null}
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/35">
                {room._count?.slots ?? 0} timetable slot(s)
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Module 12 — Period Definitions
export function PeriodsPanel({ campusId }: { campusId?: string }) {
  const [timeType, setTimeType] = useState<"CLASS" | "EXAM">("CLASS");
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ periodNumber: "", startTime: "08:00", endTime: "08:40" });
  const [busy, setBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/academic/periods?timeType=${timeType}${campusId ? `&campusId=${campusId}` : ""}`);
      const json = await res.json();
      if (json.success) setPeriods(json.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [campusId, timeType]);

  useEffect(() => {
    load();
  }, [load, reloadTick]);

  const addPeriod = async () => {
    const num = parseInt(form.periodNumber, 10);
    if (!Number.isFinite(num) || num < 1) {
      toast.error("Period number must be >= 1");
      return;
    }
    if (!form.startTime || !form.endTime || form.startTime >= form.endTime) {
      toast.error("End time must be after start time");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/academic/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeType, periodNumber: num, startTime: form.startTime, endTime: form.endTime, campusId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Create failed");
      toast.success(`Period ${num} (${form.startTime}–${form.endTime}) added`);
      setShowAdd(false);
      setForm({ periodNumber: String(periods.length + 1), startTime: form.endTime, endTime: shiftMinutes(form.endTime, 40) });
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const updatePeriod = async (id: string, field: "startTime" | "endTime" | "periodNumber", value: string) => {
    try {
      const res = await fetch("/api/academic/periods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Update failed");
      if (json.warning) toast.warning(json.warning);
      else toast.success("Period updated");
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  const deletePeriod = async (id: string) => {
    try {
      const res = await fetch(`/api/academic/periods?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Delete failed");
      if (json.warning) toast.warning(json.warning);
      else toast.success("Period removed");
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={Clock} title="Class & Exam Time Setup" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-[#f3f4f9] p-1">
            {(["CLASS", "EXAM"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeType(t)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
                  timeType === t ? "bg-[#1f1a23] text-white" : "text-[#4d4354]/60 hover:text-[#4d4354]"
                )}
              >
                {t === "CLASS" ? "Class Periods" : "Exam Periods"}
              </button>
            ))}
          </div>
          <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd((v) => !v)}>
            Add Period
          </BrandButton>
        </div>
      </div>

      {showAdd ? (
        <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#cfc2d6]/20 bg-[#f6f2fa] p-4">
          <div>
            <label className="mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45">Period #</label>
            <input
              type="number"
              min={1}
              className="h-10 w-20 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
              value={form.periodNumber}
              onChange={(e) => setForm((f) => ({ ...f, periodNumber: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45">Start</label>
            <input
              type="time"
              className="h-10 w-28 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45">End</label>
            <input
              type="time"
              className="h-10 w-28 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            />
          </div>
          <BrandButton variant="dark" icon={<Check className="h-4 w-4" />} onClick={addPeriod} disabled={busy}>
            {busy ? "Adding…" : "Create"}
          </BrandButton>
        </div>
      ) : null}

      {loading ? (
        <EmptyInline text="Loading periods…" />
      ) : periods.length === 0 ? (
        <EmptyInline text="No periods defined yet. These drive the timetable grid row headers." />
      ) : (
        <div className="space-y-2">
          {periods.map((p, i) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#cfc2d6]/15 bg-[#fbf0fe]/25 px-4 py-3"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black text-white ${ROOM_COLORS[i % ROOM_COLORS.length]}`}>
                {p.periodNumber}
              </span>
              <span className="text-sm font-bold text-[#4d4354]/45">Period {p.periodNumber}</span>
              <input
                type="time"
                className="h-9 rounded-xl border border-[#cfc2d6]/20 bg-white px-2.5 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
                value={p.startTime}
                onChange={(e) => updatePeriod(p.id, "startTime", e.target.value)}
                onBlur={(e) => {
                  if (e.target.value !== p.startTime && e.target.value < p.endTime) updatePeriod(p.id, "startTime", e.target.value);
                }}
              />
              <span className="text-xs font-bold text-[#4d4354]/40">to</span>
              <input
                type="time"
                className="h-9 rounded-xl border border-[#cfc2d6]/20 bg-white px-2.5 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
                value={p.endTime}
                onChange={(e) => updatePeriod(p.id, "endTime", e.target.value)}
                onBlur={(e) => {
                  if (e.target.value !== p.endTime && e.target.value > p.startTime) updatePeriod(p.id, "endTime", e.target.value);
                }}
              />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/30">
                {timeType === "CLASS" ? "Class" : "Exam"} period
              </span>
              <button
                onClick={() => deletePeriod(p.id)}
                className="ml-auto rounded-lg p-1.5 text-[#4d4354]/35 transition-colors hover:bg-rose-50 hover:text-rose-600"
                aria-label="Delete period"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <p className="pt-2 text-xs font-bold text-[#4d4354]/45">
            Overlapping times within a type are rejected. Changing a period's time after a timetable exists warns you and
            leaves existing slots untouched.
          </p>
        </div>
      )}
    </div>
  );
}

function shiftMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + mins) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ────────────────────────────────────────────────────────────
// Module 13 — Exam Routine / Date Sheet
interface RoutineSchedule {
  id: string;
  subjectId: string;
  date: string;
  periodDefinitionId: string | null;
  roomId: string | null;
  subject: { id: string; name: string; totalMarks: number } | null;
  periodDefinition: { id: string; periodNumber: number; startTime: string; endTime: string } | null;
  room: { id: string; roomNumber: string; capacity: number } | null;
  exam: { id: string; title: string; class: { name: string; section: string | null } };
}

const WEEKDAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ExamRoutinePanel({ campusId }: { campusId?: string }) {
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [subjects, setSubjects] = useState<any[]>([]);
  const [periodDefs, setPeriodDefs] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<RoutineSchedule[]>([]);
  const [weekends, setWeekends] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { date: string; periodDefinitionId: string; roomId: string }>>({});

  const qp = campusId ? `?campusId=${campusId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exRes, calRes] = await Promise.all([
        fetch(`/api/exams${qp}`),
        fetch(`/api/academic/calendar${qp}`),
      ]);
      const [exJson, calJson] = await Promise.all([exRes.json(), calRes.json()]);
      if (exJson.success) setExams(exJson.exams || []);
      if (calJson.success) setWeekends(calJson.data.weekends || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedExamId && exams.length > 0) setSelectedExamId(exams[0].id);
  }, [exams, selectedExamId]);

  useEffect(() => {
    if (!selectedExamId) {
      setSubjects([]);
      setSchedules([]);
      return;
    }
    const exam = exams.find((e) => e.id === selectedExamId);
    const classId = exam?.classId;
    Promise.all([
      classId ? fetch(`/api/subjects?classId=${classId}${qp}`).then((r) => r.json()) : Promise.resolve({}),
      fetch(`/api/academic/exam-schedule?examId=${selectedExamId}${qp}`).then((r) => r.json()),
      fetch(`/api/academic/periods?timeType=EXAM${qp}`).then((r) => r.json()),
      fetch(`/api/academic/rooms${qp}`).then((r) => r.json()),
    ])
      .then(([subJson, schJson, perJson, roomJson]) => {
        if (subJson.success || Array.isArray(subJson.data)) setSubjects(subJson.data || subJson || []);
        if (schJson.success) setSchedules(schJson.data || []);
        if (perJson.success) setPeriodDefs(perJson.data || []);
        if (roomJson.success) setRooms(roomJson.data || []);
      })
      .catch(() => {});
  }, [selectedExamId, exams, qp]);

  const selectedExam = exams.find((e) => e.id === selectedExamId);
  const remaining = subjects.filter((s) => !schedules.some((sch) => sch.subjectId === s.id));

  const saveSchedule = async (subject: any, draft: { date: string; periodDefinitionId: string; roomId: string }) => {
    setBusyId(subject.id);
    try {
      const existing = schedules.find((s) => s.subjectId === subject.id);
      const res = await fetch("/api/academic/exam-schedule", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(existing ? { id: existing.id } : { examId: selectedExamId, subjectId: subject.id }),
          date: draft.date,
          periodDefinitionId: draft.periodDefinitionId || null,
          roomId: draft.roomId || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Save failed");
      toast.success(`${subject.name} scheduled`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[subject.id];
        return next;
      });
      const schRes = await fetch(`/api/academic/exam-schedule?examId=${selectedExamId}${qp}`).then((r) => r.json());
      if (schRes.success) setSchedules(schRes.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusyId(null);
    }
  };

  const removeSchedule = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/academic/exam-schedule?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Delete failed");
      toast.success("Paper removed from routine");
      const schRes = await fetch(`/api/academic/exam-schedule?examId=${selectedExamId}${qp}`).then((r) => r.json());
      if (schRes.success) setSchedules(schRes.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, RoutineSchedule[]>();
    for (const s of schedules) {
      const key = s.date.slice(0, 10);
      map.set(key, [...(map.get(key) || []), s]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [schedules]);

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={CalendarClock} title="Exam Routine / Date Sheet" />
        <div className="flex flex-wrap items-center gap-2">
          {selectedExamId && grouped.length > 0 && (
            <BrandButton variant="dark" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print Date Sheet
            </BrandButton>
          )}
          <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 cursor-pointer"
            >
              <option value="">— Select exam cycle —</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} ({classLabel(e.class)})
                </option>
              ))}
            </select>
        </div>
      </div>

      {!selectedExamId && (
        <div className="flex flex-col items-center justify-center py-12">
          <CalendarDays className="mb-4 h-12 w-12 text-[#8127cf]/25" />
          <p className="text-sm font-bold text-[#4d4354]/50">
            {exams.length === 0 ? "No exam cycles yet. Create one in Exam Cycles, then build its date sheet." : "Pick an exam cycle above to build its date sheet"}
          </p>
        </div>
      )}

      {selectedExamId ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-[#f6f2fa] p-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">{selectedExam?.title}</span>
            <span className="text-[10px] font-bold text-[#4d4354]/50">
              {selectedExam ? classLabel(selectedExam.class) : ""} · {selectedExam?.term} · {selectedExam?.academicYear}
            </span>
            {weekends.length > 0 && (
              <span className="ml-auto text-[9px] font-bold text-amber-600">
                Weekends: {weekends.map((d) => WEEKDAY_LABELS[d]).join(", ")} — papers can't be scheduled there
              </span>
            )}
          </div>

          {subjects.length === 0 ? (
            <EmptyInline text="No subjects for this class. Add subjects before scheduling papers." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-[#cfc2d6]/15">
                    <th className="py-2.5 pr-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/45">Subject</th>
                    <th className="py-2.5 pr-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/45">Date</th>
                    <th className="py-2.5 pr-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/45">Time (EXAM)</th>
                    <th className="py-2.5 pr-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/45">Room</th>
                    <th className="py-2.5 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/45" />
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subject) => {
                    const sch = schedules.find((s) => s.subjectId === subject.id);
                    const draft = drafts[subject.id] || {
                      date: "",
                      periodDefinitionId: sch?.periodDefinitionId || "",
                      roomId: sch?.roomId || "",
                    };
                    return (
                      <tr key={subject.id} className="border-b border-[#cfc2d6]/10 last:border-b-0">
                        <td className="py-2.5 pr-3">
                          <p className="text-sm font-bold text-[#1f1a23]">{subject.name}</p>
                          <p className="text-[10px] font-semibold text-[#4d4354]/40">
                            {subject.totalMarks} marks{subject.teacher ? ` · ${subject.teacher.fullName}` : ""}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="date"
                            value={sch ? sch.date.slice(0, 10) : draft.date}
                            onChange={(e) => setDrafts((d) => ({ ...d, [subject.id]: { ...(d[subject.id] || {}), date: e.target.value } }))}
                            className="h-9 rounded-xl border border-[#cfc2d6]/20 bg-white px-2.5 text-xs font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <select
                            value={sch ? sch.periodDefinitionId || "" : draft.periodDefinitionId}
                            onChange={(e) => setDrafts((d) => ({ ...d, [subject.id]: { ...(d[subject.id] || {}), periodDefinitionId: e.target.value } }))}
                            className="h-9 w-36 rounded-xl border border-[#cfc2d6]/20 bg-white px-2.5 text-xs font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 cursor-pointer"
                          >
                            <option value="">— Time —</option>
                            {periodDefs.map((p) => (
                              <option key={p.id} value={p.id}>
                                P{p.periodNumber} {p.startTime}–{p.endTime}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 pr-3">
                          <select
                            value={sch ? sch.roomId || "" : draft.roomId}
                            onChange={(e) => setDrafts((d) => ({ ...d, [subject.id]: { ...(d[subject.id] || {}), roomId: e.target.value } }))}
                            className="h-9 w-32 rounded-xl border border-[#cfc2d6]/20 bg-white px-2.5 text-xs font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 cursor-pointer"
                          >
                            <option value="">— Room —</option>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.roomNumber}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 text-right">
                          {sch ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const sd = { ...drafts[subject.id], date: sch.date.slice(0, 10) };
                                  saveSchedule(subject, sd);
                                }}
                                disabled={busyId === subject.id}
                                className="flex h-8 items-center gap-1 rounded-lg bg-[#8127cf] px-2.5 text-[9px] font-black uppercase tracking-wider text-white hover:bg-[#6a1fb0] disabled:opacity-50 cursor-pointer"
                              >
                                <Check className="h-3 w-3" />Save
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSchedule(sch.id)}
                                disabled={busyId === subject.id}
                                className="flex h-8 items-center gap-1 rounded-lg bg-rose-50 px-2.5 text-[9px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                              >
                                <Trash2 className="h-3 w-3" />Remove
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => saveSchedule(subject, draft)}
                              disabled={busyId === subject.id || !draft.date}
                              className="flex h-8 items-center gap-1 rounded-lg bg-[#1f1a23] px-3 text-[9px] font-black uppercase tracking-wider text-white hover:bg-[#3a3341] disabled:opacity-40 cursor-pointer"
                            >
                              {busyId === subject.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                              Add Paper
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {grouped.length > 0 && (
            <div className="mt-8">
              <h4 className="mb-3 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50">Date Sheet — {selectedExam?.title}</h4>
              <div className="space-y-4">
                {grouped.map(([date, rows]) => {
                  const weekday = WEEKDAY_LABELS[new Date(date + "T00:00:00").getDay() === 0 ? 7 : new Date(date + "T00:00:00").getDay()];
                  return (
                    <div key={date} className="rounded-2xl border border-[#cfc2d6]/15 bg-[#fbf0fe]/25 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-black text-[#8127cf]">{date} · {weekday}</p>
                        <span className="text-[9px] font-bold text-[#4d4354]/40">{rows.length} paper(s)</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {rows.map((row) => (
                          <div key={row.id} className="flex items-center gap-2 rounded-xl bg-white p-3">
                            <span className="h-8 w-8 shrink-0 rounded-lg bg-[#8127cf]/10 flex items-center justify-center text-[10px] font-black text-[#8127cf]">
                              P{row.periodDefinition?.periodNumber || "—"}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-[#1f1a23]">{row.subject?.name}</p>
                              <p className="text-[9px] font-semibold text-[#4d4354]/45">
                                {row.periodDefinition ? `${row.periodDefinition.startTime}–${row.periodDefinition.endTime}` : "Any time"}
                                {row.room ? ` · ${row.room.roomNumber}` : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}

      {loading ? <EmptyInline text="Loading exam cycles…" /> : null}

      {/* Print-only date sheet */}
      {selectedExam && grouped.length > 0 ? (
        <div id="datesheet-print-root">
          <style>{`
            @media screen { #datesheet-print-root { display: none; } }
            @media print {
              body * { visibility: hidden; }
              #datesheet-print-root, #datesheet-print-root * { visibility: visible; }
              #datesheet-print-root { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
              #datesheet-print-root h2 { font-size: 16px; font-weight: 800; margin: 0 0 4px; }
              #datesheet-print-root .meta { font-size: 11px; color: #555; margin-bottom: 16px; }
              #datesheet-print-root table { width: 100%; border-collapse: collapse; }
              #datesheet-print-root th, #datesheet-print-root td { border: 1px solid #ccc; padding: 6px 8px; font-size: 11px; text-align: left; }
              #datesheet-print-root th { background: #f2eef5; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; }
            }
          `}</style>
          <h2>Date Sheet — {selectedExam.title}</h2>
          <p className="meta">
            {classLabel(selectedExam.class)} · {selectedExam.term} · {selectedExam.academicYear}
            {weekends.length > 0 ? ` · Off days: ${weekends.map((d) => WEEKDAY_LABELS[d]).join(", ")}` : ""}
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
              {grouped.flatMap(([date, rows]) =>
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{date}</td>
                    <td>{WEEKDAY_LABELS[new Date(date + "T00:00:00").getDay() === 0 ? 7 : new Date(date + "T00:00:00").getDay()]}</td>
                    <td>{row.periodDefinition ? `${row.periodDefinition.startTime}–${row.periodDefinition.endTime}` : "—"}</td>
                    <td>{row.subject?.name || "—"}</td>
                    <td>{row.room?.roomNumber || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Module 13 — School Calendar (Weekends + Holidays)
const CALENDAR_DAYS = [
  { num: 1, label: "Mon" },
  { num: 2, label: "Tue" },
  { num: 3, label: "Wed" },
  { num: 4, label: "Thu" },
  { num: 5, label: "Fri" },
  { num: 6, label: "Sat" },
  { num: 7, label: "Sun" },
];

export function SchoolCalendarPanel({ campusId }: { campusId?: string }) {
  const [weekends, setWeekends] = useState<number[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDays, setSavingDays] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", fromDate: "", toDate: "" });
  const [busy, setBusy] = useState(false);

  const qp = campusId ? `?campusId=${campusId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/academic/calendar${qp}`);
      const json = await res.json();
      if (json.success) {
        setWeekends(json.data.weekends || []);
        setHolidays(json.data.holidays || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const toggleDay = async (day: number) => {
    const next = weekends.includes(day) ? weekends.filter((d) => d !== day) : [...weekends, day];
    if (next.length === 0) {
      toast.error("At least one day off is required");
      return;
    }
    setSavingDays(true);
    try {
      const res = await fetch("/api/academic/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: next }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Save failed");
      setWeekends(next.sort());
      toast.success("Weekend days updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSavingDays(false);
    }
  };

  const addHoliday = async () => {
    if (!form.name.trim() || !form.fromDate || !form.toDate) {
      toast.error("Name, from and to dates are required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/academic/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, fromDate: form.fromDate, toDate: form.toDate }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Create failed");
      toast.success(`Holiday "${form.name}" added`);
      setShowAdd(false);
      setForm({ name: "", fromDate: "", toDate: "" });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteHoliday = async (id: string) => {
    try {
      const res = await fetch(`/api/academic/calendar?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Delete failed");
      toast.success("Holiday removed");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <div className="sk-rise rounded-[32px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={CalendarDays} title="School Calendar" />
        <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd((v) => !v)}>
          Add Holiday
        </BrandButton>
      </div>

      {showAdd ? (
        <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#cfc2d6]/20 bg-[#f6f2fa] p-4">
          <div>
            <label className="mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45">Name</label>
            <input
              className="h-10 w-48 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Eid-ul-Adha"
            />
          </div>
          <div>
            <label className="mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45">From</label>
            <input
              type="date"
              className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
              value={form.fromDate}
              onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block pl-1 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/45">To</label>
            <input
              type="date"
              className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
              value={form.toDate}
              onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
            />
          </div>
          <BrandButton variant="dark" icon={<Check className="h-4 w-4" />} onClick={addHoliday} disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </BrandButton>
        </div>
      ) : null}

      {loading ? (
        <EmptyInline text="Loading calendar…" />
      ) : (
        <>
          <div className="mb-6">
            <h4 className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50">Weekly Off Days</h4>
            <div className="flex flex-wrap gap-2">
              {CALENDAR_DAYS.map((d) => {
                const on = weekends.includes(d.num);
                return (
                  <button
                    key={d.num}
                    type="button"
                    onClick={() => toggleDay(d.num)}
                    disabled={savingDays}
                    className={`flex h-10 w-14 flex-col items-center justify-center rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer ${
                      on
                        ? "border-[#8127cf]/30 bg-gradient-to-br from-[#8127cf] to-[#55208b] text-white shadow-lg shadow-[#8127cf]/20"
                        : "border-[#cfc2d6]/20 bg-white text-[#4d4354]/50 hover:border-[#8127cf]/30"
                    }`}
                  >
                    <Sun className="mb-0.5 h-3.5 w-3.5 opacity-70" />
                    {d.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] font-semibold text-[#4d4354]/40">
              Off days are greyed out in the timetable grid; exam papers can't be scheduled on them.
            </p>
          </div>

          <div>
            <h4 className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50">
              Holidays ({holidays.length})
            </h4>
            {holidays.length === 0 ? (
              <EmptyInline text="No holidays yet." />
            ) : (
              <div className="space-y-2">
                {holidays.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#cfc2d6]/15 bg-[#fbf0fe]/25 px-4 py-3">
                    <span className="h-9 w-9 shrink-0 rounded-xl bg-amber-50 flex items-center justify-center">
                      <Sun className="h-4 w-4 text-amber-500" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-[#1f1a23]">{h.name}</p>
                      <p className="text-[10px] font-semibold text-[#4d4354]/45">
                        {String(h.fromDate).slice(0, 10)} → {String(h.toDate).slice(0, 10)}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteHoliday(h.id)}
                      className="ml-auto rounded-lg p-1.5 text-[#4d4354]/35 transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                      aria-label="Delete holiday"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
