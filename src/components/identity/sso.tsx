"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Building2, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { useUiText } from "@/components/locale/LocaleProvider";

// SKO-446: school sign-in. The chooser lists a school's enabled providers; the callback hands the provider's
// code and state to the server, which verifies everything. Password sign-in always remains available.

export function SsoChooser() {
  const ui = useUiText();
  const params = useSearchParams();
  const [school, setSchool] = useState(params.get("school") ?? ""), [data, setData] = useState<{ school: string | null; connections: { id: string; name: string }[] } | null>(null);
  const [loading, setLoading] = useState(false), [failed, setFailed] = useState(false);
  const error = params.get("error");
  const look = async (slug: string) => {
    if (!slug.trim()) return;
    setLoading(true); setFailed(false); setData(null);
    try { const r = await fetch(`/api/auth/sso/connections?school=${encodeURIComponent(slug.trim())}`); const json = await r.json().catch(() => null); const next = json?.data; if (!r.ok || !next || !Array.isArray(next.connections)) { setFailed(true); return; } setData(next); }
    catch { setFailed(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (params.get("school")) void look(params.get("school")!); }, [params]);
  return <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-8" data-sso>
    <div className="space-y-3">
      <span aria-hidden="true" className="sk-page-icon"><Building2 className="size-5" /></span>
      <h1 className="text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{ui("Sign in with your school account")}</h1>
      <p className="text-sm leading-relaxed text-ink-muted">{ui("Enter your school code to see the sign-in options your school has turned on.")}</p>
    </div>
    {error ? <Alert tone="danger" compact live="assertive" data-sso-error>{ui(error)}</Alert> : null}
    <form className="sk-panel sk-enter flex flex-col gap-4 p-4 sm:p-6" onSubmit={e => { e.preventDefault(); void look(school); }}>
      <FormField name="sso-school" label={ui("School code")} hint={ui("Your school's Skoolee code, for example cedar-school.")}><Input value={school} onChange={e => setSchool(e.target.value)} dir="ltr" autoComplete="organization" data-sso-school /></FormField>
      <Button type="submit" variant="outline" loading={loading} disabled={!school.trim()} data-sso-find>{ui("Find sign-in options")}</Button>
    </form>
    {failed ? <Alert tone="danger" compact live="polite" actions={<Button type="button" size="sm" variant="outline" onClick={() => void look(school)}><RefreshCw aria-hidden="true" />{ui("Try again")}</Button>}>{ui("Could not look up sign-in options. Check your connection and try again.")}</Alert> : null}
    {loading ? <SkeletonRegion label={ui("Finding sign-in options…")} className="space-y-2"><Skeleton className="h-11 w-full rounded-xl" /><Skeleton className="h-11 w-full rounded-xl" /></SkeletonRegion> : null}
    {data ? data.connections.length ? <div className="sk-stagger space-y-2" data-sso-options>
      <p className="text-sm font-semibold text-ink-strong"><bdi>{data.school}</bdi></p>
      {data.connections.map(c => <a key={c.id} href={`/api/auth/sso/start?connection=${c.id}`} className={buttonVariants({ variant: "outline", size: "lg", className: "sk-nudge-trigger sk-hover-lift w-full" })} data-sso-connection={c.name}>
        <span className="min-w-0 truncate">{ui("Continue with {0}", [c.name])}</span>
        <span aria-hidden="true" className="sk-nudge inline-flex"><ArrowRight className="size-4 rtl:rotate-180" /></span>
      </a>)}
    </div> : <div data-sso-none><EmptyState size="sm" icon={KeyRound} title={ui("Your school has not turned on school sign-in")} description={ui("You can still sign in with your Skoolee password.")} /></div> : null}
    <a href="/login" className="sk-link self-center text-sm font-medium text-primary">{ui("Use your Skoolee password instead")}</a>
  </main>;
}

export function SsoCallback() {
  const ui = useUiText();
  const params = useSearchParams(), router = useRouter();
  const [message, setMessage] = useState<string | null>(null), sent = useRef(false);
  useEffect(() => {
    if (sent.current) return; sent.current = true;
    const code = params.get("code"), state = params.get("state");
    if (params.get("error") || !code || !state) { setMessage(params.get("error_description") || "The school identity provider did not confirm this sign-in. Try again or use your Skoolee password."); return; }
    void fetch("/api/auth/sso/callback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, state }) }).then(async r => {
      const json = await r.json().catch(() => ({}));
      if (json.mfaRequired) { router.replace("/protect-account"); return; }
      // F20: a finished school sign-in lands on the person's own console, never on the marketing root.
      if (r.ok && json.success) {
        const home = typeof json.dashboardPath === "string" && json.dashboardPath.startsWith("/") && !json.dashboardPath.startsWith("//") ? json.dashboardPath
          : await fetch("/api/auth/session", { cache: "no-store" }).then(s => s.ok ? s.json() : null).then(body => typeof body?.user?.dashboardPath === "string" ? body.user.dashboardPath as string : "/").catch(() => "/");
        router.replace(home);
        return;
      }
      setMessage(json.error || "The school identity provider did not confirm this sign-in. Try again or use your Skoolee password.");
    }).catch(() => setMessage("The school identity provider did not confirm this sign-in. Try again or use your Skoolee password."));
  }, [params, router]);
  return <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8" data-sso-callback>
    {message ? <>
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-2xl bg-status-error-surface text-status-error-text shadow-xs"><ShieldAlert className="size-6" /></span>
      <h1 className="text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{ui("School sign-in did not finish")}</h1>
      <Alert tone="danger" live="assertive" data-sso-callback-message>{ui(message)}</Alert>
      <div className="flex flex-wrap gap-2">
        <a href="/sso" className={buttonVariants({ variant: "outline", className: "flex-1" })}>{ui("Try school sign-in again")}</a>
        <a href="/login" className={buttonVariants({ className: "flex-1" })}>{ui("Use your Skoolee password instead")}</a>
      </div>
    </> : <SkeletonRegion label={ui("Confirming your school sign-in…")} className="space-y-2"><Skeleton className="h-11 w-full rounded-xl" /><Skeleton className="h-11 w-full rounded-xl" /></SkeletonRegion>}
  </main>;
}
