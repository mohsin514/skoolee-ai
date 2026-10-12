"use client";

import { useLocale } from "@/components/locale/LocaleProvider";
import { RoleShellSkeleton, CommandCentreSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import { schoolAICopy } from "@/lib/school-ai/copy";

export default function SchoolAiLoading() {
  const { language } = useLocale();
  return <RoleShellSkeleton navRows={3} label={schoolAICopy(language).loading}><CommandCentreSkeleton /></RoleShellSkeleton>;
}
