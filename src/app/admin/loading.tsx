"use client";

import { CommandCentreSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import { useUiText } from "@/components/locale/LocaleProvider";

/**
 * Route-level standby. This segment's layout renders nothing of its own, so this stands in for the whole
 * console — sidebar, header and the Today view — instead of a bare spinner that made the shell vanish
 * on every navigation and rebuild a moment later. A client component so the announced label is translated.
 */
export default function ConsoleLoading() {
  const ui = useUiText();
  return (
    <RoleShellSkeleton navRows={9} label={ui("Loading your console")}>
      <CommandCentreSkeleton tiles={4} />
    </RoleShellSkeleton>
  );
}
