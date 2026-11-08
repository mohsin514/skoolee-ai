"use client";

import { useUiText } from "@/components/locale/LocaleProvider";
import { ConsoleSkeleton } from "@/components/operations/console-page";
import { RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";

/**
 * Route-level standby for the whole console — sidebar, header and the shell's one page card (addendum 2026-10-22).
 * The card's body holds the console's PageHeader and Today shapes (`ConsoleSkeleton bare`), the same shapes the
 * page draws while its own data loads, so nothing jumps when the console arrives. A client component so the
 * screen-reader label follows the display language (the segment layout provides the locale).
 */
export default function DashboardLoading() {
  const tr = useUiText();
  return (
    <RoleShellSkeleton navRows={8} label={tr("Loading the finance desk")}>
      <ConsoleSkeleton bare cards={4} />
    </RoleShellSkeleton>
  );
}
