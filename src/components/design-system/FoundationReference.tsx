"use client";

import { useState } from "react";
import { Bell, CalendarDays, Download, GraduationCap, Pencil, Plus, Search, Trash2, Users, Wallet } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { InfoTip, Tooltip } from "@/components/ui/tooltip";
import { StatCard } from "@/components/role-dashboard/StatCard";

const brandSteps = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="sk-eyebrow">{title}</h2>
      {children}
    </section>
  );
}

/** Development reference for the shared foundation. Synthetic data only. */
export function FoundationReference() {
  const [notifications, setNotifications] = useState(true);
  const [note, setNote] = useState("Bring the signed trip form on Monday.");
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  return (
    <main className="sk-app-canvas min-h-dvh px-4 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl space-y-12">
        <header className="sk-hero-wash relative overflow-hidden rounded-(--radius-workspace) border border-border-subtle p-6 shadow-md sm:p-10">
          <p className="sk-eyebrow mb-3">Skoolee design system · Foundation</p>
          <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink-strong sm:text-4xl">
            One calm, <span className="sk-text-gradient">confident</span> interface for every school.
          </h1>
          <p className="mt-3 max-w-xl text-md leading-relaxed text-ink-muted">
            Tokens, type, elevation and the shared primitives every screen is built from. Synthetic examples only.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button><Plus aria-hidden="true" />Primary action</Button>
            <Button variant="outline"><Download aria-hidden="true" />Secondary</Button>
            <Button variant="ghost">Tertiary</Button>
          </div>
        </header>

        <Section id="type" title="Type scale">
          <Card className="space-y-3 p-6">
            <p className="text-3xl font-extrabold tracking-tight text-ink-strong">Display 30 / 800</p>
            <p className="text-2xl font-bold tracking-tight text-ink-strong">Page title 24 / 700</p>
            <p className="text-lg font-bold text-ink-strong">Section title 18 / 700</p>
            <p className="text-sm font-semibold text-ink">Label 14 / 600</p>
            <p className="text-sm text-ink-muted">Body 14 / 400 — running copy uses the muted ink for long passages.</p>
            <p className="text-xs text-ink-subtle">Caption 12 / 400</p>
            <p className="sk-eyebrow">Eyebrow 11 / 600 uppercase</p>
            <p className="text-3xs font-semibold text-ink-subtle">Counter 10 / 600 (numbers only)</p>
          </Card>
        </Section>

        <Section id="colour" title="Brand scale">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-11">
            {brandSteps.map((step) => (
              <div key={step} className="space-y-1.5">
                <div className="h-14 rounded-2xl ring-1 ring-black/5" style={{ background: `var(--brand-${step})` }} />
                <p data-numeric className="text-2xs font-semibold text-ink-muted">{step}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="actions" title="Actions & tooltips">
          <Card className="flex flex-wrap items-center gap-3 p-6">
            <Button loading={saving} onClick={() => { setSaving(true); window.setTimeout(() => setSaving(false), 1800); }}>Save changes</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="dark">Dark</Button>
            <Button variant="destructive"><Trash2 aria-hidden="true" />Delete</Button>
            <Button disabled>Disabled</Button>
            <span className="mx-1 h-8 w-px bg-border-subtle" aria-hidden="true" />
            <IconButton label="Edit student"><Pencil aria-hidden="true" /></IconButton>
            <IconButton label="Search records" variant="outline"><Search aria-hidden="true" /></IconButton>
            <IconButton label="Notifications" size="sm" variant="outline"><Bell aria-hidden="true" /></IconButton>
            <Tooltip content="Downloads a CSV of this term's attendance for the selected class.">
              <Button variant="outline"><Download aria-hidden="true" />Export</Button>
            </Tooltip>
          </Card>
        </Section>

        <Section id="badges" title="Status badges">
          <Card className="flex flex-wrap gap-2 p-6">
            <Badge>Default</Badge>
            <Badge variant="secondary">Draft</Badge>
            <Badge variant="success" dot>Paid</Badge>
            <Badge variant="warning" dot>Due soon</Badge>
            <Badge variant="danger" dot>Overdue</Badge>
            <Badge variant="info" dot>In review</Badge>
            <Badge variant="neutral" dot>Archived</Badge>
            <Badge variant="outline" size="sm">Small</Badge>
          </Card>
        </Section>

        <Section id="alerts" title="Alerts">
          <div className="grid gap-3 lg:grid-cols-2">
            <Alert tone="info" title="Term reports open on 12 November" live="off">Teachers can submit comments until the 20th.</Alert>
            <Alert tone="success" title="Fees reconciled" live="off">All 412 payments matched their invoices.</Alert>
            <Alert tone="warning" title="3 classes have no timetable" live="off" actions={<Button size="sm" variant="outline">Review classes</Button>}>Attendance cannot be taken for them yet.</Alert>
            <Alert tone="danger" title="Payment provider unavailable" live="off">Online payments are paused; cash and bank transfer still work.</Alert>
            <Alert tone="brand" title="Skoolee suggests" live="off">Moving Grade 7 science to period 2 removes two teacher clashes.</Alert>
            {!dismissed ? <Alert tone="neutral" compact live="off" onDismiss={() => setDismissed(true)}>Compact neutral note with a dismiss control.</Alert> : <Button variant="link" onClick={() => setDismissed(false)}>Show the dismissed note</Button>}
          </div>
        </Section>

        <Section id="fields" title="Fields with guidance">
          <Card className="grid gap-6 p-6 md:grid-cols-2">
            <FormField name="ds-email" label="Guardian email" required description="Receipts and report cards are sent here." tooltip="We never share this address. Guardians can change it from the family app.">
              <Input type="email" placeholder="name@example.com" />
            </FormField>
            <FormField name="ds-roll" label="Roll number" error="Roll number 14 is already used in Grade 7 B." hint="Numbers restart in each section.">
              <Input defaultValue="14" />
            </FormField>
            <FormField name="ds-note" label="Note for the class teacher" optional showCount hint="Visible to the class teacher only.">
              <Textarea maxLength={120} value={note} onChange={(event) => setNote(event.target.value)} />
            </FormField>
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
                <span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-ink">Absence alerts<InfoTip content="Guardians get a message when their child is marked absent before 10:00." /></span>
                  <span className="mt-0.5 block text-xs text-ink-muted">Sent by SMS and the family app.</span>
                </span>
                <Switch checked={notifications} onChange={(event) => setNotifications(event.target.checked)} />
              </label>
              <Progress label="Report cards completed" value={68} showValue />
              <Progress label="Fee collection" value={92} tone="success" size="sm" showValue valueText="92 of 100 families" />
            </div>
          </Card>
        </Section>

        <Section id="cards" title="Surfaces">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Users} label="Enrolled learners" value={1284} sub="Across 3 campuses" trend={{ value: "4.2%", direction: "up", label: "vs last term" }} />
            <StatCard icon={Wallet} label="Outstanding fees" value="PKR 2.4M" tone="rose" trend={{ value: "8%", direction: "down", label: "vs last month", positive: true }} />
            <StatCard icon={GraduationCap} label="Average attendance" value="94%" tone="green" />
            <StatCard icon={CalendarDays} label="Events this week" value={6} tone="dark" onClick={() => toast.info("Opens the calendar")} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader><CardTitle>Default card</CardTitle><CardDescription>White panel, hairline border, soft plum shadow.</CardDescription></CardHeader></Card>
            <Card variant="featured"><CardHeader><CardTitle>Featured card</CardTitle><CardDescription>Gradient hairline for the one card that deserves the eye.</CardDescription></CardHeader></Card>
            <Card variant="muted"><CardHeader><CardTitle>Muted card</CardTitle><CardDescription>Recessed grouping inside a page.</CardDescription></CardHeader></Card>
          </div>
        </Section>

        <Section id="states" title="Empty & error states">
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardContent className="p-0"><EmptyState icon={Users} title="No students in this class yet" description="Add students one by one or import a roster from a spreadsheet." action={<Button><Plus aria-hidden="true" />Add student</Button>} secondaryAction={<Button variant="ghost">Import roster</Button>} /></CardContent></Card>
            <Card><CardContent className="p-0"><ErrorState onRetry={() => toast.success("Reloaded")} error={Object.assign(new Error("x"), { digest: "4127839201" })} /></CardContent></Card>
          </div>
        </Section>

        <Section id="toasts" title="Toasts">
          <Card className="flex flex-wrap gap-2 p-6">
            <Button variant="outline" onClick={() => toast.success("Attendance saved", { description: "Grade 7 B · 31 present, 2 absent" })}>Success toast</Button>
            <Button variant="outline" onClick={() => toast.error("Could not publish the timetable", { description: "Two rooms are double-booked on Tuesday." })}>Error toast</Button>
            <Button variant="outline" onClick={() => toast.error(new Error("Unexpected token < in JSON at position 0"))}>Technical error (cleaned)</Button>
            <Button variant="outline" onClick={() => toast.warning("Report cards are still drafts")}>Warning toast</Button>
            <Button variant="outline" onClick={() => toast.info("A new term starts on Monday")}>Info toast</Button>
          </Card>
        </Section>
      </div>
    </main>
  );
}
