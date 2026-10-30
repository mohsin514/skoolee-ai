"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Camera, CircleAlert, CircleCheck, CircleDashed, FileArchive, Globe2, MessageSquare, Receipt, ShieldCheck, type LucideIcon } from "lucide-react";
import { DeskFilterStatus, DeskPill, DeskRowIcon, DeskStats, StatTile, deskRow, type DeskTone } from "@/components/ui/desk";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { SegmentedChoice } from "@/components/ui/choice-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { readRequest, requestFailure, type RequestFailure } from "@/lib/http/request-state";

// SKAI-1157: the guardian answers yes or no for each purpose; nothing is pre-selected, and both answers are
// equally prominent. The language the notice is shown in is recorded with the answer. Staff see each pupil's
// guardians, their latest answer, its language and whether it answers the current notice.

type Ui = ReturnType<typeof useUiText>;
type Purpose = "schoolRecords" | "familyMessages" | "photosMedia" | "aiAssistance" | "crossBorderHosting";
type Consent = { id: string; guardianName: string; choices: Record<Purpose, boolean>; noticeVersion: string; language: string; receiptCode: string; at: string };
type View = { noticeVersion: string; purposes: Purpose[]; state: State; current: Consent | null; history: Consent[] };
type State = "CURRENT" | "OUTDATED" | "MISSING" | "PARTIAL";
type StudentStatus = { studentId: string; fullName: string; rollNo: string; className: string; state: State; guardians: { name: string; state: State; consent: Consent | null }[] };

const PURPOSES: Record<Purpose, [string, string]> = {
  schoolRecords: ["School records", "Keep and use my child's records for teaching, attendance, results and fees."],
  familyMessages: ["Messages to family", "Send me messages about my child by SMS, email and WhatsApp."],
  photosMedia: ["Photos and videos", "Use photos and videos of my child in school publications and social media."],
  aiAssistance: ["AI assistance", "Use AI tools on my child's work. Names are removed before anything is sent."],
  crossBorderHosting: ["Hosting outside the country", "Store and process my child's data on secure servers outside our country."],
};
const PURPOSE_ICON: Record<Purpose, LucideIcon> = { schoolRecords: FileArchive, familyMessages: MessageSquare, photosMedia: Camera, aiAssistance: Bot, crossBorderHosting: Globe2 };
const STATE_ICON: Record<State, LucideIcon> = { CURRENT: CircleCheck, PARTIAL: CircleAlert, OUTDATED: CircleAlert, MISSING: CircleDashed };
const deskTone = (state: State): DeskTone => (state === "CURRENT" ? "success" : state === "MISSING" ? "neutral" : "warning");
const LANGUAGE_NAME: Record<string, string> = { en: "English", ar: "العربية", ur: "اردو" };
const stateLabel = (ui: Ui, state: State) => ({ CURRENT: ui("Up to date"), OUTDATED: ui("Needs a new answer"), MISSING: ui("No answer yet"), PARTIAL: ui("Some guardians answered") })[state];
const stateVariant = (state: State) => (state === "CURRENT" ? "success" : state === "MISSING" ? "neutral" : "warning") as "success" | "neutral" | "warning";

function useJson<T>(url: string) {
  const [data, setData] = useState<T | null>(null), [failure, setFailure] = useState<RequestFailure | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const run = ++sequence.current;
    setFailure(null);
    try {
      const response = await readRequest(url);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Could not load consent.");
      if (run === sequence.current) setData(json.data);
    } catch (error) { if (run === sequence.current) { setData(null); setFailure(requestFailure(error)); } }
  }, [url]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  return { data, failure, load };
}

/** Parent screen: the notice for one child, a yes/no per purpose, and the answers already on record. */
export function GuardianConsentForm({ studentId }: { studentId: string }) {
  const ui = useUiText();
  const { language } = useLocale();
  const { dateTime } = useLocaleFormat();
  const { data, failure, load } = useJson<View>(`/api/family/consent?studentId=${encodeURIComponent(studentId)}`);
  const [choices, setChoices] = useState<Partial<Record<Purpose, boolean>>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");

  if (failure) return <ErrorState title={ui("Consent could not be loaded")} error={failure} onRetry={load} />;
  if (!data) return <SkeletonList rows={3} />;
  const complete = data.purposes.every(p => typeof choices[p] === "boolean");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/family/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, choices, noticeVersion: data.noticeVersion, language }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Your answer was not saved.");
      toast.success(ui("Consent saved. Receipt {0}", [json.data.receiptCode]));
      setChoices({});
      await load();
    } catch (failed) { setError(ui(failed instanceof Error ? failed.message : "Your answer was not saved.")); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {data.current ? (
        <Alert tone={data.state === "CURRENT" ? "success" : "warning"} title={stateLabel(ui, data.state)}>
          {ui("Last answered {0} in {1}. Receipt {2}.", [dateTime(data.current.at), LANGUAGE_NAME[data.current.language] ?? data.current.language, data.current.receiptCode])}
        </Alert>
      ) : null}
      <Card className="space-y-5 p-5">
        <p className="text-sm text-ink-muted">{ui("Choose yes or no for each purpose. You can change your answers at any time; every answer is kept on record.")}</p>
        <ul className="space-y-2">
          {data.purposes.map(purpose => (
            <li key={purpose} data-tone={typeof choices[purpose] === "boolean" ? (choices[purpose] ? "success" : "neutral") : undefined} className={cn(deskRow, "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")}>
              <div className="flex min-w-0 items-start gap-3"><DeskRowIcon icon={PURPOSE_ICON[purpose]} /><div className="min-w-0">
                <p className="font-semibold text-ink">{ui(PURPOSES[purpose][0])}</p>
                <p className="text-sm text-ink-muted">{ui(PURPOSES[purpose][1])}</p>
              </div></div>
              <SegmentedChoice
                className="shrink-0"
                label={ui(PURPOSES[purpose][0])}
                value={choices[purpose] === undefined ? "" : choices[purpose] ? "yes" : "no"}
                options={[{ value: "yes", label: ui("Yes, I agree") }, { value: "no", label: ui("No") }]}
                onChange={value => setChoices(prev => ({ ...prev, [purpose]: value === "yes" }))}
              />
            </li>
          ))}
        </ul>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">{ui("Notice version {0} · shown in {1}", [data.noticeVersion, LANGUAGE_NAME[language]])}</p>
          <Button onClick={submit} disabled={!complete || busy} loading={busy}>{ui("Save my answers")}</Button>
        </div>
      </Card>
      {data.history.length ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-ink">{ui("Your answers on record")}</h2>
          <ul className="space-y-2">
            {data.history.map(row => (
              <li key={row.id} data-tone="info" className={cn(deskRow, "flex flex-wrap items-center gap-3 text-sm")}>
                <DeskRowIcon icon={Receipt} />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><bdi>{dateTime(row.at)}</bdi> · {LANGUAGE_NAME[row.language] ?? row.language} · {ui("{0} of {1} agreed", [Object.values(row.choices).filter(Boolean).length, Object.keys(row.choices).length])}</span>
                <DeskPill tone="neutral"><span className="font-mono" dir="ltr">{row.receiptCode}</span></DeskPill>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Admin view: every active pupil on the campus with each guardian's latest answer. */
export function ConsentStatusPanel() {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const { data, failure, load } = useJson<StudentStatus[]>("/api/guardian-consents");
  const [only, setOnly] = useState<State | null>(null);
  if (failure) return <ErrorState title={ui("Consent could not be loaded")} error={failure} onRetry={load} />;
  if (!data) return <SkeletonList rows={4} />;
  if (!data.length) return <EmptyState icon={ShieldCheck} title={ui("No active pupils")} description={ui("Consent appears here once pupils are enrolled and guardians are linked.")} />;
  const counts = (["CURRENT", "PARTIAL", "MISSING"] as State[]).map(state => [state, data.filter(row => row.state === state).length] as const);
  return (
    <div className="space-y-4">
      {/* Each counter filters the table to that standing; pressing it again shows every pupil. */}
      <DeskStats>{counts.map(([state, count], index) => <StatTile key={state} index={index} icon={STATE_ICON[state]} tone={deskTone(state)} value={<bdi>{count}</bdi>} label={stateLabel(ui, state)} onSelect={() => setOnly(only === state ? null : state)} selected={only === state} />)}</DeskStats>
      <DeskFilterStatus shown={only ? data.filter(row => row.state === only).length : data.length} total={data.length} onClear={() => setOnly(null)} />
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>{ui("Pupil")}</TableHead><TableHead>{ui("Class")}</TableHead><TableHead>{ui("Status")}</TableHead><TableHead>{ui("Guardians")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.filter(row => !only || row.state === only).map(row => (
              <TableRow key={row.studentId}>
                <TableCell><bdi className="font-medium">{row.fullName}</bdi> <bdi dir="ltr" className="text-xs text-ink-muted">#{row.rollNo}</bdi></TableCell>
                <TableCell>{row.className}</TableCell>
                <TableCell><DeskPill tone={deskTone(row.state)}>{stateLabel(ui, row.state)}</DeskPill></TableCell>
                <TableCell>
                  {row.guardians.length ? <ul className="space-y-1 text-sm">{row.guardians.map((g, i) => (
                    <li key={i}><bdi className="font-medium">{g.name}</bdi> · {g.consent
                      ? <>{ui("{0} of {1} agreed", [Object.values(g.consent.choices).filter(Boolean).length, Object.keys(g.consent.choices).length])} · {LANGUAGE_NAME[g.consent.language] ?? g.consent.language} · {dateTime(g.consent.at)}{g.state === "OUTDATED" ? <> · {stateLabel(ui, "OUTDATED")}</> : null}</>
                      : stateLabel(ui, "MISSING")}</li>
                  ))}</ul> : <span className="text-sm text-ink-muted">{ui("No guardian linked")}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
