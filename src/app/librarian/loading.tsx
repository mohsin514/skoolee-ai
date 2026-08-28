import { ConsoleSkeleton } from "@/components/operations/console-page";
import { RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";

/**
 * Route-level standby. This segment's layout is a passthrough, so this stands
 * in for the whole console — sidebar and header included. `contentCard` is off
 * because `ConsoleSkeleton` already draws the white page card.
 */
export default function DashboardLoading() {
  return (
    <RoleShellSkeleton navRows={5} contentCard={false} label="Loading the library console">
      <ConsoleSkeleton label="Loading the library console" cards={3} />
    </RoleShellSkeleton>
  );
}
