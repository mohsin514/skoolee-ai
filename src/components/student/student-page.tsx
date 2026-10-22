"use client";

import { WorkspacePage, type WorkspacePageProps } from "@/components/teacher/teacher-page";

/**
 * The page every learner screen sits in: one shared `PageHeader` (SPEC §4.3, R1) inside the page card.
 * The registry (`ROLE_NAV.student`) is the only navigation, so the old in-page section strip is gone.
 * Below `md` the page joins the document scroll (the family "document flow" the shell opts into); from
 * `md` up the content area scrolls inside the card.
 */
export function StudentPage(props: WorkspacePageProps) {
  return <WorkspacePage documentFlow {...props} />;
}
