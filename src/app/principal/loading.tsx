import { CommandCentreSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";

/**
 * Route-level standby. This segment's layout renders nothing of its own, so
 * this stands in for the *whole* console — sidebar, header and deck. It used
 * to be a bare spinner, which made the sidebar and header vanish on every
 * navigation and rebuild a moment later.
 */
export default function DashboardLoading() {
  return (
    <RoleShellSkeleton navRows={8} label="Loading the academic command centre">
      <CommandCentreSkeleton />
    </RoleShellSkeleton>
  );
}
