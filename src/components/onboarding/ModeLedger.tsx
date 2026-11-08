"use client";

/**
 * The structure plate's split of the four module families between Skoolee
 * and the school's current systems: Exam Studio keeps classes and reviewed
 * assessments in Skoolee while admissions and fees stay where they are; full
 * operations brings all four in (one list, two-up); no answer yet shows one
 * dim list. Static, decorative (inside the aria-hidden cover). Never renders
 * a mode's label or the optional-work phrasing.
 */
export type ModeLedgerKey = "classes" | "assessments" | "admissions" | "fees";

export type ModeLedgerProps = {
  mode: "EXAM_STUDIO" | "FULL_OPERATIONS" | null;
  labels: { inSkoolee: string; stays: string; modules: string };
  items: { key: ModeLedgerKey; label: string }[];
};

const IN_EXAM_STUDIO: ModeLedgerKey[] = ["classes", "assessments"];

export function ModeLedger({ mode, labels, items }: ModeLedgerProps) {
  if (mode === null) {
    return (
      <div className="sk-mode-ledger" data-mode="none">
        <div data-side="none">
          <p className="sk-folio text-brand-200">{labels.modules}</p>
          <ul>{items.map((item) => <li key={item.key}>{item.label}</li>)}</ul>
        </div>
      </div>
    );
  }
  if (mode === "FULL_OPERATIONS") {
    // Everything runs in Skoolee: one list, laid out two-up.
    return (
      <div className="sk-mode-ledger" data-mode="full">
        <div data-side="in">
          <p className="sk-folio text-brand-200">{labels.inSkoolee}</p>
          <ul>{items.map((item) => <li key={item.key}>{item.label}</li>)}</ul>
        </div>
      </div>
    );
  }
  return (
    <div className="sk-mode-ledger" data-mode="exam">
      <div data-side="in">
        <p className="sk-folio text-brand-200">{labels.inSkoolee}</p>
        <ul>{items.filter((item) => IN_EXAM_STUDIO.includes(item.key)).map((item) => <li key={item.key}>{item.label}</li>)}</ul>
      </div>
      <div data-side="stays">
        <p className="sk-folio text-brand-200">{labels.stays}</p>
        <ul>{items.filter((item) => !IN_EXAM_STUDIO.includes(item.key)).map((item) => <li key={item.key}>{item.label}</li>)}</ul>
      </div>
    </div>
  );
}
