"use client";

import { useState } from "react";
import { BookOpen, Eye, EyeOff, Lock, Users } from "lucide-react";
import { PageCard } from "@/components/ui/page-card";
import { InputGroup } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
        <div><Label htmlFor="example-password" className="sk-field-label">Password with an action</Label><InputGroup><Lock data-field-affix="start" aria-hidden="true" className="size-4" /><Input id="example-password" type={show ? "text" : "password"} defaultValue="Example only" /><button data-field-affix="end" type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></InputGroup></div>
        <div><Label htmlFor="example-date" className="sk-field-label">Date field</Label><Input id="example-date" type="date" defaultValue="2026-10-08" /></div>
      </div>
      <div><Label htmlFor="example-board" className="sk-field-label">Board with icon</Label><InputGroup><BookOpen data-field-affix="start" className="size-4" /><Select id="example-board"><option>Example board</option></Select></InputGroup></div>
      <ManagementCard title="Class leadership" description="A real management card with synthetic data." icon={Users} onAdd={() => {}} emptyLabel="Assign a leader" />
    </PageCard>
  </main>;
}
