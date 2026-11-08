"use client";
import { useState } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { apiErrorMessage } from "@/lib/errors";
import { TeacherPicker, type PickerTeacher, type TeacherAvailability } from "./teacher-picker";

type Row = { subjectId: string; expectedTeacherId: string | null };
type Preview = { changes: number; unchanged: number; scheduledSubjects: number; capacity: number | null; warnings: { code: string; message: string }[] };

async function post(body: object) {
  const res = await fetch("/api/subjects/allocations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(apiErrorMessage(json.error, ""));
  return json.data as Preview;
}

/** SKAI-150: give one teacher a subject in every subject-taught section at once, after a preview of what moves. */
export function BulkAllocate({ subjectName, rows, teachers, availability, onDone }: {
  subjectName: string; rows: Row[]; teachers: PickerTeacher[]; availability: TeacherAvailability[]; onDone: () => void;
}) {
  const ui = useUiText();
  const [open, setOpen] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const failed = ui("Could not allocate the teacher. Nothing changed; try again.");
  const allocations = (id: string) => rows.map(row => ({ subjectId: row.subjectId, teacherId: id || null, expectedTeacherId: row.expectedTeacherId }));

  const choose = async (id: string) => {
    setTeacherId(id); setBusy(true);
    try { setPreview(await post({ allocations: allocations(id), preview: true })); }
    catch (error) { toast.error(friendlyErrorMessage(error, failed)); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      const done = await post({ allocations: allocations(teacherId) });
      toast.success(ui(done.changes === 1 ? "{0} section updated" : "{0} sections updated", [done.changes]));
      setPreview(null); setOpen(false); onDone();
    } catch (error) { toast.error(friendlyErrorMessage(error, failed)); }
    finally { setBusy(false); }
  };

  if (rows.length < 2) return null;
  return (
    <div className="mt-1.5" data-testid="bulk-allocate">
      <Button variant="ghost" size="sm" type="button" aria-expanded={open} onClick={() => setOpen(v => !v)} className="gap-1 px-2 text-2xs">
        <Users aria-hidden="true" className="h-3 w-3" />
        {ui("Allocate to all {0} sections", [rows.length])}
      </Button>
      {open ? (
        <div className="mt-1 w-full min-w-[240px] max-w-xs rounded-xl border border-edge/15 bg-card p-2 shadow-lg">
          <TeacherPicker label="" teachers={teachers} availability={availability} assignmentMode="subject" subjectName={subjectName} value={teacherId} onChange={id => void choose(id)} allowUnassigned showUnassignedHint={false} initialOpen />
        </div>
      ) : null}
      <ConfirmAction
        open={!!preview}
        busy={busy}
        disabled={!preview?.changes}
        tone={preview?.warnings.length || preview?.scheduledSubjects ? "warning" : "primary"}
        title={teacherId ? ui("Allocate {0} to every section?", [subjectName]) : ui("Remove the {0} teacher from every section?", [subjectName])}
        description={ui("{0} of {1} sections change; {2} already scheduled on the timetable will move with it.", [preview?.changes ?? 0, rows.length, preview?.scheduledSubjects ?? 0])}
        detail={preview?.warnings.length ? (
          <ul className="space-y-1">
            {[...new Set(preview.warnings.map(w => w.code))].map(code => (
              <li key={code} className="flex items-start gap-1 text-xs font-medium text-status-warning-text">
                <AlertTriangle aria-hidden="true" className="mt-px h-3 w-3 shrink-0" />
                {code === "OFF_SPECIALTY" ? ui("Not their specialty ({0})", [subjectName]) : ui("Over the weekly limit of {0} periods", [preview.capacity ?? 0])}
              </li>
            ))}
          </ul>
        ) : undefined}
        confirmLabel={ui("Allocate teacher")}
        onConfirm={confirm}
        onCancel={() => setPreview(null)}
      />
    </div>
  );
}
