import { CommandCentreSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";

/**
 * Route-level standby. This segment's layout renders nothing of its own, so
 * this stands in for the *whole* console — sidebar, header and the one page card
 * holding the Today shape (PageHeader, flagship band, the four KPI tiles and the
 * insight cards), the same pieces the console shows while its data loads, so
 * nothing shifts when the page arrives (addendum 2026-10-22, point 3).
 */
export default function DashboardLoading() {
  return (
    <RoleShellSkeleton navRows={8} label="Loading the academic console">
      <CommandCentreSkeleton tiles={4} />
    </RoleShellSkeleton>
  );
}
