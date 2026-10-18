"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, LogOut, ShieldAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUiText } from "@/components/locale/LocaleProvider";

// SKO-373: the suspended screen keeps recovery reachable for the payer, tells
// everyone else who to contact, and always offers a way out (sign out).
export default function SubscriptionSuspendedPage() {
  const ui = useUiText();
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  };
  return (
    <main className="sk-hero-wash min-h-screen px-4 py-10 text-ink-strong sm:px-6 sm:py-12">
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center">
        <Card className="sk-enter-scale w-full border-status-warning-border bg-white shadow-xl">
          <CardContent className="p-6 sm:p-8 md:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-status-warning-border bg-status-warning-surface text-status-warning-text shadow-inner">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{ui("Subscription needs attention")}</h1>
                <p className="mt-3 text-sm leading-relaxed text-ink">
                  {ui("Access to school operations is paused until billing is updated. Your records stay in place, and the billing owner can still open billing to restore the subscription.")}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{ui("If you do not manage billing, billing shows who to contact.")}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {/* A link styled as a button: a <button> inside <a> is two
                      nested controls to a keyboard or screen reader. */}
                  <Link href="/dashboard/billing" className={buttonVariants()}>
                    <CreditCard aria-hidden="true" className="h-4 w-4" />
                    {ui("Open billing")}
                  </Link>
                  <Button variant="outline" loading={signingOut} onClick={() => void signOut()}>
                    {signingOut ? null : <LogOut aria-hidden="true" className="h-4 w-4" />}
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
