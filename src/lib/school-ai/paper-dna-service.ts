/**
 * SKO-500: Paper DNA for one saved paper, read in the author's scope. Deterministic only (no provider):
 * marks by section and type, coverage against the approved syllabus as taught (Teaching Line overlay),
 * a time estimate, difficulty mix and language checks. Returns no answer keys.
 */
import type { AuthUser } from "@/lib/auth";
import { SchoolAiError, loadWorkspacePermissionSnapshot } from "./access";
import { curriculumDataSchema, paperDataSchema } from "./assessment";
import { getWorkspaceRecordInTransaction } from "./repository";
import { schoolAiTransaction } from "./transaction";
import { overlayTeachingLine } from "./teaching-progress-service";
import { paperDna } from "./paper-dna";

export async function getPaperDna(user: AuthUser, paperId: string) {
  return schoolAiTransaction(user, async tx => {
    const permissions = await loadWorkspacePermissionSnapshot(user, tx);
    const record = await getWorkspaceRecordInTransaction(user, paperId, tx, permissions);
    if (record.kind !== "PAPER") throw new SchoolAiError("Choose a paper.", 400, "DNA_NOT_A_PAPER");
    const paper = paperDataSchema.parse(record.data);
    const source = await tx.schoolAiRecord.findFirst({ where: { id: paper.curriculumId, schoolId: user.schoolId, campusId: record.campusId, kind: "CURRICULUM" }, select: { id: true, data: true } });
    const curriculum = source ? await overlayTeachingLine(tx, user.schoolId, source.id, curriculumDataSchema.parse(source.data)) : null;
    return { paperId: record.id, version: record.version, dna: paperDna(paper, curriculum, null) };
  });
}
