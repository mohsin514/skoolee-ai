/**
 * Client-visible feature flags (env vars, off unless set to "1"). NEXT_PUBLIC_* values are inlined at build time,
 * so turning one on needs a rebuild / restart of the app.
 */
/** SKAI-1506: "Reverse posted payroll expense" on the accountant payroll screen. */
export const payrollReversalEnabled = () => process.env.NEXT_PUBLIC_FEATURE_PAYROLL_REVERSAL === "1";
/** SKAI-1669: "Accept" / "Return to library" on the handed library charges queue. */
export const libraryChargeActionsEnabled = () => process.env.NEXT_PUBLIC_FEATURE_LIBRARY_CHARGE_ACTIONS === "1";
