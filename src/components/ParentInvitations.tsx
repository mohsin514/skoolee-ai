"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/locale/LocaleProvider";


type Invitation = { id: string; relationship: string; guardianName: string; childName: string; campusName: string; permissions: unknown };

const text = {
  en: { title: "Guardian invitations", intro: "Review invitations sent to your signed-in account. Accepting links this account to that child only.", loading: "Loading invitations…", none: "There are no invitations for this account.", accept: "Accept invitation", accepted: "Invitation accepted.", error: "Could not load or accept this invitation.", signIn: "Sign in with the email address the school invited." },
  ar: { title: "دعوات ولي الأمر", intro: "راجع الدعوات المرسلة إلى حسابك. قبول الدعوة يربط هذا الحساب بهذا الطفل فقط.", loading: "جارٍ تحميل الدعوات…", none: "لا توجد دعوات لهذا الحساب.", accept: "قبول الدعوة", accepted: "تم قبول الدعوة.", error: "تعذر تحميل الدعوة أو قبولها.", signIn: "سجّل الدخول باستخدام البريد الذي أرسلت إليه المدرسة الدعوة." },
  ur: { title: "سرپرست کی دعوتیں", intro: "اپنے سائن اِن اکاؤنٹ پر بھیجی گئی دعوتیں دیکھیں۔ قبول کرنے سے یہ اکاؤنٹ صرف اسی بچے سے منسلک ہوگا۔", loading: "دعوتیں لوڈ ہو رہی ہیں…", none: "اس اکاؤنٹ کے لیے کوئی دعوت نہیں۔", accept: "دعوت قبول کریں", accepted: "دعوت قبول ہوگئی۔", error: "دعوت لوڈ یا قبول نہیں ہوسکی۔", signIn: "اس ای میل سے سائن اِن کریں جس پر اسکول نے دعوت بھیجی ہے۔" },
};

export function ParentInvitations() {
  const router = useRouter();
  // SKO-490: the signed-in account's effective language from the server-seeded provider.
  const { language } = useLocale();
  const locale: keyof typeof text = language === "ar" || language === "ur" ? language : "en";
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/parent/invitations", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Failed");
      setItems(body.invitations);
    }).catch(() => setError("load")).finally(() => setLoading(false));
  }, []);

  const t = text[locale];
  const accept = async (relationshipId: string) => {
    setBusy(relationshipId); setError("");
    try {
      const response = await fetch("/api/parent/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relationshipId }) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Failed");
      router.push("/parent");
      router.refresh();
    } catch { setError("accept"); }
    finally { setBusy(null); }
  };

  return <main lang={locale} dir={locale === "en" ? "ltr" : "rtl"} className="mx-auto min-h-screen w-full max-w-3xl space-y-5 p-4 sm:p-6">
    <header><h1 className="text-2xl font-bold text-ink-strong">{t.title}</h1><p className="mt-2 text-sm leading-6 text-ink-muted">{t.intro}</p><p className="mt-1 text-xs text-ink-muted">{t.signIn}</p></header>
    {loading ? <p role="status" className="rounded-xl border bg-white p-4">{t.loading}</p> : null}
    {!loading && items.length === 0 ? <p className="rounded-xl border bg-white p-4">{t.none}</p> : null}
    <ul className="space-y-3">{items.map((item) => <li key={item.id} className="sk-panel flex flex-wrap items-center justify-between gap-4 p-4">
      <div><h2 className="font-semibold text-ink-strong"><bdi>{item.childName}</bdi></h2><p className="mt-1 text-sm text-ink-muted"><bdi>{item.campusName}</bdi> · <bdi>{item.relationship}</bdi> · <bdi>{item.guardianName}</bdi></p></div>
      <Button variant="default" type="button" disabled={busy !== null} onClick={() => void accept(item.id)} className="min-h-11">{busy === item.id ? t.loading : t.accept}</Button>
    </li>)}</ul>
    {error ? <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{t.error}</p> : null}
  </main>;
}
