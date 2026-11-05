/** SKAI-814: voice, document and camera intake each ask for consent before anything is captured or sent. */
export type IntakeKind = "voice" | "upload" | "camera";

export function needsIntakeConsent(granted: ReadonlySet<IntakeKind>, kind: IntakeKind): boolean {
  return !granted.has(kind);
}

export function grantIntakeConsent(granted: ReadonlySet<IntakeKind>, kind: IntakeKind): ReadonlySet<IntakeKind> {
  return new Set([...granted, kind]);
}
