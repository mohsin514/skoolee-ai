"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocale } from "@/components/locale/LocaleProvider";
import { ERROR_WORDS, UI, t } from "./run-copy";

type Handoff = { id: string; kind: string; targetRoute: string; originRole: string; status: string; createdAt: string };

/** Work the AI prepared for this person. The only action is to claim it and decide on its own screen. */
export function HandoffInbox() {
  const { language } = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<Handoff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/ai-workflows/handoffs", { cache: "no-store" }).then(async response => {
      const body = await response.json().catch(() => null);
      if (!response.ok) { setError(body?.code ?? "INTERNAL"); setItems([]); return; }
      setItems(body.handoffs);
    });
  }, []);
  const open = async (item: Handoff) => {
    const response = await fetch(`/api/ai-workflows/handoffs/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" } });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setError(body?.code ?? "INTERNAL"); return; }
    router.push(body.handoff.targetRoute);
  };
  return (
    <section className="space-y-4" dir={language === "en" ? "ltr" : "rtl"} data-ai-handoff-inbox>
      <h1 className="text-2xl font-bold">{t(UI, "waitingTitle", language)}</h1>
      {error && ERROR_WORDS[error as keyof typeof ERROR_WORDS] && <Alert tone="danger">{ERROR_WORDS[error as keyof typeof ERROR_WORDS]![language]}</Alert>}
      {items?.length === 0 && <EmptyState title={t(UI, "waitingEmpty", language)} />}
      <ul className="space-y-2">{items?.map(item => (
        <li key={item.id} data-ai-handoff={item.kind} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
          <span>{item.originRole} · {new Date(item.createdAt).toLocaleDateString(language)}</span>
          <Button onClick={() => void open(item)}>{t(UI, "reviewIn", language)}</Button>
        </li>
      ))}</ul>
    </section>
  );
}
