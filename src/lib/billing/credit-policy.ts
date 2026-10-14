/** UTC calendar month used by the once-per-month AI credit reset job. */
export function creditResetMonthKey(at: Date) {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Unused credits expire; reset usage to zero without carrying a balance. */
export function resetCreditUsage(_previouslyUsed: number) {
  return 0;
}
