"use client";

import type { ReactNode } from "react";
import { AuthMascot, type AuthMascotSignals } from "@/components/auth/AuthMascot";

/**
 * The package chooser's pinned footer: Oolee with a one-sentence verdict in a
 * speech bubble ("Enterprise fits 3 campuses and 420 students, with room for
 * 2,080 more. Why not Pro? It covers 1 campus.") and the actions, so the
 * decision stays one click away from any scroll position.
 *
 * It stays mounted across the choose and receipt phases so Oolee's success and
 * celebrate pulses fire. The bubble is not a live region: `announce` (debounced
 * by the caller) is the one polite status. Oolee is decorative here — the page
 * already names "Skoolee AI" once and the bubble carries the meaning.
 */
export type PackageVerdictProps = {
  /** The bubble's id (the Modal's aria-describedby). */
  id: string;
  /** The verdict sentence; omitted in the receipt phase (no bubble). */
  text?: string;
  /** The price line under the sentence. */
  price?: string;
  announce?: string;
  signals: AuthMascotSignals;
  actions: ReactNode;
};

export function PackageVerdict({ id, text, price, announce, signals, actions }: PackageVerdictProps) {
  return (
    <div className="sk-chooser-footer">
      <div className="sk-chooser-verdict">
        <span aria-hidden="true" className="shrink-0"><AuthMascot size="min(1.375rem, 7vw)" rule={false} signals={signals} /></span>
        {text ? (
          <p id={id} className="sk-verdict-bubble">
            <span data-part="text">{text}</span>
            {price ? <span data-part="price">{price}</span> : null}
          </p>
        ) : null}
      </div>
      <p role="status" className="sr-only">{announce}</p>
      <div className="sk-chooser-actions">{actions}</div>
    </div>
  );
}
