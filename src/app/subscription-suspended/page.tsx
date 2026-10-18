"use client";

import Link from "next/link";
import { CreditCard, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUiText } from "@/components/locale/LocaleProvider";

// SKO-373: the suspended screen keeps recovery reachable for the payer, tells
// everyone else who to contact, and always offers a way out (sign out).
export default function SubscriptionSuspendedPage() {
  const ui = useUiText();
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  };
  return (
    <main className="min-h-screen bg-brand-50 px-6 py-12 text-ink-strong">
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center">
        <Card className="sk-rise w-full border-amber-200 bg-white shadow-2xl shadow-amber-100/40" style={{ animationDelay: "0ms" }}>
          <CardContent className="p-8 md:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-amber-100 text-amber-700 shadow-inner">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{ui("Subscription needs attention")}</h1>
                <p className="mt-2 text-sm font-medium leading-6 text-ink">
                  {ui("Access to school operations is paused until billing is updated. Your records stay in place, and the billing owner can still open billing to restore the subscription.")}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink-muted">{ui("If you do not manage billing, billing shows who to contact.")}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/dashboard/billing">
                    <Button>
                      <CreditCard className="h-4 w-4" />
                      {ui("Open billing")}
                    </Button>
                  </Link>
                  <Button variant="outline" onClick={() => void signOut()}>
                    <LogOut className="h-4 w-4" />
                    {ui("Sign out")}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
