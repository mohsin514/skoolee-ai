"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useUiText } from "@/components/locale/LocaleProvider";

// SKO-446: school sign-in. The chooser lists a school's enabled providers; the callback hands the provider's
// code and state to the server, which verifies everything. Password sign-in always remains available.

export function SsoChooser() {
  const ui = useUiText();
  const params = useSearchParams();
  const [school, setSchool] = useState(params.get("school") ?? ""), [data, setData] = useState<{ school: string | null; connections: { id: string; name: string }[] } | null>(null);
  const error = params.get("error");
  const look = async (slug: string) => { if (!slug.trim()) return; const r = await fetch(`/api/auth/sso/connections?school=${encodeURIComponent(slug.trim())}`); setData((await r.json()).data); };
  useEffect(() => { if (params.get("school")) void look(params.get("school")!); }, [params]);
  return <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-4" data-sso>
    <h1 className="text-2xl font-black">{ui("Sign in with your school account")}</h1>
    {error ? <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800" data-sso-error>{ui(error)}</p> : null}
    <FormField name="sso-school" label={ui("School code")} hint={ui("Your school's Skoolee code, for example cedar-school.")}><Input value={school} onChange={e => setSchool(e.target.value)} dir="ltr" data-sso-school /></FormField>
    <Button variant="outline" onClick={() => void look(school)} data-sso-find>{ui("Find sign-in options")}</Button>
    {data ? data.connections.length ? <div className="space-y-2" data-sso-options><p className="text-sm"><bdi>{data.school}</bdi></p>{data.connections.map(c => <a key={c.id} href={`/api/auth/sso/start?connection=${c.id}`} className="flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 font-bold" data-sso-connection={c.name}>{ui("Continue with {0}", [c.name])}</a>)}</div> : <p className="text-sm" data-sso-none>{ui("No identity provider connected. Configure a supported connection.")}</p> : null}
    <a href="/login" className="text-center text-sm underline">{ui("Use your Skoolee password instead")}</a>
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
      if (r.ok && json.success) { router.replace("/"); return; }
      setMessage(json.error || "The school identity provider did not confirm this sign-in. Try again or use your Skoolee password.");
    });
  }, [params, router]);
  return <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-4" data-sso-callback>
    {message ? <><p role="alert" className="rounded-xl border p-3 text-sm" data-sso-callback-message>{ui(message)}</p><a href="/login" className="text-center text-sm underline">{ui("Use your Skoolee password instead")}</a></> : <p className="text-sm">{ui("Confirming your school sign-in…")}</p>}
  </main>;
}
