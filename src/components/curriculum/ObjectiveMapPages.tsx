"use client";
import { useState } from "react";
import { Download, Target } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { PageHeader } from "@/components/ui/page-header";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { ObjectiveMap } from "./ObjectiveMap";
import { getObjectiveMapCopy } from "./objective-map-copy";

/** §4.4b teacher · Objective map: no primary; **Export** (CSV of the objectives on screen) as the secondary. */
export function TeacherObjectiveMapPage() {
  const t = getObjectiveMapCopy(useLocale().language);
  const [exportRequest, setExportRequest] = useState(0);
  const [exportable, setExportable] = useState(false);
  return <TeacherPage
    icon={Target}
    title="Objective map"
    description={t.summary}
    secondaryActions={[{ id: "export-objectives", label: t.export, icon: Download, onClick: () => setExportRequest(n => n + 1), disabled: !exportable, disabledReason: t.exportWaiting }]}
  >
    <ObjectiveMap exportRequest={exportRequest} onExportableChange={setExportable} />
  </TeacherPage>;
}
/**
 * Curriculum leads on the framed `/curriculum` route. RoleFrame draws the shell, the one page card and its
 * padding, so the page is the PageHeader and the map — no card of its own (addendum 2026-10-22 §2).
 */
export function LeadObjectiveMapPage() {
  const t = getObjectiveMapCopy(useLocale().language);
  const [exportRequest, setExportRequest] = useState(0);
  const [exportable, setExportable] = useState(false);
  return <div className="min-w-0 space-y-6">
    <PageHeader
      icon={Target}
      title="Objective map"
      description={t.summary}
      secondaryActions={[{ id: "export-objectives", label: t.export, icon: Download, onClick: () => setExportRequest(n => n + 1), disabled: !exportable, disabledReason: t.exportWaiting }]}
    />
    <ObjectiveMap exportRequest={exportRequest} onExportableChange={setExportable} />
  </div>;
}
