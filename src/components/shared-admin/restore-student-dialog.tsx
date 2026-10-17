"use client";
import { useState } from "react";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useUiText } from "@/components/locale/LocaleProvider";

type Archived = { id: string; fullName: string; rollNo: string; admissionNo?: string | null };

/**
 * SKO-389: restoring an archived pupil revalidates campus, class and identifiers on the server. When
 * the roll or admission number has been reused, the conflict is explained and a new current value is
 * asked for; past documents keep the identifiers they were issued with.
 */
export function RestoreStudentDialog({ student, onClose, onRestored }: { student: Archived | null; onClose: () => void; onRestored: (message: string) => void }) {
  const ui = useUiText();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState<{ rollNo: boolean; admissionNo: boolean } | null>(null);
  const [rollNo, setRollNo] = useState(""), [admissionNo, setAdmissionNo] = useState("");
  const close = () => { setError(""); setConflict(null); setRollNo(""); setAdmissionNo(""); onClose(); };
  const needsValue = Boolean(conflict && (conflict.rollNo && !rollNo.trim() || conflict.admissionNo && !admissionNo.trim()));
  const restore = async () => {
    if (!student) return;
    if (needsValue) { setError(ui("Enter the new current identifier to restore this student.")); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/students", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", id: student.id, ...(rollNo.trim() ? { rollNo: rollNo.trim() } : {}), ...(admissionNo.trim() ? { admissionNo: admissionNo.trim() } : {}) }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.conflict) { setConflict(result.conflict); setError(ui("Restore needs a new current identifier. Past records will not change.")); return; }
      if (!response.ok) throw new Error(result.error || ui("Student could not be restored"));
      onRestored(result.alreadyActive ? ui("{0} is already on the active roll.", [student.fullName]) : result.rollNo && result.rollNo !== student.rollNo ? ui("{0} restored with roll number {1}. Past records keep {2}.", [student.fullName, result.rollNo, student.rollNo]) : ui("{0} restored to the active roll.", [student.fullName]));
      close();
    } catch (failure) { setError(failure instanceof Error ? failure.message : ui("Student could not be restored")); } finally { setBusy(false); }
  };
  return <ConfirmAction
    open={Boolean(student)}
    title={ui("Restore {0}?", [student?.fullName ?? ""])}
    description={ui("{0} goes back onto the active roll and appears again in class lists, attendance and marks entry. The campus, class and identifiers are checked again before anything changes.", [student?.fullName ?? ""])}
    confirmLabel={ui("Restore student")}
    tone="success"
    busy={busy}
    detail={<div className="space-y-3" data-restore-student>
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      {conflict?.rollNo && <FormField name="restore-roll" label={ui("New current roll number (currently {0}, now used by another student)", [student?.rollNo ?? ""])}><Input value={rollNo} maxLength={32} dir="ltr" autoFocus onChange={event => setRollNo(event.target.value)} /></FormField>}
      {conflict?.admissionNo && <FormField name="restore-admission" label={ui("New current admission number (currently {0}, now used by another student)", [student?.admissionNo ?? ""])}><Input value={admissionNo} maxLength={64} dir="ltr" onChange={event => setAdmissionNo(event.target.value)} /></FormField>}
    </div>}
    onConfirm={() => void restore()}
    onCancel={close}
  />;
}
