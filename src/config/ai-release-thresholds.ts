/**
 * SKAI-841 (AI-05): the one place the AI release evaluation thresholds live.
 * `pnpm check:ai-release` and the production deploy read these; the D5 metric math re-exports them.
 * Values below are PROPOSED (docs/evaluation/D5-preregistration.md) and must be signed off by the
 * founder / academic lead before results are observed. Until `signedOff` is filled in, the gate
 * refuses every AI release. Any change after sign-off needs a new sign-off and a re-run of AI-05.
 */
export const AI_RELEASE_THRESHOLDS = {
  /** Launch languages that each need their own passing evaluation. */
  launchLanguages: ["en", "ur", "ar"] as const,
  /** Independently reviewed items per pack and language. */
  minItemsPerLanguage: 30,
  /** Share of items both reviewers judged curriculum-aligned. */
  minAlignment: 0.9,
  /** Critical wrong-key or harmful-feedback cases allowed. */
  maxCriticalErrors: 0,
  /** Share of AI proposed marks matching the moderated mark. */
  minMarkingAgreement: 0.85,
  /** Cohen's kappa between the two independent reviewers; below it the run is repeated. */
  minKappa: 0.6,
  /** Evidence older than this is stale and must be re-run. */
  maxEvidenceAgeDays: 180,
} as const;

/** Founder / academic sign-off of the values above. Never fill in on someone's behalf. */
export const AI_RELEASE_THRESHOLDS_SIGN_OFF: { signedOffBy: string; role: string; signedOffAt: string } | null = null;
