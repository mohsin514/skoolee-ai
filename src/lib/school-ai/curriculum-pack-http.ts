import { schoolAiError } from "./http";

export const packHeaders = { "Cache-Control": "private, no-store" };

/** schoolAiError carries a blocked pack's reason list (`details`), so the screen can say exactly why. */
export const packError = (error: unknown) => schoolAiError(error);
