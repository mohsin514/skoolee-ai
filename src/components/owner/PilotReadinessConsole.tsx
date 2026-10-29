"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { REQUIRED_NOTICE_LOCALES, TRUST_MARKETS, TRUST_REQUIREMENTS, type TrustMarket } from "@/lib/school-ai/market-trust-readiness";
import { MARKET_CURRENCY, validateProposal, type PilotMarket } from "@/lib/school-ai/pilot-offer";
import { READINESS_ITEMS, type ReadinessItem } from "@/lib/school-ai/pilot-readiness";

// SKAI-1016/1017/1018 founder console: per-market trust board, bounded proposal builder and the
// school-specific readiness checklist with a signed go/no-go decision. Nothing here activates a pilot;
// activation happens in Pilot evidence and is refused while any blocker shown here remains.

type Blocker = { item: string; reason: string };
type MarketState = { market: TrustMarket; ready: true } | { market: TrustMarket; ready: false; missing: string[]; reasons: string[] };
type Review = { id: string; market: string; requirement: string; reference: string; reviewer: string; reviewedAt: string; reviewDueAt: string | null; locales: string[] };
type Records = {
  proposals: { id: string; version: number; market: string; currency: string; amount: number | null; problems: string[]; createdAt: string }[];
  events: { id: string; stage: string; signedAgreementRef: string | null; settlementRef: string | null; createdAt: string }[];
  readiness: { id: string; version: number; outcome: string | null; ready: boolean; blockers: Blocker[]; signer: string | null; createdAt: string }[];
};
type Data = { board: { markets: MarketState[]; reviews: Review[] }; schools: { id: string; name: string }[]; records: Records | null; gate: { allowed: true; market: string } | { allowed: false; blockers: Blocker[] } | null };

const MARKET_LABEL: Record<string, string> = { PAKISTAN: "Pakistan", KSA: "Saudi Arabia", UAE_DUBAI: "Dubai" };
const today = () => new Date().toISOString().slice(0, 10);

export function PilotReadinessConsole() {
  const ui = useUiText();
  const [schoolId, setSchoolId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/owner/pilot-readiness${schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : ""}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) { setError(json?.error ?? "Could not load pilot readiness."); return; }
    setData(json.data);
  }, [schoolId]);
  useEffect(() => { void load(); }, [load]);

  const post = useCallback(async (action: string, body: Record<string, unknown>, success: string) => {
    const res = await fetch("/api/owner/pilot-readiness", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, schoolId, ...body }) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) { toast.error(ui(json?.error ?? "Could not save.")); return null; }
    toast.success(ui(success)); await load(); return json.data;
  }, [schoolId, load, ui]);

  if (error) return <ErrorState title={ui("Could not load pilot readiness.")} description={ui(error)} onRetry={() => void load()} />;
  if (!data) return <SkeletonList rows={4} />;
  return (
    <div className="space-y-6">
      <PageHeader title={ui("Pilot readiness")} description={ui("Market trust, bounded proposals and the go/no-go decision for each pilot school. A pilot stays unavailable until every item passes.")} />
      <TrustBoard board={data.board} post={post} />
      <section className="sk-panel p-4 sm:p-6" aria-labelledby="pilot-school-heading">
        <h2 id="pilot-school-heading" className="text-base font-bold text-ink">{ui("School")}</h2>
        <FormField name="pilot-readiness-school" label={ui("Pilot school")}>
          <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">{ui("Choose a school")}</option>
            {data.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>
        {data.gate ? (
          data.gate.allowed
            ? <Alert className="mt-4" tone="success" live="off" title={ui("Readiness and market trust pass for this school.")} />
            : <Alert className="mt-4" tone="warning" live="off" title={ui("This pilot cannot become active yet")}><BlockerList blockers={data.gate.blockers} /></Alert>
        ) : null}
      </section>
      {schoolId && data.records ? (
        <>
          <ProposalBuilder records={data.records} post={post} />
          <StageRecorder records={data.records} post={post} />
          <ReadinessForm records={data.records} post={post} />
        </>
      ) : <EmptyState title={ui("Choose a school to build its proposal and readiness record.")} />}
    </div>
  );
}

function BlockerList({ blockers }: { blockers: Blocker[] }) {
  const ui = useUiText();
  return <ul className="list-disc space-y-1 ps-5 text-sm">{blockers.map((b, i) => <li key={`${b.item}-${i}`}><span className="font-semibold" dir="ltr">{b.item}</span>: {ui(b.reason)}</li>)}</ul>;
}

type Post = (action: string, body: Record<string, unknown>, success: string) => Promise<unknown>;

function TrustBoard({ board, post }: { board: Data["board"]; post: Post }) {
  const ui = useUiText();
  const [form, setForm] = useState({ market: "PAKISTAN" as TrustMarket, requirement: TRUST_REQUIREMENTS[0] as string, reference: "", reviewer: "", reviewedAt: today(), reviewDueAt: "", locales: [] as string[] });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <section className="sk-panel p-4 sm:p-6" aria-labelledby="trust-board-heading">
      <h2 id="trust-board-heading" className="text-base font-bold text-ink">{ui("Market trust readiness")}</h2>
      <p className="mt-1 text-sm text-ink-muted">{ui("Each market is evaluated on its own. References point to restricted storage; never paste agreement text or personal data.")}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {board.markets.map((m) => (
          <div key={m.market} className="rounded-lg border border-line p-4" data-testid={`trust-market-${m.market}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-ink">{ui(MARKET_LABEL[m.market])}</h3>
              <Badge size="sm" variant={m.ready ? "success" : "danger"}>{ui(m.ready ? "Ready" : "Blocked")}</Badge>
            </div>
            {m.ready ? null : <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink-muted">{m.reasons.map((r) => <li key={r}>{ui(r)}</li>)}</ul>}
          </div>
        ))}
      </div>
      {board.reviews.length ? (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>{ui("Market")}</TableHead><TableHead>{ui("Requirement")}</TableHead><TableHead>{ui("Reference")}</TableHead><TableHead>{ui("Reviewer")}</TableHead><TableHead>{ui("Reviewed")}</TableHead><TableHead>{ui("Expires")}</TableHead><TableHead>{ui("Notice languages")}</TableHead></TableRow></TableHeader>
            <TableBody>{board.reviews.map((r) => (
              <TableRow key={r.id}><TableCell>{ui(MARKET_LABEL[r.market] ?? r.market)}</TableCell><TableCell dir="ltr">{r.requirement}</TableCell><TableCell><bdi>{r.reference}</bdi></TableCell><TableCell><bdi>{r.reviewer}</bdi></TableCell><TableCell dir="ltr">{r.reviewedAt.slice(0, 10)}</TableCell><TableCell dir="ltr">{r.reviewDueAt?.slice(0, 10) ?? "—"}</TableCell><TableCell dir="ltr">{r.locales.join(", ") || "—"}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        </div>
      ) : null}
      <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); if (await post("trust", { data: { ...form, reviewDueAt: form.reviewDueAt || undefined } }, "Trust review recorded.")) set({ reference: "" }); }}>
        <FormField name="trust-market" label={ui("Market")}><Select value={form.market} onChange={(e) => set({ market: e.target.value as TrustMarket })}>{TRUST_MARKETS.map((m) => <option key={m} value={m}>{ui(MARKET_LABEL[m])}</option>)}</Select></FormField>
        <FormField name="trust-requirement" label={ui("Requirement")}><Select value={form.requirement} onChange={(e) => set({ requirement: e.target.value })}>{TRUST_REQUIREMENTS.map((r) => <option key={r} value={r}>{r}</option>)}</Select></FormField>
        <FormField name="trust-reference" label={ui("Reference")}><Input value={form.reference} onChange={(e) => set({ reference: e.target.value })} required minLength={4} /></FormField>
        <FormField name="trust-reviewer" label={ui("Reviewer (role or pseudonym)")}><Input value={form.reviewer} onChange={(e) => set({ reviewer: e.target.value })} required /></FormField>
        <FormField name="trust-reviewed" label={ui("Review date")}><Input type="date" value={form.reviewedAt} onChange={(e) => set({ reviewedAt: e.target.value })} required /></FormField>
        <FormField name="trust-expires" label={ui("Expiry date")}><Input type="date" value={form.reviewDueAt} onChange={(e) => set({ reviewDueAt: e.target.value })} /></FormField>
        {form.requirement === "NOTICES" ? (
          <fieldset className="md:col-span-3"><legend className="text-sm font-semibold text-ink">{ui("Notice languages")}</legend>
            <div className="mt-2 flex flex-wrap gap-4">{["en", "ur", "ar"].map((l) => (
              <label key={l} className="flex items-center gap-2 text-sm"><Checkbox checked={form.locales.includes(l)} onChange={({ target: { checked: c } }) => set({ locales: c ? [...form.locales, l] : form.locales.filter((x) => x !== l) })} /><span dir="ltr">{l}</span></label>
            ))}</div>
            <p className="mt-1 text-xs text-ink-muted">{ui("Required")}: <span dir="ltr">{REQUIRED_NOTICE_LOCALES[form.market].join(", ")}</span></p>
          </fieldset>
        ) : null}
        <div className="md:col-span-3"><Button type="submit">{ui("Record trust review")}</Button></div>
      </form>
    </section>
  );
}

function ProposalBuilder({ records, post }: { records: Records; post: Post }) {
  const ui = useUiText();
  const [p, setP] = useState({ market: "PAKISTAN" as PilotMarket, city: "", pack: "", academicYear: "", campuses: 1, users: 10, startsOn: today(), endsOn: "", amount: "", undecided: true, budgetApprover: "", academicChampion: "", dataProcessingApprover: "", baselineCriteria: "", exitExport: "", claims: "" });
  const set = (patch: Partial<typeof p>) => setP((f) => ({ ...f, ...patch }));
  const payload = { market: p.market, city: p.city, pack: p.pack, academicYear: p.academicYear, campuses: Number(p.campuses), users: Number(p.users), startsOn: p.startsOn, endsOn: p.endsOn, amount: p.undecided ? null : Number(p.amount), currency: MARKET_CURRENCY[p.market],
    budgetApprover: p.budgetApprover || undefined, academicChampion: p.academicChampion || undefined, dataProcessingApprover: p.dataProcessingApprover || undefined, baselineCriteria: p.baselineCriteria || undefined, exitExport: p.exitExport || undefined,
    claims: p.claims.split("\n").map((c) => c.trim()).filter(Boolean) };
  const problems = validateProposal({ ...payload, version: (records.proposals[0]?.version ?? 0) + 1 });
  return (
    <section className="sk-panel p-4 sm:p-6" aria-labelledby="proposal-heading">
      <h2 id="proposal-heading" className="text-base font-bold text-ink">{ui("Pilot proposal")}</h2>
      <form className="mt-3 grid gap-3 md:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); await post("proposal", { data: payload }, "Proposal version saved."); }}>
        <FormField name="proposal-market" label={ui("Market")}><Select value={p.market} onChange={(e) => set({ market: e.target.value as PilotMarket })}>{TRUST_MARKETS.map((m) => <option key={m} value={m}>{ui(MARKET_LABEL[m])}</option>)}</Select></FormField>
        <FormField name="proposal-city" label={ui("City")}><Input value={p.city} onChange={(e) => set({ city: e.target.value })} /></FormField>
        <FormField name="proposal-pack" label={ui("Curriculum pack")}><Input value={p.pack} onChange={(e) => set({ pack: e.target.value })} /></FormField>
        <FormField name="proposal-year" label={ui("Academic year")}><Input value={p.academicYear} onChange={(e) => set({ academicYear: e.target.value })} dir="ltr" /></FormField>
        <FormField name="proposal-campuses" label={ui("Campuses")}><Input type="number" min={1} max={2} value={p.campuses} onChange={(e) => set({ campuses: Number(e.target.value) })} /></FormField>
        <FormField name="proposal-users" label={ui("Users")}><Input type="number" min={1} value={p.users} onChange={(e) => set({ users: Number(e.target.value) })} /></FormField>
        <FormField name="proposal-start" label={ui("Starts")}><Input type="date" value={p.startsOn} onChange={(e) => set({ startsOn: e.target.value })} /></FormField>
        <FormField name="proposal-end" label={ui("Ends")}><Input type="date" value={p.endsOn} onChange={(e) => set({ endsOn: e.target.value })} /></FormField>
        <FormField name="proposal-amount" label={`${ui("Price")} (${MARKET_CURRENCY[p.market]})`}>
          <Input type="number" min={0} value={p.amount} disabled={p.undecided} onChange={(e) => set({ amount: e.target.value })} dir="ltr" />
        </FormField>
        <label className="flex items-center gap-2 text-sm md:col-span-3"><Checkbox checked={p.undecided} onChange={({ target: { checked: c } }) => set({ undecided: Boolean(c) })} />{ui("Price is undecided")}</label>
        <FormField name="proposal-budget" label={ui("Budget approver")}><Input value={p.budgetApprover} onChange={(e) => set({ budgetApprover: e.target.value })} /></FormField>
        <FormField name="proposal-champion" label={ui("Academic champion")}><Input value={p.academicChampion} onChange={(e) => set({ academicChampion: e.target.value })} /></FormField>
        <FormField name="proposal-dp" label={ui("Data-processing approver")}><Input value={p.dataProcessingApprover} onChange={(e) => set({ dataProcessingApprover: e.target.value })} /></FormField>
        <FormField name="proposal-baseline" label={ui("Baseline/follow-up criteria")}><Textarea value={p.baselineCriteria} onChange={(e) => set({ baselineCriteria: e.target.value })} /></FormField>
        <FormField name="proposal-exit" label={ui("Exit/export arrangement")}><Textarea value={p.exitExport} onChange={(e) => set({ exitExport: e.target.value })} /></FormField>
        <FormField name="proposal-claims" label={ui("Sales claims (one per line)")}><Textarea value={p.claims} onChange={(e) => set({ claims: e.target.value })} /></FormField>
        <div className="md:col-span-3">
          {problems.length ? <Alert tone="warning" live="polite" title={ui("This proposal is not ready to send")}><ul className="list-disc space-y-1 ps-5 text-sm" data-testid="proposal-problems">{problems.map((x) => <li key={x}>{ui(x)}</li>)}</ul></Alert> : <Alert tone="success" live="polite" title={ui("No validation problems.")} />}
          <Button className="mt-3" type="submit">{ui("Save proposal version")}</Button>
        </div>
      </form>
      {records.proposals.length ? (
        <ul className="mt-4 space-y-1 text-sm">{records.proposals.map((r) => (
          <li key={r.id}><span className="font-semibold">v{r.version}</span> · <span dir="ltr">{r.amount === null ? ui("Undecided") : `${r.amount} ${r.currency}`}</span> · {r.problems.length ? ui("{0} problem(s)", [r.problems.length]) : ui("Valid")}</li>
        ))}</ul>
      ) : null}
    </section>
  );
}

function StageRecorder({ records, post }: { records: Records; post: Post }) {
  const ui = useUiText();
  const [s, setS] = useState({ demoAttended: false, declinedToPay: false, signedAgreementRef: "", settlementRef: "" });
  return (
    <section className="sk-panel p-4 sm:p-6" aria-labelledby="stage-heading">
      <h2 id="stage-heading" className="text-base font-bold text-ink">{ui("Commercial stage")}</h2>
      <p className="mt-1 text-sm text-ink-muted">{ui("The stage is derived from references; intentions without a signed agreement never advance it.")}</p>
      <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await post("stage", { data: { ...s, signedAgreementRef: s.signedAgreementRef || undefined, settlementRef: s.settlementRef || undefined } }, "Stage evidence recorded."); }}>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={s.demoAttended} onChange={({ target: { checked: c } }) => setS({ ...s, demoAttended: Boolean(c) })} />{ui("Demo attended")}</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={s.declinedToPay} onChange={({ target: { checked: c } }) => setS({ ...s, declinedToPay: Boolean(c) })} />{ui("Declined to pay")}</label>
        <FormField name="stage-agreement" label={ui("Signed agreement reference")}><Input value={s.signedAgreementRef} onChange={(e) => setS({ ...s, signedAgreementRef: e.target.value })} /></FormField>
        <FormField name="stage-settlement" label={ui("Payment settlement reference")}><Input value={s.settlementRef} onChange={(e) => setS({ ...s, settlementRef: e.target.value })} /></FormField>
        <div className="md:col-span-2"><Button type="submit">{ui("Record stage evidence")}</Button></div>
      </form>
      {records.events[0] ? <p className="mt-3 text-sm">{ui("Current stage")}: <Badge size="sm" variant="neutral"><span dir="ltr">{records.events[0].stage}</span></Badge></p> : null}
    </section>
  );
}

const ITEMS = Object.keys(READINESS_ITEMS) as ReadinessItem[];
const PACK_LABEL = { board: "Board", grade: "Grade", subject: "Subject", examYear: "Exam year", academicYear: "Academic year", term: "Term", tier: "Tier" } as const;
type ItemRow = { status: string; reference: string; reviewer: string; reviewedOn: string; note: string };

function ReadinessForm({ records, post }: { records: Records; post: Post }) {
  const ui = useUiText();
  const [scope, setScope] = useState({ schoolRef: "", campusRefs: "", academicLead: "", teachers: "", scopeException: "" });
  const [pack, setPack] = useState({ geography: "PAKISTAN_LAHORE", board: "", grade: "", subject: "", examYear: "", academicYear: "", term: "", tier: "", language: "en", approvalStatus: "DRAFT", approvedAt: "", reviewDueAt: "", localBudgetApprover: false });
  const [items, setItems] = useState<Record<string, ItemRow>>(() => Object.fromEntries(ITEMS.map((i) => [i, { status: "MISSING", reference: "", reviewer: "", reviewedOn: "", note: "" }])));
  const [m, setM] = useState({ pilotId: "", thresholdsAgreedOn: "", thresholdsReference: "", baselineDefined: false });
  const [d, setD] = useState({ outcome: "DEFER", rationale: "", founderApprover: "", schoolApprover: "", decidedOn: today(), rollbackPlan: "", exitExportPlan: "", salesClaimsReviewed: false, negativeEvidence: "" });
  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  const opt = (v: string) => v.trim() || undefined;
  const build = () => ({
    schoolScope: { schoolRef: scope.schoolRef, campusRefs: list(scope.campusRefs), academicLead: scope.academicLead, teachers: list(scope.teachers), scopeException: opt(scope.scopeException) },
    pack: { ...pack, approvedAt: opt(pack.approvedAt), reviewDueAt: opt(pack.reviewDueAt) },
    evidence: ITEMS.map((item) => ({ item, status: items[item].status, reference: opt(items[item].reference), reviewer: opt(items[item].reviewer), reviewedOn: opt(items[item].reviewedOn), note: opt(items[item].note) })),
    measurement: m.pilotId ? { ...m } : undefined,
    decision: d.rationale ? { ...d, negativeEvidence: d.negativeEvidence.split("\n").map((x) => x.trim()).filter(Boolean) } : undefined,
  });
  const latest = records.readiness[0];
  return (
    <section className="sk-panel p-4 sm:p-6" aria-labelledby="readiness-heading">
      <h2 id="readiness-heading" className="text-base font-bold text-ink">{ui("Readiness checklist and go/no-go decision")}</h2>
      {latest ? (
        latest.ready ? <Alert className="mt-3" tone="success" live="off" title={ui("Version {0}: ready, signed by {1}.", [latest.version, latest.signer ?? "—"])} />
          : <Alert className="mt-3" tone="warning" live="off" title={ui("Version {0} is not ready", [latest.version])}><BlockerList blockers={latest.blockers} /></Alert>
      ) : null}
      <form className="mt-4 space-y-6" onSubmit={async (e) => { e.preventDefault(); await post("readiness", { data: build() }, "Readiness version saved."); }}>
        <fieldset className="grid gap-3 md:grid-cols-3"><legend className="mb-2 font-semibold text-ink">{ui("School scope")}</legend>
          <FormField name="rd-school" label={ui("School reference")}><Input value={scope.schoolRef} onChange={(e) => setScope({ ...scope, schoolRef: e.target.value })} /></FormField>
          <FormField name="rd-campuses" label={ui("Campus references (comma separated)")}><Input value={scope.campusRefs} onChange={(e) => setScope({ ...scope, campusRefs: e.target.value })} /></FormField>
          <FormField name="rd-lead" label={ui("Academic lead")}><Input value={scope.academicLead} onChange={(e) => setScope({ ...scope, academicLead: e.target.value })} /></FormField>
          <FormField name="rd-teachers" label={ui("Teachers (comma separated pseudonyms)")}><Input value={scope.teachers} onChange={(e) => setScope({ ...scope, teachers: e.target.value })} /></FormField>
          <FormField name="rd-exception" label={ui("Scope exception")}><Input value={scope.scopeException} onChange={(e) => setScope({ ...scope, scopeException: e.target.value })} /></FormField>
        </fieldset>
        <fieldset className="grid gap-3 md:grid-cols-4"><legend className="mb-2 font-semibold text-ink">{ui("Curriculum pack")}</legend>
          <FormField name="rd-geo" label={ui("Geography")}><Select value={pack.geography} onChange={(e) => setPack({ ...pack, geography: e.target.value })}>{["PAKISTAN_LAHORE", "PAKISTAN_ISLAMABAD_RAWALPINDI", "KSA_RIYADH", "KSA_JEDDAH", "UAE_DUBAI"].map((g) => <option key={g} value={g}>{g}</option>)}</Select></FormField>
          {(["board", "grade", "subject", "examYear", "academicYear", "term", "tier"] as const).map((k) => <FormField key={k} name={`rd-${k}`} label={ui(PACK_LABEL[k])}><Input value={pack[k]} onChange={(e) => setPack({ ...pack, [k]: e.target.value })} /></FormField>)}
          <FormField name="rd-lang" label={ui("Language")}><Select value={pack.language} onChange={(e) => setPack({ ...pack, language: e.target.value })}>{["en", "ur", "ar"].map((l) => <option key={l} value={l}>{l}</option>)}</Select></FormField>
          <FormField name="rd-approval" label={ui("Approval status")}><Select value={pack.approvalStatus} onChange={(e) => setPack({ ...pack, approvalStatus: e.target.value })}>{["DRAFT", "IN_REVIEW", "APPROVED", "SUPERSEDED", "REVOKED"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></FormField>
          <FormField name="rd-approved" label={ui("Approved on")}><Input type="date" value={pack.approvedAt} onChange={(e) => setPack({ ...pack, approvedAt: e.target.value })} /></FormField>
          <FormField name="rd-due" label={ui("Review due")}><Input type="date" value={pack.reviewDueAt} onChange={(e) => setPack({ ...pack, reviewDueAt: e.target.value })} /></FormField>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={pack.localBudgetApprover} onChange={({ target: { checked: c } }) => setPack({ ...pack, localBudgetApprover: Boolean(c) })} />{ui("Local budget approver recorded")}</label>
        </fieldset>
        <fieldset><legend className="mb-2 font-semibold text-ink">{ui("Readiness items")}</legend>
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>{ui("Item")}</TableHead><TableHead>{ui("Owner")}</TableHead><TableHead>{ui("Status")}</TableHead><TableHead>{ui("Reference")}</TableHead><TableHead>{ui("Reviewer")}</TableHead><TableHead>{ui("Review date")}</TableHead><TableHead>{ui("Note")}</TableHead></TableRow></TableHeader>
            <TableBody>{ITEMS.map((item) => {
              const row = items[item]; const set = (patch: Partial<ItemRow>) => setItems((all) => ({ ...all, [item]: { ...all[item], ...patch } }));
              return (
                <TableRow key={item}>
                  <TableCell dir="ltr" className="font-semibold">{item}</TableCell><TableCell dir="ltr" className="text-ink-muted">{READINESS_ITEMS[item]}</TableCell>
                  <TableCell><Select aria-label={ui("Status")} value={row.status} onChange={(e) => set({ status: e.target.value })}>{["MISSING", "IN_REVIEW", "PASSED", "WAIVED_NOT_APPLICABLE"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></TableCell>
                  <TableCell><Input aria-label={ui("Reference")} value={row.reference} onChange={(e) => set({ reference: e.target.value })} /></TableCell>
                  <TableCell><Input aria-label={ui("Reviewer")} value={row.reviewer} onChange={(e) => set({ reviewer: e.target.value })} /></TableCell>
                  <TableCell><Input aria-label={ui("Review date")} type="date" value={row.reviewedOn} onChange={(e) => set({ reviewedOn: e.target.value })} /></TableCell>
                  <TableCell><Input aria-label={ui("Note")} value={row.note} onChange={(e) => set({ note: e.target.value })} /></TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table></div>
        </fieldset>
        <fieldset className="grid gap-3 md:grid-cols-4"><legend className="mb-2 font-semibold text-ink">{ui("Measurement baseline and thresholds")}</legend>
          <FormField name="rd-pilot" label={ui("Measurement pilot id")}><Input value={m.pilotId} onChange={(e) => setM({ ...m, pilotId: e.target.value })} dir="ltr" /></FormField>
          <FormField name="rd-thr-date" label={ui("Thresholds agreed on")}><Input type="date" value={m.thresholdsAgreedOn} onChange={(e) => setM({ ...m, thresholdsAgreedOn: e.target.value })} /></FormField>
          <FormField name="rd-thr-ref" label={ui("Thresholds reference")}><Input value={m.thresholdsReference} onChange={(e) => setM({ ...m, thresholdsReference: e.target.value })} /></FormField>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={m.baselineDefined} onChange={({ target: { checked: c } }) => setM({ ...m, baselineDefined: Boolean(c) })} />{ui("Baseline defined")}</label>
        </fieldset>
        <fieldset className="grid gap-3 md:grid-cols-3"><legend className="mb-2 font-semibold text-ink">{ui("Go/no-go decision")}</legend>
          <FormField name="rd-outcome" label={ui("Decision")}><Select value={d.outcome} onChange={(e) => setD({ ...d, outcome: e.target.value })}>{["GO", "NARROW", "STOP", "DEFER"].map((o) => <option key={o} value={o}>{o}</option>)}</Select></FormField>
          <FormField name="rd-founder" label={ui("Founder approver")}><Input value={d.founderApprover} onChange={(e) => setD({ ...d, founderApprover: e.target.value })} /></FormField>
          <FormField name="rd-school-approver" label={ui("School approver")}><Input value={d.schoolApprover} onChange={(e) => setD({ ...d, schoolApprover: e.target.value })} /></FormField>
          <FormField name="rd-decided" label={ui("Decided on")}><Input type="date" value={d.decidedOn} onChange={(e) => setD({ ...d, decidedOn: e.target.value })} /></FormField>
          <FormField name="rd-rollback" label={ui("Rollback plan reference")}><Input value={d.rollbackPlan} onChange={(e) => setD({ ...d, rollbackPlan: e.target.value })} /></FormField>
          <FormField name="rd-exit" label={ui("Exit/export plan reference")}><Input value={d.exitExportPlan} onChange={(e) => setD({ ...d, exitExportPlan: e.target.value })} /></FormField>
          <FormField name="rd-rationale" label={ui("Rationale")}><Textarea value={d.rationale} onChange={(e) => setD({ ...d, rationale: e.target.value })} /></FormField>
          <FormField name="rd-negative" label={ui("Negative evidence (one per line)")}><Textarea value={d.negativeEvidence} onChange={(e) => setD({ ...d, negativeEvidence: e.target.value })} /></FormField>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={d.salesClaimsReviewed} onChange={({ target: { checked: c } }) => setD({ ...d, salesClaimsReviewed: Boolean(c) })} />{ui("Sales and demo claims reviewed")}</label>
        </fieldset>
        <Button type="submit">{ui("Save readiness version")}</Button>
      </form>
    </section>
  );
}
