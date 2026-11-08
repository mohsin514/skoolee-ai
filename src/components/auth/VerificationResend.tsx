"use client";

import { RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authCopy } from "@/lib/auth/auth-copy";
import { fillText } from "@/lib/auth/fill-nodes";
import type { Language } from "@/lib/locale/package";
import { CountdownRing } from "./CountdownRing";
import { useVerificationResend } from "./use-verification-resend";

/**
 * "Send a new verification link" with a visible 60s cooldown. Register step 3
 * only (never forgot password: its "no Send/Resend button" pin). The result
 * Alert appears only after a click.
 */
export type VerificationResendProps = { language: Language; email: string };

const COOLDOWN = 60;

export function VerificationResend({ language, email }: VerificationResendProps) {
  const copy = authCopy[language].resend;
  const { state, remaining, send } = useVerificationResend({ cooldown: COOLDOWN });
  const sending = state === "sending";

  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-3">
      <Button variant="outline" type="button" loading={sending} disabled={remaining > 0} onClick={() => { void send(email); }}>
        {sending ? null : <RotateCcw aria-hidden="true" className="rtl:-scale-x-100" />}
        {sending ? copy.sending : copy.send}
      </Button>
      {remaining > 0 ? (
        <p className="flex items-center gap-2 text-xs text-ink-subtle" data-numeric>
          <CountdownRing total={COOLDOWN} remaining={remaining} />
          {fillText(copy.wait, remaining)}
        </p>
      ) : null}
      {state === "sent" ? <Alert tone="success" title={copy.sent} /> : null}
      {state === "error" ? <Alert tone="danger" title={copy.failed} /> : null}
    </div>
  );
}
