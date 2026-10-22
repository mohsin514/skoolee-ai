"use client";
import { useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { PageHeader } from "@/components/ui/page-header";
import { StudentPage } from "@/components/student/student-page";
import { ParentPage } from "@/components/parent/parent-page";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { ResourceLibrary } from "./ResourceLibrary";
import { getResourceCopy } from "./resource-copy";
import { TeacherStudyDesk } from "@/components/study/study-assistant";

// SKO-400 page shells: each workspace puts the shared library under its own PageHeader.
const useCopy = () => getResourceCopy(useLocale().language);

export function StudentResourcesPage() {
  const t = useCopy();
  return <StudentPage icon={FolderOpen} title={t.title} description={t.learnerSummary}><ResourceLibrary audience="learner" /></StudentPage>;
}
export function ParentResourcesPage() {
  const t = useCopy();
  return <ParentPage icon={FolderOpen} title={t.title} description={t.guardianSummary}><ResourceLibrary audience="guardian" /></ParentPage>;
}
export function TeacherResourcesPage() {
  const t = useCopy();
  const [adding, setAdding] = useState(false);
  return (
    <TeacherPage
      icon={FolderOpen}
      title={t.staffTitle}
      description={t.staffSummary}
      primaryAction={{ id: "add-resource", label: t.add, icon: Plus, onClick: () => setAdding(true), disabled: adding }}
    >
      <ResourceLibrary audience="staff" adding={adding} onAddingChange={setAdding} />
      <div className="mt-6"><TeacherStudyDesk /></div>
    </TeacherPage>
  );
}
/** Academic leads on the framed `/resources` route (the shell comes from RoleFrame). */
export function ManagerResourcesPage() {
  const t = useCopy();
  const [adding, setAdding] = useState(false);
  // RoleFrame draws the one page card and its padding: the page is the PageHeader and the library, no card of its own.
  return <div className="min-w-0 space-y-6">
    <PageHeader
      icon={FolderOpen}
      title={t.title}
      description={t.staffSummary}
      primaryAction={{ id: "add-resource", label: t.add, icon: Plus, onClick: () => setAdding(true), disabled: adding }}
    />
    <ResourceLibrary audience="staff" adding={adding} onAddingChange={setAdding} />
  </div>;
}
