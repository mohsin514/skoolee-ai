/**
 * SKAI-85: one password policy for the reset form and the reset server action, so a
 * direct server-action call cannot set a password the form would have refused.
 */
export const RESET_PASSWORD_MAX = 72; // bcrypt ignores bytes past 72
export const RESET_PASSWORD_UNMET = "Please satisfy all security requirements.";

/** [length, uppercase, digit, symbol, confirmation matches] — order matches the checklist copy. */
export function passwordRules(password: string, confirm: string) {
  return [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
    password === confirm && password !== "",
  ];
}

/** Server-side check; returns the client-localizable message, or null when the password is acceptable. */
export function resetPasswordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8 || password.length > RESET_PASSWORD_MAX) return "Use a password between 8 and 72 characters";
  return passwordRules(password, password).every(Boolean) ? null : RESET_PASSWORD_UNMET;
}
