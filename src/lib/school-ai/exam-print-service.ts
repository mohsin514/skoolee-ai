/**
 * SKO-501: print and verify a sitting from its sealed snapshot, never from the editable record.
 *
 * A sitting stores the paper exactly as released (`paperSnapshot`) and its content hash. Printing
 * recomputes the hash of that snapshot and refuses on any mismatch, so an edited paper can never be
 * printed under an old seal, and the footer prefix always equals the sitting's stored prefix. Verify
 * reports the same comparison without rendering. Staff with view access to the exam only.
 */
import type { AuthUser } from "@/lib/auth";
import { SchoolAiError } from "./access";
import { scopedAssignment } from "./exam-service";
import { schoolAiTransaction } from "./transaction";
import { contentHashPrefix, verifyContentHash } from "./release";
import { buildCandidatePaperHtml } from "./paper-print";

async function sealedSitting(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper, student } = await scopedAssignment(user, assignmentId, tx);
    if (student) throw new SchoolAiError("Exam unavailable.", 404);
    if (!assignment.contentHash) throw new SchoolAiError("This sitting was released without a seal; print it from the approved paper instead.", 409, "PRINT_NO_SEAL");
    return { assignment, paper, verification: verifyContentHash(paper, assignment.contentHash) };
  });
}

export async function verifySitting(user: AuthUser, assignmentId: string) {
  const { assignment, verification } = await sealedSitting(user, assignmentId);
  return {
    assignmentId: assignment.id, paperId: assignment.paperId, paperVersion: assignment.paperVersion,
    matches: verification.matches,
    storedPrefix: verification.matches ? verification.prefix : verification.storedPrefix,
    recomputedPrefix: verification.matches ? verification.prefix : verification.recomputedPrefix,
  };
}

export async function printSitting(user: AuthUser, assignmentId: string): Promise<string> {
  const { assignment, paper, verification } = await sealedSitting(user, assignmentId);
  if (!verification.matches) throw new SchoolAiError("The sealed paper does not match its seal. It cannot be printed; report it to the exam office.", 409, "PRINT_SEAL_MISMATCH");
  return buildCandidatePaperHtml(paper, assignment.paperVersion, contentHashPrefix(verification.contentHash));
}
