"use client";

import { useCallback, useRef, useState } from "react";
import { useCountdown } from "./use-countdown";

/**
 * The one shared auth `fetch`. It fires only when `send` is called (on a
 * click), never on mount. Same request login has always sent; the server is
 * enumeration-safe and throttles silently (5 per 5 min per IP, 3 per 15 min
 * per address), so a success only ever means "accepted".
 */
export function useVerificationResend(opts?: { cooldown?: number /* default 60 */ }): {
  state: "idle" | "sending" | "sent" | "error"; remaining: number; send: (email: string) => Promise<{ ok: boolean; error?: string }>;
} {
  const cooldown = opts?.cooldown ?? 60;
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const { remaining, restart } = useCountdown(0, { autostart: false });
  const inFlight = useRef(false);

  const send = useCallback(async (email: string): Promise<{ ok: boolean; error?: string }> => {
    if (inFlight.current) return { ok: false };
    inFlight.current = true;
    setState("sending");
    try {
      const res = await fetch("/api/auth/verify/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!res.ok) {
        const json: unknown = await res.json().catch(() => ({}));
        const error = json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string" ? (json as { error: string }).error : undefined;
        setState("error");
        return { ok: false, error };
      }
      setState("sent");
      restart(cooldown);
      return { ok: true };
    } catch {
      setState("error");
      return { ok: false };
    } finally {
      inFlight.current = false;
    }
  }, [cooldown, restart]);

  return { state, remaining, send };
}
