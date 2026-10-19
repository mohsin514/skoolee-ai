"use client";

import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { WaxSeal } from "./WaxSeal";

/**
 * The clothbound "prospectus cover" (lg+ only, inside AuthShell's cover
 * section): masthead, eyebrow chip, a 200/800 editorial headline with a
 * berry ink swash, optional art, a dot-leader index of provable claims, a
 * footnote and the embossed seal. Never a logo, a live region or a focusable.
 *
 * `headingKey` keys only the heading, so its arrival (.sk-enter) and the
 * berry swash (.sk-ink-draw) replay once when the line changes (the setup
 * cover changes it per step). `foot` takes the footnote's place (and wins
 * over it) inside `div.sk-cover-foot` — the setup ledger and its seal slot.
 */
export type AuthCoverProps = {
  eyebrow: string;
  heading: { light: string; strong: string; as?: "h1" | "h2" | "p" };   // default "h1"
  body?: string;
  index?: { label: string; items: { icon: LucideIcon; title: string; body?: string }[] };  // 2–4 items
  art?: ReactNode;         // CampusDiorama | InstitutionPreview | WaxSeal
  footnote?: string;
  headingKey?: string;     // keys ONLY the heading element
  foot?: ReactNode;        // rendered where `footnote` sits (wins over footnote), in div.sk-cover-foot
};

const delay = (ms: number) => ({ ["--sk-delay" as string]: `${ms}ms` }) as CSSProperties;

/** The cover masthead: foil seal · "Skoolee AI" folio · double hairline. Also the loading skeleton's cover head. */
export function CoverMasthead() {
  return (
    <div className="sk-cover-masthead sk-fade-in">
      <WaxSeal size={36} finish="foil" />
      <p className="sk-folio">Skoolee AI</p>
      <span aria-hidden="true" className="sk-cover-rule" />
    </div>
  );
}

export function AuthCover({ eyebrow, heading, body, index, art, footnote, headingKey, foot }: AuthCoverProps) {
  const Heading = heading.as ?? "h1";
  return (
    <>
      <CoverMasthead />

      <div className="max-w-[34rem]">
        <p className="sk-cover-chip sk-enter" style={delay(60)}>
          <span className="sk-eyebrow">{eyebrow}</span>
        </p>
        <Heading key={headingKey} className="sk-display sk-enter mt-6" style={delay(120)}>
          {heading.light}{" "}
          <strong className="relative inline-block">
            {heading.strong}
            <svg className="sk-ink-underline sk-ink-mirror" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <path className="sk-ink-draw" style={delay(520)} pathLength={1} strokeWidth="3.4" d="M4 11.6C48 6.4 112 4.6 196 6.4" />
              <path className="sk-ink-draw" style={delay(760)} pathLength={1} strokeWidth="2.1" opacity="0.7" d="M26 13.8C78 10.2 134 9.6 180 11.2" />
            </svg>
          </strong>
        </Heading>
        {body ? <p className="mt-5 text-md leading-relaxed text-brand-100">{body}</p> : null}
        {art ? <div className="mt-8">{art}</div> : null}
        {index && index.items.length > 0 ? (
          <ol aria-label={index.label} className="sk-cover-index sk-enter" style={delay(240)}>
            {index.items.map((item, i) => {
              const Icon = item.icon;
              return (
                <li key={item.title}>
                  <span aria-hidden="true" className="sk-cover-index-icon">
                    <Icon className="size-[1.125rem]" />
                  </span>
                  <div className="min-w-0 pt-1.5">
                    <p className="sk-cover-index-title">
                      <span className="text-md font-semibold leading-snug text-white">{item.title}</span>
                      <span aria-hidden="true" className="sk-leader" />
                      <span aria-hidden="true" className="sk-folio text-brand-200">{String(i + 1).padStart(2, "0")}</span>
                    </p>
                    {item.body ? <p className="mt-1 text-sm leading-relaxed text-brand-200">{item.body}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>

      {foot ? (
        <div className="sk-cover-foot">{foot}</div>
      ) : footnote ? <p className="max-w-[34rem] text-xs leading-relaxed text-brand-200">{footnote}</p> : <span aria-hidden="true" />}

      <WaxSeal finish="emboss" className="sk-cover-emboss" size={416} />
    </>
  );
}
