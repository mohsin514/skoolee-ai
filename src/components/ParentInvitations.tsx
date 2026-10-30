"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MailOpen, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { ParentPage } from "@/components/parent/parent-page";


/** Relationship words (EN UI keys), never the raw enum (R7). */
const RELATIONSHIP: Record<string, string> = { FATHER: "Father", MOTHER: "Mother", GUARDIAN: "Guardian", UNCLE: "Uncle", AUNT: "Aunt", GRANDPARENT: "Grandparent", SIBLING: "Sibling" };

type Invitation = { id: string; relationship: string; guardianName: string; childName: string; campusName: string; permissions: unknown };

const text = {
  en: { title: "Guardian invitations", intro: "Review invitations sent to your signed-in account. Accepting links this account to that child only.", loading: "Loading invitations…", none: "There are no invitations for this account.", noneHelp: "Invitations the school sends to this account's email address appear here.", accept: "Accept invitation", accepted: "Invitation accepted.", error: "Could not load or accept this invitation.", signIn: "Sign in with the email address the school invited." },
  ar: { title: "دعوات ولي الأمر", intro: "راجع الدعوات المرسلة إلى حسابك. قبول الدعوة يربط هذا الحساب بهذا الطفل فقط.", loading: "جارٍ تحميل الدعوات…", none: "لا توجد دعوات لهذا الحساب.", noneHelp: "تظهر هنا الدعوات التي ترسلها المدرسة إلى البريد الإلكتروني لهذا الحساب.", accept: "قبول الدعوة", accepted: "تم قبول الدعوة.", error: "تعذر تحميل الدعوة أو قبولها.", signIn: "سجّل الدخول باستخدام البريد الذي أرسلت إليه المدرسة الدعوة." },
  ur: { title: "سرپرست کی دعوتیں", intro: "اپنے سائن اِن اکاؤنٹ پر بھیجی گئی دعوتیں دیکھیں۔ قبول کرنے سے یہ اکاؤنٹ صرف اسی بچے سے منسلک ہوگا۔", loading: "دعوتیں لوڈ ہو رہی ہیں…", none: "اس اکاؤنٹ کے لیے کوئی دعوت نہیں۔", noneHelp: "اسکول اس اکاؤنٹ کے ای میل پر جو دعوتیں بھیجتا ہے وہ یہاں نظر آتی ہیں۔", accept: "دعوت قبول کریں", accepted: "دعوت قبول ہوگئی۔", error: "دعوت لوڈ یا قبول نہیں ہوسکی۔", signIn: "اس ای میل سے سائن اِن کریں جس پر اسکول نے دعوت بھیجی ہے۔" },
};

export function ParentInvitations() {
  const router = useRouter();
  const ui = useUiText();
  // SKO-490: the signed-in account's effective language from the server-seeded provider.
  const { language } = useLocale();
  const locale: keyof typeof text = language === "ar" || language === "ur" ? language : "en";
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<"" | "load" | "accept">("");

  const load = useCallback(() => {
    setLoading(true); setError("");
    void fetch("/api/parent/invitations", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Failed");
      setItems(body.invitations);
    }).catch(() => setError("load")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const t = text[locale];
  const accept = async (relationshipId: string) => {
    setBusy(relationshipId); setError("");
    try {
      const response = await fetch("/api/parent/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relationshipId }) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Failed");
      toast.success(t.accepted);
      router.push("/parent");
      router.refresh();
    } catch { setError("accept"); }
    finally { setBusy(null); }
  };

  return <ParentPage icon={MailOpen} title="Guardian invitations" description={t.intro}>
    <div className="w-full max-w-3xl space-y-4">
      <p className="text-xs text-ink-subtle">{t.signIn}</p>
      {/* R4: a failed load is an inline error with retry, never shown as "no invitations". */}
      {error === "load" ? <ErrorState title={t.error} onRetry={load} retryLabel={ui("Try again")} /> : null}
      {error === "accept" ? <Alert tone="danger" live="assertive">{t.error}</Alert> : null}
      {loading ? <SkeletonList rows={2} label={t.loading} /> : null}
      {!loading && items.length === 0 && error !== "load" ? <EmptyState icon={MailOpen} title={t.none} description={t.noneHelp} /> : null}
      <ul className="sk-stagger space-y-3">{items.map((item) => <li key={item.id} className="sk-panel flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-200/70"><UserRound className="size-5" /></span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-strong [overflow-wrap:anywhere]"><bdi>{item.childName}</bdi></h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted [overflow-wrap:anywhere]"><bdi>{item.campusName}</bdi> · {RELATIONSHIP[item.relationship] ? ui(RELATIONSHIP[item.relationship]) : <bdi>{item.relationship}</bdi>} · <bdi>{item.guardianName}</bdi></p>
          </div>
        </div>
        <Button variant="default" type="button" disabled={busy !== null} loading={busy === item.id} onClick={() => void accept(item.id)} className="w-full sm:w-auto">{t.accept}</Button>
      </li>)}</ul>
    </div>
  </ParentPage>;
}
