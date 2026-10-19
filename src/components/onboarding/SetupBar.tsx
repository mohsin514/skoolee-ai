"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

/**
 * The setup desk's one bar: Oolee (the page's only face), the structure
 * summary with the save state, and Save and exit / Sign out. Opaque (no
 * backdrop blur) and sticky from 640px; on phones it is static and wraps to
 * two rows (face + actions, then summary + save state).
 *
 * The save state is the bar's polite live region ("Saving…", "Saved to your
 * account", "Changes save when you continue").
 */
export type SetupSaveState = "saving" | "saved" | "dirty" | "failed";

export type SetupBarProps = {
  face: ReactNode;
  summary: ReactNode;
  /** Omitted on desk pages that save nothing themselves (the package chooser). */
  save?: { state: SetupSaveState; labels: { saving: string; saved: string; dirty: string; failed?: string } };
  actions: ReactNode;
};

export function SetupBar({ face, summary, save, actions }: SetupBarProps) {
  return (
    <header className="sk-setup-bar">
      <div data-part="face">{face}</div>
      <div data-part="summary">
        {summary}
        {save ? <span role="status" aria-live="polite" className="sk-save-state" data-state={save.state}>
          {save.state === "saving" ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : save.state === "saved" ? (
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
          ) : (
            <span aria-hidden="true" className="sk-save-dot" />
          )}
          <span className="min-w-0 truncate">{save.labels[save.state]}</span>
        </span> : null}
      </div>
      <div data-part="actions">{actions}</div>
    </header>
  );
}
