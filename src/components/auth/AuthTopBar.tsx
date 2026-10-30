"use client";

import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import { LanguageSelect } from "@/components/locale/LanguageSelect";
import type { Language } from "@/lib/locale/package";

/**
 * The top of every auth column: the language picker at the inline end
 * (flush left in RTL), with an optional start slot. LanguageSelect is used
 * as-is and never wrapped in an InputGroup, so its own focus ring survives.
 */
export type AuthTopBarProps = { languageId: string; label: string; value: Language; onChange: (l: Language) => void; start?: ReactNode };

export function AuthTopBar({ languageId, label, value, onChange, start }: AuthTopBarProps) {
  return (
    <div className="sk-auth-topbar sk-fade-in print:hidden">
      {start ? <div data-topbar-start="">{start}</div> : null}
      {/* Standard language switch: a globe and the language's own name. The
          "Language" label stays for screen readers only. */}
      <div className="sk-auth-lang">
        <Globe aria-hidden="true" />
        <LanguageSelect id={languageId} label={label} value={value} onChange={(next) => { if (next) onChange(next); }} />
      </div>
    </div>
  );
}
