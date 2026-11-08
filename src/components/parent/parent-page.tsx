"use client";

import { WorkspacePage, type WorkspacePageProps } from "@/components/teacher/teacher-page";

/**
 * The page every guardian screen sits in: one shared `PageHeader` (SPEC §4.3, R1) inside the page card.
 *
 * The family console's navigation is the registry (`ROLE_NAV.parent`: Home · Fees · Attendance ·
 * Results, Messages and More), and the child switcher lives in the shell header — so this page carries
 * no section strip and no token-bearing links. Below `md` the page joins the document scroll.
 */
export function ParentPage(props: WorkspacePageProps) {
  return <WorkspacePage documentFlow {...props} />;
}
