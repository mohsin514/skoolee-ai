"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { UiText, useUiText } from "@/components/locale/LocaleProvider";
import { toast } from "@/components/ui/toast";
import { setUaeReportTemplate } from "@/app/actions/settings";

/** SKAI-1151: per-school switch for the UAE bilingual report-card template. */
export function UaeReportTemplateToggle({ initial, canEdit }: { initial: boolean; canEdit: boolean }) {
  const tr = useUiText();
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function change(next: boolean) {
    setSaving(true);
    try {
      await setUaeReportTemplate(next);
      setEnabled(next);
      toast.success(tr(next ? "UAE report-card template turned on" : "UAE report-card template turned off"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not save this setting."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 flex items-start justify-between gap-4 border-t border-border-subtle pt-5" data-uae-report-template>
      <div className="min-w-0">
        <label htmlFor="uae-report-template" className="text-sm font-semibold text-ink-strong"><UiText>{"UAE report-card template"}</UiText></label>
        <p className="mt-1 text-xs leading-snug text-ink-muted"><UiText>{"Prints Arabic Language and Islamic Education as mandatory subjects, with English and Arabic side by side. Applies to report cards generated after you change it."}</UiText></p>
      </div>
      <Switch id="uae-report-template" checked={enabled} disabled={!canEdit || saving} onChange={(e) => change(e.currentTarget.checked)} />
    </div>
  );
}
