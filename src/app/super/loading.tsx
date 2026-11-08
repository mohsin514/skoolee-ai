import { CommandCentreSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";

/**
 * Route-level standby, in the new design (addendum 2026-10-22): the whole console — sidebar, header and the shell's
 * one page card — with the Overview's shape inside it (PageHeader, the AI Workflows flagship card, the tile row and
 * two panels), so nothing moves when the page arrives. Nine rows: the group console's registry entries, the AI
 * Workflows flagship included (§3).
 */
export default function GroupConsoleLoading() {
  return (
    <RoleShellSkeleton navRows={9} label="Loading the group console">
      <CommandCentreSkeleton tiles={4} />
    </RoleShellSkeleton>
  );
}
