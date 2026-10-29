"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { DATA_REGIONS, DATA_REGION_LABELS, DEFAULT_DATA_REGION, isDataRegion, type DataRegion } from "@/lib/school/data-region";

/**
 * SKAI-1143: the platform owner records where a school's data is hosted. Saving changes the record only;
 * no data moves until region routing exists, which the hint says so the choice is not mistaken for a migration.
 */
export function DataRegionPanel({ schoolId, value, onChange }: { schoolId: string; value: string | null | undefined; onChange: (schoolId: string, dataRegion: DataRegion) => void }) {
  const t = useUiText();
  const current: DataRegion = isDataRegion(value) ? value : DEFAULT_DATA_REGION;
  const [draft, setDraft] = useState<DataRegion>(current);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/owner/schools/${schoolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataRegion: draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      onChange(schoolId, draft);
      toast.success(t("Data region updated."));
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("The data region could not be changed. Try again.")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-5" data-data-region={current}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="sk-eyebrow flex items-center gap-2 text-primary"><Globe aria-hidden="true" className="size-4" />{t("Data region")}</p>
        <Button type="button" size="sm" variant="outline" disabled={saving || draft === current} loading={saving} onClick={() => void save()}>
          {t("Save region")}
        </Button>
      </div>
      <FormField
        name="dataRegion"
        idScope={`data-region-${schoolId}`}
        label={t("Hosting region")}
        hint={t("Records where this school's data should live. Saving does not move any data.")}
      >
        <Select value={draft} disabled={saving} onChange={(event) => { if (isDataRegion(event.target.value)) setDraft(event.target.value); }}>
          {DATA_REGIONS.map((region) => <option key={region} value={region}>{t(DATA_REGION_LABELS[region])}</option>)}
        </Select>
      </FormField>
    </div>
  );
}
