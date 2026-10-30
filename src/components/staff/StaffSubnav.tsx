"use client";

import { Award, Network, Plane, Users } from "lucide-react";
import { SectionSubnav, type SectionNavItem } from "@/components/nav/SectionSubnav";

/**
 * @deprecated No console renders a section strip any more (SPEC §4.3, F14): the Staff group lives in the
 * role registry (`src/lib/navigation/role-nav.ts`) and each view opens with one PageHeader. Kept, with the
 * registry's names, only so an out-of-tree caller keeps compiling for one release. Permissions moved to the
 * authority's People & access (M20), so it is no longer listed here.
 */
export const STAFF_NAV: SectionNavItem[] = [
  { view: "teachers", label: "Teachers", icon: Users, group: "People", tone: "staff" },
  { view: "staff-hierarchy", label: "Staff structure", icon: Network, group: "People", tone: "staff" },
  { view: "leave", label: "Leave approvals", icon: Plane, group: "Manage", tone: "leave" },
  { view: "teacher-performance", label: "Teacher performance", icon: Award, group: "Manage", tone: "reports" },
];

export const STAFF_VIEWS = new Set(STAFF_NAV.map((i) => i.view));

/** Permission module per screen, so the strip hides what the sidebar hides. */
export const STAFF_VIEW_MODULE: Record<string, string> = {
  teachers: "staff",
  "staff-hierarchy": "staff",
  leave: "leave",
  "teacher-performance": "staff",
};

export function StaffSubnav({
  active,
  onNavigate,
  allowed,
}: {
  active: string;
  onNavigate: (view: string) => void;
  allowed?: (view: string) => boolean;
}) {
  return (
    <SectionSubnav
      ariaLabel="Staff"
      items={STAFF_NAV}
      active={active}
      onNavigate={onNavigate}
      allowed={allowed}
    />
  );
}
