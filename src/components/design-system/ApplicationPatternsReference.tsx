"use client";

import { useState } from "react";
import { BookOpen, Eye, EyeOff, Lock, Mail, Users } from "lucide-react";
import { PageCard } from "@/components/ui/page-card";
import { InputGroup } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { WorkspaceHeader, WorkspaceToolbar, SearchField, ToolbarSelect, StatTiles, DataTable } from "@/components/shared-admin/workspace";
import { Button } from "@/components/ui/button";
import { ManagementCard } from "@/components/role-dashboard/ManagementCard";

/** Regression composition of actual application components, with no API writes. */
export function ApplicationPatternsReference() {
  const [search, setSearch] = useState("");
  const [show, setShow] = useState(false);
  const [rtl, setRtl] = useState(false);
  const rows = [{ id: "EXAMPLE-1", name: "Example student", status: "Draft" }].filter(row => row.name.toLowerCase().includes(search.toLowerCase()));
  return <main dir={rtl ? "rtl" : "ltr"} className="min-h-dvh bg-background p-4 sm:p-8">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted"><p>Synthetic data · Actual application components</p><Button variant="outline" onClick={() => setRtl(!rtl)}>Switch direction</Button></div>
    <PageCard className="mx-auto max-w-5xl space-y-6">
      <WorkspaceHeader icon={BookOpen} eyebrow="Application patterns" title="Shared workspace components" summary="Headers, metrics, filters, tables, cards and compound fields." />
      <StatTiles tiles={[{ key: "students", label: "Students", value: 1, icon: Users }, { key: "drafts", label: "Drafts", value: 1 }]} />
      <WorkspaceToolbar><SearchField value={search} onChange={setSearch} label="Search students" placeholder="Search students" /><ToolbarSelect label="Record status" value="all" onChange={() => {}} options={[["all", "All records"], ["draft", "Draft"]]} /></WorkspaceToolbar>
      <DataTable rows={rows} rowKey={row => row.id} minWidth={280} columns={[{ key: "name", label: "Student", render: row => row.name }, { key: "status", label: "Status", render: row => row.status }]} />
      <div className="grid gap-6 sm:grid-cols-2">
        <div><Label htmlFor="example-password" className="sk-field-label">Password with an action</Label><InputGroup surfaceClassName="bg-[#eef2ff]"><Lock data-field-affix="start" aria-hidden="true" className="size-4" /><Input id="example-password" type={show ? "text" : "password"} defaultValue="Example only" /><button data-field-affix="end" type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></InputGroup></div>
        <div><Label htmlFor="example-date" className="sk-field-label">Date field</Label><Input id="example-date" type="date" defaultValue="2026-10-08" /></div>
      </div>
      <div><Label htmlFor="example-board" className="sk-field-label">Board with icon</Label><InputGroup surfaceClassName="bg-[#f3f4f9]"><BookOpen data-field-affix="start" className="size-4" /><Select id="example-board"><option>Example board</option></Select></InputGroup></div>
      <ManagementCard title="Class leadership" description="A real management card with synthetic data." icon={Users} onAdd={() => {}} emptyLabel="Assign a leader" />
      <section aria-labelledby="field-states-heading" className="space-y-4">
        <h2 id="field-states-heading" className="text-lg font-bold text-foreground">Field states</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div><Label htmlFor="field-states-text" className="sk-field-label">Standalone text</Label><Input id="field-states-text" defaultValue="Example record" /></div>
          <div><Label htmlFor="field-states-select" className="sk-field-label">Standalone select</Label><Select id="field-states-select" defaultValue="north"><option value="north">Example north campus</option><option value="south">Example south campus</option></Select></div>
          <div className="sm:col-span-2"><Label htmlFor="field-states-notes" className="sk-field-label">Standalone notes</Label><Textarea id="field-states-notes" defaultValue="Example note for review." /></div>
          <div><Label htmlFor="field-states-invalid" className="sk-field-label">Invalid text</Label><Input id="field-states-invalid" aria-invalid="true" aria-describedby="field-states-invalid-error" defaultValue="Example" /><p id="field-states-invalid-error" className="mt-2 text-sm font-semibold text-destructive">Enter at least 10 characters.</p></div>
          <div><Label htmlFor="field-states-disabled" className="sk-field-label">Disabled text</Label><Input id="field-states-disabled" disabled value="Read only example" readOnly /></div>
          <div><Label htmlFor="field-states-invalid-group" className="sk-field-label">Invalid group</Label><InputGroup surfaceClassName="bg-[#fdf2f8]"><Mail data-field-affix="start" aria-hidden="true" className="size-4" /><Input id="field-states-invalid-group" type="email" aria-invalid="true" aria-describedby="field-states-invalid-group-error" defaultValue="example@" /></InputGroup><p id="field-states-invalid-group-error" className="mt-2 text-sm font-semibold text-destructive">Enter a complete email address.</p></div>
          <div><Label htmlFor="field-states-grouped-date" className="sk-field-label">Grouped date</Label><InputGroup surfaceClassName="bg-[#eff6ff]"><Input id="field-states-grouped-date" type="date" aria-label="Grouped date" defaultValue="2026-10-08" /></InputGroup></div>
          <div><Label htmlFor="field-states-disabled-group" className="sk-field-label">Disabled group</Label><InputGroup><Lock data-field-affix="start" aria-hidden="true" className="size-4" /><Input id="field-states-disabled-group" disabled value="Locked example" readOnly /></InputGroup></div>
        </div>
        <div className="rounded-2xl bg-[#3b1d5a] p-4"><Button variant="ghost" className="text-white focus-on-dark">Dark surface action</Button></div>
      </section>
    </PageCard>
  </main>;
}
