"use client";

import { CalendarCheck, Clock, CreditCard, FileText, LayoutGrid } from "lucide-react";
import { RoleShell, type RoleNavItem } from "@/components/role-dashboard";
import { useParentData } from "./parent-data-context";

export function ParentShell({ children }: { children: React.ReactNode }) {
  const { data, token } = useParentData();

  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const link = (path: string) => `${path}${q}`;

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Overview", href: link("/parent") },
    { icon: FileText, label: "Results", href: link("/parent/results") },
    { icon: CalendarCheck, label: "Attendance", href: link("/parent/attendance") },
    { icon: Clock, label: "Timetable", href: link("/parent/timetable") },
    { icon: CreditCard, label: "Fees", href: link("/parent/fees") },
  ];

  const child = data?.student;

  return (
    <RoleShell
      navItems={navItems}
      eyebrow="Parent Guardian Console"
      userName={child?.fullName || "Guardian"}
      userRole={child?.className || "Guardian Console"}
      avatarSeed={child?.fullName || "Parent"}
      logoUrl={data?.campus?.logoUrl || data?.campus?.school?.logoUrl}
      dashboardHref={link("/parent")}
    >
      <ChildSwitcher />
      {children}
    </RoleShell>
  );
}

/**
 * Only rendered for guardians with more than one child at the school — a
 * single-child account should not carry a control with nothing to choose.
 */
function ChildSwitcher() {
  const { children: siblings, selectedStudentId, selectChild } = useParentData();
  if (siblings.length < 2) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/50">
        Viewing
      </span>
      {siblings.map((s) => {
        const active = s.id === selectedStudentId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => selectChild(s.id)}
            aria-pressed={active}
            className={
              active
                ? "cursor-pointer rounded-full bg-[#8127cf] px-3.5 py-1.5 text-xs font-bold text-white shadow-[0_4px_14px_-2px_rgba(129,39,207,0.45)]"
                : "cursor-pointer rounded-full border border-[#cfc2d6]/40 bg-white px-3.5 py-1.5 text-xs font-bold text-[#4d4354]/70 transition-colors hover:border-[#8127cf]/40 hover:text-[#8127cf]"
            }
          >
            {s.fullName}
            {s.rollNo ? <span className="ml-1.5 font-semibold opacity-60">{s.rollNo}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
