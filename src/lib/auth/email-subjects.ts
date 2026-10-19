/**
 * Subject lines of the two auth emails, quoted on the "check your inbox"
 * screens so people know what to search for. These MIRROR the literals in
 * src/lib/email.ts (sendVerificationEmail / sendPasswordResetEmail), which is
 * the source of truth; keep both in step.
 */
export const AUTH_EMAIL_SUBJECTS = { reset: "Reset your SkooleeAI Password", verify: "Verify your SkooleeAI Account" } as const;
