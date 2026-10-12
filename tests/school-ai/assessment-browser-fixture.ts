import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import type { AuthUser } from "../../src/lib/auth";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { assessmentFixture } from "./assessment-fixture";

const expected = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== expected || process.env.DIRECT_URL !== expected) throw new Error("Use only the isolated School AI browser-test database.");
const schoolId = "school-ai-browser-a", campusId = `${schoolId}-campus`;
const admin: AuthUser = { userId: `${schoolId}-ADMIN`, schoolId, campusId, role: "ADMIN", email: "a-admin@example.test" };
async function main() {
  const data = assessmentFixture(`${schoolId}-subject`, `${schoolId}-class`);
  let curriculum = await createWorkspaceRecord(admin, { kind: "CURRICULUM", campusId, title: "Browser QA approved curriculum", data: data.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(admin, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(admin, { kind: "PAPER", campusId, title: "Browser QA approved paper", data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(admin, paper.id, { version: paper.version, action: "approve" });
  const exam = await runWithTenantContext({ schoolId, campusId, userId: admin.userId, role: admin.role }, () => createSchoolAiExam(admin, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Browser QA mathematics exam", startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 2 * 3600000).toISOString(), studentIds: [`${schoolId}-student`], mode: "STANDARD" }));
  await mkdir("test-results/school-ai", { recursive: true });
  await writeFile("test-results/school-ai/exam-fixture.json", JSON.stringify({ examId: exam.id, paperId: paper.id, curriculumId: curriculum.id }), { mode: 0o600 });
  console.log("Synthetic approved curriculum, paper and exam assigned in isolated browser fixture.");
}
main().finally(() => prisma.$disconnect());
