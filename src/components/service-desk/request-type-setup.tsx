"use client";
import { useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { DeskSection } from "@/components/ui/desk";
import { useUiText } from "@/components/locale/LocaleProvider";

// SKAI-2219: campus leaders add request types here; before this the desk had no UI for
// POST /api/service-desk {action:"category"}, so "Who should handle this request?" stayed empty.
// shortcut: no owner, escalation contact or safety flag here (a safety type needs an escalation
// contact picker); add them when a request-type management screen is built.
const KINDS = [["REPAIR", "Repair"], ["ACCESS", "Access"], ["SUPPLIES", "Supplies"], ["INFORMATION", "Information"]] as const;
const blank = { name: "", team: "", kind: "REPAIR", resolveHours: "", keywords: "" };

export function RequestTypeSetup({ campusId, empty, onCreated }: { campusId: string; empty: boolean; onCreated: (id: string) => void }) {
  const ui = useUiText();
  const [open, setOpen] = useState(empty), [busy, setBusy] = useState(false), [draft, setDraft] = useState(blank);
  const save = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/service-desk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "category", campusId, ...draft, resolveHours: draft.resolveHours || undefined }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Your update was not saved. Try again.");
      toast.success(ui("Request type {0} added.", [json.data.name]));
      setDraft(blank); setOpen(false); onCreated(json.data.id);
    } catch (e) { toast.error(ui(e instanceof Error ? e.message : "Your update was not saved. Try again.")); } finally { setBusy(false); }
  };
  if (!open) return <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setOpen(true)} data-sd-add-type>{ui("Add a request type")}</Button></div>;
  return <DeskSection title={ui("Add a request type")} icon={Settings2} data-sd-type-setup>
    {empty ? <p className="text-xs text-ink-muted">{ui("No request types yet. Add one so staff can choose who handles their request.")}</p> : null}
    <div className="grid gap-2 sm:grid-cols-2">
      <FormField name="sd-type-name" label={ui("Request type name")}><Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={80} /></FormField>
      <FormField name="sd-type-team" label={ui("Team that handles it")}><Input value={draft.team} onChange={e => setDraft({ ...draft, team: e.target.value })} maxLength={60} /></FormField>
      <FormField name="sd-type-kind" label={ui("Kind")}><Select className="w-full min-w-0" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}>{KINDS.map(([id, label]) => <option key={id} value={id}>{ui(label)}</option>)}</Select></FormField>
      <FormField name="sd-type-hours" label={ui("Resolve within (hours, optional)")}><Input type="number" min={1} value={draft.resolveHours} onChange={e => setDraft({ ...draft, resolveHours: e.target.value })} /></FormField>
    </div>
    <FormField name="sd-type-keywords" label={ui("Keywords for suggestions (comma separated, optional)")}><Input value={draft.keywords} onChange={e => setDraft({ ...draft, keywords: e.target.value })} /></FormField>
    <div className="flex justify-end gap-2">
      {!empty ? <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{ui("Cancel")}</Button> : null}
      <Button size="sm" disabled={busy || !draft.name.trim() || !draft.team.trim()} loading={busy} onClick={() => void save()} data-sd-save-type>{ui("Save request type")}</Button>
    </div>
  </DeskSection>;
}
