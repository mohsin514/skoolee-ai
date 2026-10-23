import { Prisma } from "@prisma/client";
import type { AiWorkflowJob } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getWorkspaceRecordInTransaction } from "@/lib/school-ai/repository";
import { loadWorkspacePermissionSnapshot, resolveWorkspaceCampus } from "@/lib/school-ai/access";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { onboardingDataSchema } from "@/lib/school-ai/schemas";
import { WorkflowError } from "../errors";
import { sha256 } from "../executor/canonical";
import { normalizeText } from "../planner/normalize";
import { aiWorkflowsV2Enabled } from "../flag";
import { appendEvent } from "./events";
import { authorizeActor, inTenant } from "./actor";

/**
 * The campus setup questionnaire as an AI Workflows job (origin QUESTIONNAIRE). Each confirmed answer
 * becomes a segment of the user's own words, so every planned change must quote what they answered.
 * The job is bound to the questionnaire version: a changed questionnaire blocks the remaining steps.
 * Plan steps that change records wait for confirmation, so nothing applies until the user approves it.
 * Slice 3 replaces the 18 free-text keys with typed per-role sheets compiled without a model.
 */
export const questionnaireStartSchema = z.strictObject({ recordId: z.string().min(1).max(128), version: z.number().int().positive(), language: z.enum(["en", "ar", "ur"]) });

async function loadQuestionnaire(user: AuthUser, recordId: string) {
  return schoolAiTransaction(user, async tx => getWorkspaceRecordInTransaction(user, recordId, tx, await loadWorkspacePermissionSnapshot(user, tx)));
}

export function startQuestionnaireJob(user: AuthUser, raw: unknown): Promise<AiWorkflowJob> {
  return inTenant(user, async () => {
    await authorizeActor(user);
    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { slug: true } });
    if (!aiWorkflowsV2Enabled(school?.slug)) throw new WorkflowError("NOT_CONNECTED");
    const input = questionnaireStartSchema.parse(raw);
    if (!["ADMIN", "CAMPUS_ADMIN"].includes(user.role)) throw new WorkflowError("ROLE_NOT_ALLOWED");
    const campusId = await resolveWorkspaceCampus(user, user.campusId);
    const record = await loadQuestionnaire(user, input.recordId);
    if (record.kind !== "ONBOARDING" || record.status === "ARCHIVED" || record.campusId !== campusId || record.version !== input.version) throw new WorkflowError("STALE_VERSION");
    const data = onboardingDataSchema.parse(record.data);
    const answers = data.confirmedKeys.map(key => [key, data.answers[key]] as const).filter((pair): pair is readonly [typeof pair[0], string] => typeof pair[1] === "string" && pair[1].trim().length > 0);
    if (!answers.length) throw new WorkflowError("INVALID_INPUT");
    const idempotencyKey = `questionnaire-${record.id}-${record.version}`;
    const requestHash = sha256({ questionnaire: record.id, version: record.version, answers });
    const existing = await prisma.aiWorkflowJob.findUnique({ where: { schoolId_actorId_idempotencyKey: { schoolId: user.schoolId, actorId: user.userId, idempotencyKey } } });
    if (existing) return existing;
    try {
      return await prisma.$transaction(async tx => {
        const job = await tx.aiWorkflowJob.create({ data: {
          schoolId: user.schoolId, campusId, actorId: user.userId, actorRole: user.role, accessVersion: user.accessVersion ?? 0, origin: "QUESTIONNAIRE", planMode: "PLAN_REVIEW",
          setupResponseId: record.id, setupResponseVersion: record.version, language: input.language, requestHash, idempotencyKey,
          budget: { maxSteps: 25, maxModelCalls: 20, maxQuestions: 8, maxReplans: 2 }, expiresAt: new Date(Date.now() + 14 * 86_400_000),
        } });
        await tx.aiWorkflowSegment.create({ data: { schoolId: user.schoolId, jobId: job.id, ordinal: 0, kind: "REQUEST", text: "Set up this campus from my confirmed questionnaire answers.", normalized: "set up this campus from my confirmed questionnaire answers." } });
        for (const [index, [key, text]] of answers.entries()) await tx.aiWorkflowSegment.create({ data: { schoolId: user.schoolId, jobId: job.id, ordinal: index + 1, kind: "QUESTIONNAIRE_ANSWER", fieldKey: key, text, normalized: normalizeText(text) } });
        await appendEvent(tx, job, "JOB_STARTED");
        return tx.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } });
      });
    } catch (error) {
      // Two tabs or devices: the partial unique index lets only one live job per questionnaire.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const live = await prisma.aiWorkflowJob.findFirst({ where: { schoolId: user.schoolId, setupResponseId: record.id, setupResponseVersion: record.version } });
        if (live && live.actorId === user.userId) return live;
        throw new WorkflowError("LEASED");
      }
      throw error;
    }
  });
}

/** A questionnaire job runs only while its questionnaire is unchanged. */
export async function assertQuestionnaireCurrent(user: AuthUser, job: AiWorkflowJob) {
  if (job.origin !== "QUESTIONNAIRE" || !job.setupResponseId) return;
  const record = await loadQuestionnaire(user, job.setupResponseId).catch(() => null);
  if (!record || record.status === "ARCHIVED" || record.version !== job.setupResponseVersion) throw new WorkflowError("STALE_VERSION");
}
