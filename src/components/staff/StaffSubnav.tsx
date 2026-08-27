"use client";

import { Award, Network, Plane, Shield, Users } from "lucide-react";
import { SectionSubnav, type SectionNavItem } from "@/components/nav/SectionSubnav";

/**
 * The staff area, on the same strip as Academics.
 *
 * Grouped by what the screens are for rather than by data model: who works
 * here and how they are organised ("People"), then the recurring management
 * jobs — leave, appraisal, access ("Manage").
 */
export const STAFF_NAV: SectionNavItem[] = [
  { view: "teachers", label: "Teachers", icon: Users, group: "People", tone: "staff" },
  { view: "staff-hierarchy", label: "Staff Hierarchy", icon: Network, group: "People", tone: "staff" },
  { view: "leave", label: "Leave", icon: Plane, group: "Manage", tone: "leave" },
  { view: "teacher-performance", label: "Performance", icon: Award, group: "Manage", tone: "reports" },
  { view: "permissions", label: "Permissions", icon: Shield, group: "Manage", tone: "brand" },
];

export const STAFF_VIEWS = new Set(STAFF_NAV.map((i) => i.view));

/** Permission module per screen, so the strip hides what the sidebar hides. */
export const STAFF_VIEW_MODULE: Record<string, string> = {
  teachers: "staff",
  "staff-hierarchy": "staff",
  leave: "leave",
  "teacher-performance": "staff",
  permissions: "staff",
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
