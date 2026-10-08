"use client";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { securityUiCopy } from "@/lib/auth/security-ui-copy";
type Session = { id: string; userAgent: string | null; loginAt: string; expiresAt: string; current: boolean };
export default function AccountSecurity() {
  const [language, setLanguage] = useState<keyof typeof securityUiCopy>("en");
  const t = securityUiCopy[language];
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  async function load() {
    const response = await fetch("/api/auth/sessions", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { window.location.assign("/login"); return; }
    setSessions(data.sessions); setMfaEnabled(data.mfaEnabled);
  }
  useEffect(() => {
    const lang = document.documentElement.lang;
    if (lang === "ar" || lang === "ur") setLanguage(lang);
    void load().catch(() => setMessage(securityUiCopy.en.error));
  }, []);
  async function revoke(session: Session) {
    setBusy(session.id);
    try {
      const response = await fetch("/api/auth/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: session.id }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (session.current) { window.location.assign("/login"); return; }
      setMessage(`${t.ended}: ${new Date(data.endedAt).toLocaleString(language)}`);
      await load();
    } catch { setMessage(t.error); } finally { setBusy(""); }
  }
  async function replaceAuthenticator(event: FormEvent) {
    event.preventDefault(); setBusy("mfa");
    try {
      const response = await fetch("/api/auth/mfa/replace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, code }) });
      if (!response.ok) throw Error();
      window.location.assign("/protect-account");
    } catch { setMessage(t.error); } finally { setBusy(""); }
  }
  return <main lang={language} dir={language === "en" ? "ltr" : "rtl"} className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
    <Select aria-label="Language" value={language} onChange={e => setLanguage(e.target.value as keyof typeof securityUiCopy)} className="min-h-11"><option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option></Select>
    <h1 className="text-2xl font-bold">{t.title}</h1><p>{t.guidance}</p><p role="status">{message}</p>
    {sessions.map(session => <article key={session.id} className="sk-panel space-y-3 p-4">
      <h2 className="font-semibold">{session.current ? t.this : t.other}</h2><p dir="ltr" className="break-all text-sm">{session.userAgent || t.unknown}</p>
      <p>{t.signed}: {new Date(session.loginAt).toLocaleString(language)}</p><p>{t.expires}: {new Date(session.expiresAt).toLocaleString(language)}</p>
      <Button variant="outline" disabled={Boolean(busy)} onClick={() => revoke(session)} className="min-h-11 px-4">{t.end}</Button>
    </article>)}
    {mfaEnabled && <form onSubmit={replaceAuthenticator} className="sk-panel space-y-3 p-4">
      <h2 className="font-semibold">{t.replace}</h2><p>{t.warning}</p><label htmlFor="current-password" className="block">{t.password}</label>
      <Input id="current-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required className="min-h-11 w-full"/>
      <label htmlFor="replacement-code" className="block">{t.code}</label><Input id="replacement-code" dir="ltr" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required className="min-h-11 w-full"/>
      <Button variant="outline" disabled={Boolean(busy)} className="min-h-11 px-4">{t.submit}</Button>
    </form>}
    <Link href="/login" className="underline">{t.back}</Link>
  </main>;
}
