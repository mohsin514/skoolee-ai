"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { ATTENDANCE_REGULATORS, DEFAULT_ATTENDANCE_REGULATOR, REGULATOR_SETS, isAttendanceRegulator, type AttendanceRegulator } from "@/lib/attendance/regulator";

/**
 * SKAI-1153: the platform owner picks which regulator's attendance codes and calendar a school reports in.
 * Marks are never rewritten: the codes are a mapping over the statuses the register already records.
 */
export function AttendanceRegulatorPanel({ schoolId, value, onChange }: { schoolId: string; value: string | null | undefined; onChange: (schoolId: string, attendanceRegulator: AttendanceRegulator) => void }) {
  const t = useUiText();
  const current: AttendanceRegulator = isAttendanceRegulator(value) ? value : DEFAULT_ATTENDANCE_REGULATOR;
  const [draft, setDraft] = useState<AttendanceRegulator>(current);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/owner/schools/${schoolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceRegulator: draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      onChange(schoolId, draft);
      toast.success(t("Attendance regulator updated."));
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("The attendance regulator could not be changed. Try again.")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-5" data-attendance-regulator={current}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="sk-eyebrow flex items-center gap-2 text-primary"><ClipboardCheck aria-hidden="true" className="size-4" />{t("Attendance regulator")}</p>
        <Button type="button" size="sm" variant="outline" disabled={saving || draft === current} loading={saving} onClick={() => void save()}>
          {t("Save regulator")}
        </Button>
      </div>
      <FormField
        name="attendanceRegulator"
        idScope={`attendance-regulator-${schoolId}`}
        label={t("Attendance codes and calendar")}
        hint={t("The register shows this regulator's codes and flags its weekend. Existing marks are not changed.")}
      >
        <Select value={draft} disabled={saving} onChange={(event) => { if (isAttendanceRegulator(event.target.value)) setDraft(event.target.value); }}>
          {ATTENDANCE_REGULATORS.map((regulator) => <option key={regulator} value={regulator}>{t(REGULATOR_SETS[regulator].name)}</option>)}
        </Select>
      </FormField>
    </div>
  );
}
