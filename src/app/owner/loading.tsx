import { PageSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";

/**
 * Route-level standby, in the new design (addendum 2026-10-22): the whole console — sidebar, header and the shell's
 * one page card — with the Schools view's shape inside it (PageHeader, a summary row and the schools list). The
 * platform console has no flagship card, so it is not the Today skeleton. Five rows: the platform console's
 * top-level registry entries (§3).
 */
export default function PlatformConsoleLoading() {
  return (
    <RoleShellSkeleton navRows={5} label="Loading platform operations">
      <PageSkeleton rows={6} />
    </RoleShellSkeleton>
  );
}
