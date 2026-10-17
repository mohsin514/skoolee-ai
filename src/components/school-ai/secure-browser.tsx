"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { secureBrowserCopy } from "./secure-browser-copy";

// SKO-449 surfaces: the learner admission gate, the coordinator profile manager and the invigilator alternative.
export type SecureBrowserState = { required: false } | { required: true; admitted: boolean; via: "SEB" | "SUPERVISED_ALTERNATIVE" | null; reason: "MISSING_HEADERS" | "CONFIG_MISMATCH" | "CLIENT_MISMATCH" | "NO_EVIDENCE" | null; profile: { name: string; minClientVersion: string; version: number } };

/** Shown before any timer or paper when a secure exam cannot admit this browser. */
export function SecureBrowserGate({ id, state, locale }: { id: string; state: SecureBrowserState; locale: AssessmentLocale }) {
  const t = secureBrowserCopy(locale);
  if (!state.required) return null;
  if (state.admitted) return <p role="status" className="sk-panel flex items-center gap-2 p-4 text-sm"><ShieldCheck aria-hidden="true" className="size-5 text-status-success-text" />{state.via === "SUPERVISED_ALTERNATIVE" ? t.admittedAlternative : t.admittedSeb} · <bdi dir="auto">{state.profile.name}</bdi> v{state.profile.version}</p>;
  return <section role="alert" aria-labelledby="seb-gate-title" className="sk-panel space-y-3 border-status-warning-border p-5">
    <h2 id="seb-gate-title" className="flex items-center gap-2 text-lg font-bold"><Lock aria-hidden="true" className="size-5" />{t.required}</h2>
    <p>{state.reason ? t.reasons[state.reason] : t.reasons.NO_EVIDENCE}</p>
    <p className="font-semibold">{t.noTimer}</p>
    <dl className="grid gap-1 text-sm sm:grid-cols-2"><div><dt className="text-ink-subtle">{t.profile}</dt><dd><bdi dir="auto">{state.profile.name}</bdi> · v{state.profile.version}</dd></div><div><dt className="text-ink-subtle">{t.minVersion}</dt><dd dir="ltr" className="text-start">{state.profile.minClientVersion}</dd></div></dl>
    <a className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline" href={`/api/school-ai/exams/${encodeURIComponent(id)}/seb-config`}><Download aria-hidden="true" className="size-4" />{t.download}</a>
    <p className="text-sm">{t.help}</p>
    <p className="text-xs text-ink-subtle">{t.limits}</p>
  </section>;
}

type Device = { platform: "WINDOWS" | "MACOS" | "IPADOS"; clientVersion: string; testedOn: string; result: "PASS" | "FAIL"; assistiveTools: string[]; notes: string };
type Profile = { id: string; profileKey: string; version: number; name: string; status: "DRAFT" | "APPROVED" | "RETIRED"; minClientVersion: string; configKeys: string[]; browserExamKeys: string[]; allowedResources: string[]; testedDevices: Device[]; approvalIssues: string[] };
async function call(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data;
}
const lines = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

export function SecureProfiles({ locale }: { locale: AssessmentLocale }) {
  const t = secureBrowserCopy(locale);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const load = useCallback(async () => setProfiles((await call("/api/school-ai/secure-profiles")).profiles), []);
  useEffect(() => { load().catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed })); }, [load, t.failed]);
  const run = async (work: () => Promise<unknown>) => { setStatus(null); try { await work(); await load(); setStatus({ tone: "ok", text: t.saved }); return true; } catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }); return false; } };
  const latest = (profiles ?? []).filter((row, index, all) => all.findIndex(other => other.profileKey === row.profileKey) === index);
  return <div className="space-y-4">
    {status && <p role="status" className={`rounded-xl border px-3 py-2 text-sm ${status.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{status.text}</p>}
    <p className="text-xs text-ink-subtle">{t.limits}</p>
    {editing === "new" ? <ProfileForm t={t} onCancel={() => setEditing(null)} onSave={async body => { if (await run(() => call("/api/school-ai/secure-profiles", "POST", body))) setEditing(null); }} /> : <Button onClick={() => setEditing("new")}>{t.newProfile}</Button>}
    {profiles && !latest.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-ink-subtle">{t.none}</p>}
    <ul className="grid gap-3" aria-label={t.title}>{latest.map(profile => {
      const history = (profiles ?? []).filter(row => row.profileKey === profile.profileKey);
      return <li key={profile.id} className="sk-panel space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold" dir="auto">{profile.name}</p><p className="text-xs text-ink-subtle">{t.version} {profile.version} · {t.minClient} <bdi dir="ltr">{profile.minClientVersion}</bdi> · {profile.configKeys.length + profile.browserExamKeys.length ? `${profile.configKeys.length + profile.browserExamKeys.length} keys` : t.noKeys}</p></div><span className="rounded-full border px-2 py-0.5 text-xs font-semibold">{t.statuses[profile.status]}</span></div>
        <table className="w-full text-start text-sm"><caption className="text-start text-xs font-semibold">{t.devices}</caption><thead><tr><th scope="col" className="text-start">{t.platform}</th><th scope="col" className="text-start">{t.clientVersion}</th><th scope="col" className="text-start">{t.testedOn}</th><th scope="col" className="text-start">{t.result}</th></tr></thead>
          <tbody>{profile.testedDevices.map((device, index) => <tr key={index}><td>{device.platform}</td><td dir="ltr" className="text-start">{device.clientVersion}</td><td>{device.testedOn}</td><td>{device.result}{device.assistiveTools.length ? ` · ${device.assistiveTools.join(", ")}` : ""}</td></tr>)}</tbody></table>
        {profile.approvalIssues.length > 0 && <ul className="list-disc ps-5 text-sm text-status-warning-text">{profile.approvalIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        <div className="flex flex-wrap gap-2">
          {profile.status === "DRAFT" && <Button disabled={profile.approvalIssues.length > 0} onClick={() => void run(() => call(`/api/school-ai/secure-profiles/${profile.id}`, "PATCH", { status: "APPROVED" }))}>{t.approve}</Button>}
          {profile.status === "APPROVED" && <Button variant="outline" onClick={() => void run(() => call(`/api/school-ai/secure-profiles/${profile.id}`, "PATCH", { status: "RETIRED" }))}>{t.retire}</Button>}
          <Button variant="ghost" onClick={() => setEditing(profile)}>{t.edit}</Button>
        </div>
        {editing !== "new" && editing?.profileKey === profile.profileKey && <ProfileForm t={t} base={profile} expected={history[0].version} onCancel={() => setEditing(null)} onSave={async body => { if (await run(() => call("/api/school-ai/secure-profiles", "POST", body))) setEditing(null); }} />}
      </li>;
    })}</ul>
  </div>;
}

function ProfileForm({ t, base, expected = 0, onCancel, onSave }: { t: ReturnType<typeof secureBrowserCopy>; base?: Profile; expected?: number; onCancel: () => void; onSave: (body: unknown) => Promise<void> }) {
  const [devices, setDevices] = useState<Device[]>(base?.testedDevices ?? []);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), text = (name: string) => String(form.get(name) ?? "");
    void onSave({ ...(base ? { profileKey: base.profileKey } : {}), name: text("name"), minClientVersion: text("minClientVersion"), configKeys: lines(text("configKeys")), browserExamKeys: lines(text("browserExamKeys")), allowedResources: lines(text("allowedResources")), testedDevices: devices, expectedVersion: expected });
  };
  const device = (index: number, patch: Partial<Device>) => setDevices(previous => previous.map((row, position) => position === index ? { ...row, ...patch } : row));
  return <form onSubmit={submit} aria-label={t.title} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
    <label className="grid gap-1 text-xs font-semibold">{t.name}<Input name="name" required minLength={3} defaultValue={base?.name ?? ""} /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.minClient}<Input name="minClientVersion" required pattern="\d+(\.\d+){0,3}" defaultValue={base?.minClientVersion ?? "3.7"} dir="ltr" /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.configKeys}<textarea name="configKeys" rows={2} dir="ltr" className="rounded-md border px-3 py-2 font-mono text-xs" defaultValue={base?.configKeys.join("\n") ?? ""} aria-describedby="seb-keys-help" /></label>
    <label className="grid gap-1 text-xs font-semibold">{t.examKeys}<textarea name="browserExamKeys" rows={2} dir="ltr" className="rounded-md border px-3 py-2 font-mono text-xs" defaultValue={base?.browserExamKeys.join("\n") ?? ""} aria-describedby="seb-keys-help" /></label>
    <p id="seb-keys-help" className="text-xs text-ink-subtle sm:col-span-2">{t.keysHelp}</p>
    <label className="grid gap-1 text-xs font-semibold sm:col-span-2">{t.resources}<textarea name="allowedResources" rows={2} dir="ltr" className="rounded-md border px-3 py-2 text-xs" defaultValue={base?.allowedResources.join("\n") ?? ""} /></label>
    <fieldset className="grid gap-2 sm:col-span-2"><legend className="text-xs font-semibold">{t.devices}</legend>
      {devices.map((row, index) => <div key={index} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-5">
        <label className="grid gap-1 text-xs">{t.platform}<Select value={row.platform} onChange={event => device(index, { platform: event.target.value as Device["platform"] })}><option value="WINDOWS">Windows</option><option value="MACOS">macOS</option><option value="IPADOS">iPadOS</option></Select></label>
        <label className="grid gap-1 text-xs">{t.clientVersion}<Input value={row.clientVersion} dir="ltr" onChange={event => device(index, { clientVersion: event.target.value })} /></label>
        <label className="grid gap-1 text-xs">{t.testedOn}<Input type="date" value={row.testedOn} onChange={event => device(index, { testedOn: event.target.value })} /></label>
        <label className="grid gap-1 text-xs">{t.result}<Select value={row.result} onChange={event => device(index, { result: event.target.value as Device["result"] })}><option value="PASS">PASS</option><option value="FAIL">FAIL</option></Select></label>
        <label className="grid gap-1 text-xs">{t.tools}<Input value={row.assistiveTools.join(", ")} onChange={event => device(index, { assistiveTools: event.target.value.split(",").map(item => item.trim()).filter(Boolean) })} /></label>
      </div>)}
      <Button type="button" variant="outline" onClick={() => setDevices(previous => [...previous, { platform: "WINDOWS", clientVersion: "", testedOn: new Date().toISOString().slice(0, 10), result: "PASS", assistiveTools: [], notes: "" }])}>{t.addDevice}</Button>
    </fieldset>
    <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit">{t.save}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
  </form>;
}

/** Invigilator: approve a recorded supervised alternative for one learner. */
export function SupervisedAlternative({ id, studentId, granted, canGrant, locale, onDone }: { id: string; studentId: string; granted: { reason: string } | null; canGrant: boolean; locale: AssessmentLocale; onDone: () => Promise<void> }) {
  const t = secureBrowserCopy(locale);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  if (granted) return <p className="text-sm">{t.granted}: <span dir="auto">{granted.reason}</span></p>;
  if (!canGrant) return null;
  return <fieldset className="space-y-2 rounded-xl border p-3"><legend className="px-1 font-semibold">{t.alternative}</legend><p className="text-xs text-ink-subtle">{t.alternativeHelp}</p>
    <label className="grid gap-1 text-xs font-semibold">{t.reason}<Input value={reason} maxLength={300} onChange={event => setReason(event.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-status-error-text">{error}</p>}
    <Button type="button" variant="outline" disabled={reason.trim().length < 5} onClick={async () => { setError(""); try { await call(`/api/school-ai/exams/${encodeURIComponent(id)}/secure-alternative`, "POST", { studentId, reason }); await onDone(); } catch (cause) { setError(cause instanceof Error ? cause.message : t.failed); } }}>{t.grant}</Button>
  </fieldset>;
}
