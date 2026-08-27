"use client";

/**
 * Staff hierarchy in the campus workspace.
 *
 * The same panel the /admin, /principal and /super consoles use. No campus is
 * named here: this console is single-campus by definition, so the API resolves
 * it from the session — which is also the only campus these roles may read.
 */

import { Header } from "@/components/layout/header";
import { StaffHierarchyPanel } from "@/components/staff/hierarchy-panel";

export default function StaffHierarchyPage() {
  return (
    <>
      <Header
        title="Staff Hierarchy"
        description="Who reports to whom, which department they sit in, and the rank ladder behind it"
      />

      <div className="space-y-6 p-6">
        <StaffHierarchyPanel />
      </div>
    </>
  );
}
