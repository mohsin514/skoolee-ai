import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { SchoolAiError } from "./access";
import { examChainPolicy } from "./exam-authority";
import { resolveScopeDeliveryPolicy } from "./repository";

/**
 * SKAI-844 (AI-08): a school's approved Delivery Policy decides whether unreleased paper text may go to
 * the AI provider. The platform default is OPT_IN (allowed); a school that sets OFF keeps its draft
 * paper items on the server, and the teacher edits them by hand instead.
 */
export async function assertUnreleasedPaperTextAllowed(user: AuthUser, campusId: string | null, tx: TxClient) {
  const policy = examChainPolicy((await resolveScopeDeliveryPolicy(user, campusId, tx)).policy);
  if (policy.providerConfidentiality.unreleasedPaperText === "OFF") {
    throw new SchoolAiError("Your school keeps unreleased paper text away from the AI provider. Edit this item by hand, or ask the exam office to change the delivery policy.", 403, "PROVIDER_CONFIDENTIALITY_OFF");
  }
}
