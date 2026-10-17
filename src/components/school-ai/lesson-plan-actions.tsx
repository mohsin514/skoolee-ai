"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-414: after a plan is saved — check it, form private temporary groups,
// publish an activity as an assignment draft (whole class or one group),
// record whether it was taught, and copy its content to another class.

type View = {
  curriculum: { id: string; version: number; status: string; classId: string };
  plan: { id: string; title: string; origin: "AI" | "TEACHER" | null; owner: string | null; confirmed: boolean; durationMinutes: number; plannedMinutes: number; activities: { index: number; title: string; minutes: number }[] };
  issues: string[]; lessonMinutes: number | null; canManage: boolean; stateVersion: number;
  groups: { id: string; label: string; studentIds: string[] }[]; roster: { id: string; name: string; rollNo: string }[];
  delivery: { status: "TAUGHT" | "NOT_TAUGHT"; on: string; reflection: string } | null;
  published: { activityIndex: number; groupId: string | null; assignmentId: string }[];
  events: { version: number; kind: string; at: string }[];
};
type Target = { id: string; title: string; version: number };
const GROUP_SLOTS = ["", "Group A", "Group B", "Group C", "Group D"];
const DELIVERY_LABEL = { TAUGHT: "Taught", NOT_TAUGHT: "Not taught" } as const;
const EVENT_LABEL: Record<string, string> = { GROUPS: "Groups changed", DELIVERY: "Lesson recorded", PUBLISHED_ACTIVITY: "Assignment draft created" };
const today = () => new Date().toISOString().slice(0, 10);

export function LessonPlanActions({ curriculumId, planIds, titles, targets }: { curriculumId: string; planIds: string[]; titles: Record<string, string>; targets: Target[] }) {
  const ui = useUiText();
  const [open, setOpen] = useState<string | null>(null);
  return <section className="sk-panel space-y-3 p-5" aria-labelledby="teach-title" data-lesson-plan-actions>
    <h3 id="teach-title" className="font-bold">{ui("Teach and follow up")}</h3>
    <p className="text-sm text-ink-subtle">{ui("Use a saved plan: check it, form temporary groups, set activities as assignments and record what happened.")}</p>
    {!planIds.length ? <p className="text-sm" data-empty>{ui("Save a lesson plan first.")}</p> : <ul className="space-y-2">{planIds.map(id => <li key={id} className="rounded-xl border border-border p-3" data-plan={id}>
      <Button variant="secondary" size="sm" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>{titles[id] || ui("Untitled plan")}</Button>
      {open === id ? <PlanPanel curriculumId={curriculumId} planId={id} targets={targets.filter(t => t.id !== curriculumId)} /> : null}
    </li>)}</ul>}
  </section>;
}

function PlanPanel({ curriculumId, planId, targets }: { curriculumId: string; planId: string; targets: Target[] }) {
  const ui = useUiText();
  const { date, dateTime } = useLocaleFormat();
  const [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [membership, setMembership] = useState<Record<string, string>>({});
  const [activity, setActivity] = useState("0"), [audience, setAudience] = useState(""), [due, setDue] = useState("");
  const [status, setStatus] = useState<"TAUGHT" | "NOT_TAUGHT">("TAUGHT"), [on, setOn] = useState(today()), [reflection, setReflection] = useState("");
  const [target, setTarget] = useState(""), [issues, setIssues] = useState<string[]>([]);
  const request = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++request.current;
    const response = await fetch(`/api/school-ai/lesson-plans?curriculumId=${encodeURIComponent(curriculumId)}&planId=${encodeURIComponent(planId)}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => ({}));
    if (ticket !== request.current) return;
    if (!response?.ok) { const message: string = typeof json?.error === "string" ? json.error : "This lesson plan could not be loaded."; setError(ui(message)); return; }
    const data = json.result as View;
    setView(data); setError("");
    const next: Record<string, string> = {};
    for (const group of data.groups) for (const id of group.studentIds) next[id] = group.label;
    setMembership(next);
    if (data.delivery) { setStatus(data.delivery.status); setOn(data.delivery.on); setReflection(data.delivery.reflection); }
  }, [curriculumId, planId, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const act = async (action: "groups" | "delivery" | "publish" | "copy", data: object, success: string) => {
    setBusy(true); setNotice(""); setIssues([]);
    try {
      const response = await fetch("/api/school-ai/lesson-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { if (Array.isArray(json.issues)) setIssues(json.issues); const message: string = typeof json.error === "string" ? json.error : "The change was not saved."; setNotice(ui(message)); return null; }
      setNotice(success); await load(); return json.result;
    } catch { setNotice(ui("The connection failed. Nothing was saved twice; try again.")); return null; }
    finally { setBusy(false); }
  };

  if (error) return <p role="alert" className="mt-2 text-sm text-status-error-text">{error}</p>;
  if (!view) return <p role="status" className="mt-2 text-sm">{ui("Loading the plan…")}</p>;
  const over = view.plan.plannedMinutes !== view.plan.durationMinutes || (view.lessonMinutes !== null && view.plan.durationMinutes > view.lessonMinutes);
  const shown = issues.length ? issues : view.issues;

  return <div className="mt-3 space-y-4" data-plan-panel>
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {view.plan.origin === "AI" && !view.plan.confirmed ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900" data-ai-draft>{ui("AI draft: review the examples and timing before use.")}</span> : null}
      <span>{ui("Owner")}: <bdi>{view.plan.owner ?? "—"}</bdi></span>
      <span className={over ? "font-bold text-amber-900" : "font-bold text-emerald-800"} data-minutes>{ui("{0} / {1} minutes planned", [view.plan.plannedMinutes, view.plan.durationMinutes])}{view.lessonMinutes ? ` · ${ui("period {0} minutes", [view.lessonMinutes])}` : ""}</span>
      <span>{view.plan.confirmed ? ui("Confirmed by the teacher") : ui("Not confirmed yet")}</span>
    </div>
    {shown.length ? <ul role="alert" className="list-disc space-y-0.5 rounded-xl bg-amber-50 p-3 ps-8 text-sm text-amber-900" data-plan-issues>{shown.map(issue => <li key={issue}>{ui(issue)}</li>)}</ul>
      : <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900" data-plan-ready>{ui("Ready: timing, resources and groups check out.")}</p>}
    {notice ? <p role="status" className="text-sm font-bold" data-plan-notice>{notice}</p> : null}

    {view.canManage ? <>
      <fieldset className="space-y-2 rounded-xl border border-border p-3" data-groups disabled={busy}>
        <legend className="px-1 text-sm font-bold">{ui("Temporary groups")}</legend>
        <p className="text-xs text-ink-muted">{ui("Group names are neutral and visible only to staff. Learners never see them.")}</p>
        {!view.roster.length ? <p className="text-sm">{ui("No learners in this class.")}</p> : <div className="grid gap-2 sm:grid-cols-2">{view.roster.map(learner => <FormField key={learner.id} name={`group-${planId}-${learner.id}`} label={learner.name}>
          <Select value={membership[learner.id] ?? ""} onChange={event => setMembership(prev => ({ ...prev, [learner.id]: event.target.value }))}>{GROUP_SLOTS.map(slot => <option key={slot} value={slot}>{slot ? ui(slot) : ui("No group")}</option>)}</Select>
        </FormField>)}</div>}
        <Button size="sm" onClick={() => { const groups = GROUP_SLOTS.slice(1).map(slot => Object.entries(membership).filter(([, value]) => value === slot).map(([id]) => id)).filter(ids => ids.length); void act("groups", { curriculumId, planId, expectedVersion: view.stateVersion, groups }, ui("Groups saved.")); }}>{ui("Save groups")}</Button>
      </fieldset>

      <fieldset className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-4" data-publish disabled={busy}>
        <legend className="px-1 text-sm font-bold">{ui("Set an activity as an assignment")}</legend>
        <FormField name={`publish-activity-${planId}`} label={ui("Activity")}><Select value={activity} onChange={event => setActivity(event.target.value)}>{view.plan.activities.map(a => <option key={a.index} value={a.index}>{a.title || ui("Untitled activity")} ({a.minutes})</option>)}</Select></FormField>
        <FormField name={`publish-audience-${planId}`} label={ui("Audience")}><Select value={audience} onChange={event => setAudience(event.target.value)}><option value="">{ui("Whole class")}</option>{view.groups.map(g => <option key={g.id} value={g.id}>{ui(g.label)} ({g.studentIds.length})</option>)}</Select></FormField>
        <FormField name={`publish-due-${planId}`} label={ui("Due")}><Input type="datetime-local" value={due} onChange={event => setDue(event.target.value)} /></FormField>
        <Button size="sm" disabled={!due} onClick={() => void act("publish", { curriculumId, planId, activityIndex: Number(activity), groupId: audience || null, dueLocal: due }, ui("Assignment draft created. Review its audience and release it from Assignments."))}>{ui("Create assignment draft")}</Button>
        {view.published.length ? <ul className="text-xs sm:col-span-4" data-published>{view.published.map(p => <li key={p.assignmentId}>{view.plan.activities[p.activityIndex]?.title ?? ""} · {p.groupId ? ui(view.groups.find(g => g.id === p.groupId)?.label ?? "Group") : ui("Whole class")} · <Link className="underline" href={`/teacher/assignments?assignment=${encodeURIComponent(p.assignmentId)}`}>{ui("Open in assignments")}</Link></li>)}</ul> : null}
      </fieldset>

      <fieldset className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-3" data-delivery disabled={busy}>
        <legend className="px-1 text-sm font-bold">{ui("After the lesson")}</legend>
        <FormField name={`delivery-status-${planId}`} label={ui("Was it taught?")}><Select value={status} onChange={event => setStatus(event.target.value as "TAUGHT" | "NOT_TAUGHT")}>{(["TAUGHT", "NOT_TAUGHT"] as const).map(key => <option key={key} value={key}>{ui(DELIVERY_LABEL[key])}</option>)}</Select></FormField>
        <FormField name={`delivery-on-${planId}`} label={ui("Date")}><Input type="date" max={today()} value={on} onChange={event => setOn(event.target.value)} /></FormField>
        <FormField name={`delivery-reflection-${planId}`} label={ui("What worked, what to change")}><Textarea maxLength={1000} value={reflection} onChange={event => setReflection(event.target.value)} /></FormField>
        <Button size="sm" onClick={() => void act("delivery", { curriculumId, planId, expectedVersion: view.stateVersion, status, on, reflection }, ui("Lesson record saved."))}>{ui("Save lesson record")}</Button>
        {view.delivery ? <p className="text-xs sm:col-span-3" data-delivery-saved>{ui(DELIVERY_LABEL[view.delivery.status])} · {date(view.delivery.on)}</p> : null}
      </fieldset>

      <fieldset className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_auto]" data-copy disabled={busy || !targets.length}>
        <legend className="px-1 text-sm font-bold">{ui("Copy to another class")}</legend>
        <FormField name={`copy-target-${planId}`} label={ui("Curriculum of the other class")}><Select value={target} onChange={event => setTarget(event.target.value)}><option value="">{ui("Choose a curriculum")}</option>{targets.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></FormField>
        <Button size="sm" disabled={!target} onClick={() => { const chosen = targets.find(t => t.id === target); if (chosen) void act("copy", { curriculumId, planId, targetCurriculumId: chosen.id, targetVersion: chosen.version }, ui("Copied. Content only: choose learners and dates for the new class.")); }}>{ui("Copy content")}</Button>
      </fieldset>
    </> : <p className="text-xs text-ink-muted">{ui("Only the teacher who owns this plan can change its groups and lesson record.")}</p>}

    {view.events.length ? <details className="text-xs" data-plan-history><summary className="cursor-pointer font-bold">{ui("History")}</summary><ol className="mt-1 space-y-0.5">{view.events.map(e => <li key={`${e.version}-${e.kind}`}>{ui("Version {0}", [e.version])} · {ui(EVENT_LABEL[e.kind] ?? e.kind)} · {dateTime(e.at)}</li>)}</ol></details> : null}
  </div>;
}
