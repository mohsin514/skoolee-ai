import { authEmailCopy } from "./email-copy";
/** English aliases retained for existing consumers; delivery uses the account's language. */
export const AUTH_EMAIL_SUBJECTS = { reset: authEmailCopy.en.reset.subject, verify: authEmailCopy.en.verify.subject } as const;
