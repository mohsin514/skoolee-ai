import { hashSessionToken } from "../../src/lib/auth/session-cookie";
import { defaultLocale } from "../../src/lib/locale/package";
import { consume } from "../../src/lib/queue/outbox";
import { reportDeliveryWorkflow } from "../../src/lib/queue/report-delivery";
import { SignJWT } from "jose";
import { USER_ROLES } from "../../src/lib/roles";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import {
  reviewQueue,
  approveVersions,
  reviewExam,
  publishExam,
  getPublishedVersion,
  familyVersion,
} from "../../src/lib/academic/report-versions";
import { sendReportCardPublishedNotifications } from "../../src/lib/notifications/service";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "55410" ||
  url.pathname !== "/sko210"
)
  throw new Error("Use isolated local sko210 database on 55410");
const raw = new PrismaClient();
const schoolId = `versions-${randomUUID()}`,
  campusId = randomUUID(),
  classId = randomUUID(),
  studentId = randomUUID(),
  examId = randomUUID(),
  reportId = randomUUID(),
  subjectId = randomUUID(),
  actorId = randomUUID();
let oldVersionId = "";
const cookies = new Map<string, string>();
const users = new Map<string, string>();
const context = { schoolId, campusId, role: "PRINCIPAL", userId: actorId };
const scoped = <T>(fn: () => Promise<T>) => runWithTenantContext(context, fn);
before(async () => {
  await raw.school.create({
    data: {
      id: schoolId,
      name: "Synthetic reports school",
      slug: schoolId,
      regId: schoolId,
      contactEmail: `${schoolId}@example.invalid`,
      city: "Synthetic",
      status: "ACTIVE",
      plan: "PRO",
    },
  });
  await raw.campus.create({
    data: {
      id: campusId,
      schoolId,
      name: "Synthetic campus",
      city: "Synthetic",
      regId: campusId,
    },
  });
  await raw.user.create({
    data: {
      id: actorId,
      schoolId,
      campusId,
      role: "PRINCIPAL",
      fullName: "Synthetic reviewer",
      email: `${actorId}@example.invalid`,
      onboardingComplete: true,
    },
  });
  for (const role of USER_ROLES) {
    const id = role === "PRINCIPAL" ? actorId : randomUUID();
    users.set(role, id);
    if (role !== "PRINCIPAL")
      await raw.user.create({
        data: {
          id,
          schoolId,
          campusId,
          role,
          fullName: `Synthetic ${role}`,
          email: `${id}@example.invalid`,
          onboardingComplete: true,
        },
      });
    await raw.user.update({where:{id},data:{mfaEnabled:true}});
    const token = await new SignJWT({
      mfaVerified: true,
      userId: id,
      schoolId,
      campusId,
      role,
      email: `${id}@example.invalid`,
      fullName: `Synthetic ${role}`,
      onboardingComplete: true,
    })
      .setJti(randomUUID())
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(
        new TextEncoder().encode(
          process.env.AUTH_SECRET || "synthetic-sko210-local-validation-only",
        ),
      );
    await raw.loginSession.create({data:{schoolId,userId:id,tokenHash:hashSessionToken(token),expiresAt:new Date(Date.now()+7200000)}});
    cookies.set(role, `skoolee_token=${token}`);
  }
  await raw.class.create({
    data: {
      id: classId,
      schoolId,
      campusId,
      name: "Synthetic class",
      academicYear: 2026,
      classTeacherId: users.get("TEACHER"),
    },
  });
  await raw.student.create({
    data: {
      id: studentId,
      schoolId,
      campusId,
      classId,
      fullName: "Synthetic pupil",
      rollNo: "S210",
      gender: "MALE",
      guardianEmail: "synthetic@example.invalid",
      parentUserId: users.get("PARENT"),
      studentUserId: users.get("STUDENT"),
    },
  });
  await raw.subject.create({
    data: {
      id: subjectId,
      schoolId,
      campusId,
      classId,
      name: "Math",
      totalMarks: 100,
    },
  });
  await raw.exam.create({
    data: {
      id: examId,
      schoolId,
      campusId,
      classId,
      title: "Synthetic exam",
      term: "Term 1",
      academicYear: 2026,
      status: "LOCKED",
      isLocked: true,
    },
  });
  await raw.mark.create({
    data: {
      schoolId,
      campusId,
      examId,
      studentId,
      subjectId,
      marksObtained: 80,
    },
  });
  await raw.reportCard.create({
    data: { id: reportId, schoolId, campusId, examId, studentId },
  });
});
after(async () => {
  if (!process.env.SKO210_KEEP)
    await raw.school.delete({ where: { id: schoolId } });
  else
    writeFileSync(
      "/private/tmp/sko210-browser-fixture.json",
      JSON.stringify({
        schoolId,
        campusId,
        classId,
        studentId,
        examId,
        reportId,
        oldVersionId,
        cookies: Object.fromEntries(cookies),
      }),
    );
  await raw.$disconnect();
  await prisma.$disconnect();
});
test("blocked approval, stale review, immutable release, correction and idempotent delivery", async () =>
  scoped(async () => {
    let [v] = await reviewQueue([reportId]);
    assert.match(String(v.blockers), /remarks/);
    await assert.rejects(
      approveVersions([{ reportCardId: reportId, versionId: v.id }], actorId),
      /remarks/,
    );
    await assert.rejects(publishExam(examId, actorId), /review/i);
    await assert.rejects(
      sendReportCardPublishedNotifications({
        reportCardId: reportId,
        createdById: actorId,
      }),
      /published version/,
    );
    await raw.reportCard.update({
      where: { id: reportId },
      data: { remarksEn: "Original remark" },
    });
    [v] = await reviewQueue([reportId]);
    await raw.reportCard.update({
      where: { id: reportId },
      data: { remarksEn: "Concurrent change" },
    });
    await assert.rejects(
      approveVersions([{ reportCardId: reportId, versionId: v.id }], actorId),
      /changed during review/,
    );
    [v] = await reviewQueue([reportId]);
    await approveVersions(
      [{ reportCardId: reportId, versionId: v.id }],
      actorId,
      "PRIVATE REVIEWER NOTE",
    );
    await reviewExam(examId, actorId);
    await publishExam(examId, actorId);
    const original = await getPublishedVersion(reportId);
    oldVersionId = original.id;
    assert.equal(familyVersion(original).remarksEn, "Concurrent change");
    assert.equal(
      JSON.stringify(familyVersion(original)).includes("PRIVATE REVIEWER NOTE"),
      false,
    );
    const communications = await sendReportCardPublishedNotifications({
      reportCardId: reportId,
      createdById: actorId,
      channels: ["EMAIL"],
    });
    const again = await sendReportCardPublishedNotifications({
      reportCardId: reportId,
      createdById: actorId,
      channels: ["EMAIL"],
    });
    assert.equal(communications[0].id, again[0].id);
    assert.equal(communications[0].status, "PENDING");
    assert.equal(
      await raw.parentCommunication.count({ where: { relatedId: reportId } }),
      1,
    );
    assert.equal(
      await raw.workflowEvent.count({
        where: { referenceId: communications[0].id },
      }),
      1,
    );
    await raw.mark.updateMany({
      where: { examId },
      data: { marksObtained: 90 },
    });
    assert.equal(
      (await raw.reportCard.findUniqueOrThrow({ where: { id: reportId } }))
        .remarksApproved,
      false,
    );
    assert.equal(
      familyVersion(await getPublishedVersion(reportId)).percentage,
      80,
    );
    [v] = await reviewQueue([reportId]);
    assert.notEqual(v.id, original.id);
    assert.equal(v.approvedAt, null);
    assert.equal((v.snapshot as any).reportCard.percentage, 90);
    await assert.rejects(
      publishExam(examId, actorId, "Correction"),
      /approval/,
    );
    await assert.rejects(
      approveVersions([{ reportCardId: reportId, versionId: v.id }], actorId),
      /correction reason/,
    );
    await approveVersions(
      [{ reportCardId: reportId, versionId: v.id }],
      actorId,
      undefined,
      "Updated result after checking the marked paper.",
    );
    await assert.rejects(
      publishExam(examId, actorId, "Unreviewed reason"),
      /changed after approval/,
    );
    await publishExam(
      examId,
      actorId,
      "Updated result after checking the marked paper.",
    );
    const corrected = await getPublishedVersion(reportId, original.id);
    assert.equal(corrected.superseded, true);
    assert.equal(corrected.predecessorId, original.id);
    assert.equal(familyVersion(corrected).percentage, 90);
    assert.deepEqual(
      (
        await raw.reportVersion.findUniqueOrThrow({
          where: { id: original.id },
        })
      ).snapshot,
      original.snapshot,
    );
    await assert.rejects(
      raw.reportVersion.update({
        where: { id: original.id },
        data: { snapshot: { tampered: true } },
      }),
      /immutable/,
    );
    const newDelivery = await sendReportCardPublishedNotifications({
      reportCardId: reportId,
      createdById: actorId,
      channels: ["EMAIL"],
    });
    assert.notEqual(newDelivery[0].id, communications[0].id);
  }));
test("tenant guard excludes version history", async () => {
  await runWithTenantContext({ schoolId: "other-synthetic-tenant" }, async () =>
    assert.equal(
      await prisma.reportVersion.count({ where: { reportCardId: reportId } }),
      0,
    ),
  );
});

test("real simultaneous approval versus remark edit never approves the edited content", async () =>
  scoped(async () => {
    await raw.reportCard.update({
      where: { id: reportId },
      data: { remarksEn: "Before simultaneous edit" },
    });
    const [v] = await reviewQueue([reportId]);
    const [approval] = await Promise.allSettled([
      approveVersions(
        [{ reportCardId: reportId, versionId: v.id }],
        actorId,
        undefined,
        "Concurrent review correction",
      ),
      raw.reportCard.update({
        where: { id: reportId },
        data: { remarksEn: "After simultaneous edit" },
      }),
    ]);
    const [pending] = await reviewQueue([reportId]);
    assert.notEqual(pending.id, v.id);
    assert.equal(pending.approvedAt, null);
    if (approval.status === "fulfilled")
      assert.equal(
        (approval.value[0].snapshot as any).reportCard.remarksEn,
        "Before simultaneous edit",
      );
  }));

async function http(
  role: string,
  path: string,
  method = "GET",
  data?: unknown,
) {
  return fetch(`http://127.0.0.1:3210${path}`, {
    method,
    headers: { cookie: cookies.get(role)!, "content-type": "application/json" },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}
for (const role of USER_ROLES)
  test(`HTTP role ${role}: publication controls and child ownership`, async () => {
    const reviewer = [
      "SUPER_ADMIN",
      "ADMIN",
      "CAMPUS_ADMIN",
      "PRINCIPAL",
    ].includes(role);
    const response = await http(role, "/api/reports", "POST", {
      examId,
      action: "publish",
    });
    assert.equal(
      response.status,
      reviewer ? 409 : 403,
      await response.clone().text(),
    );
    const read = await http(role, `/api/reports?examId=${examId}`);
    if (["PARENT", "STUDENT"].includes(role)) assert.equal(read.status, 403);
    else assert.equal(read.status, 200, await read.clone().text());
  });
test("HTTP old family PDF resolves corrected version, notes stay private, unlink revokes old link", async () => {
  const path = `/api/reports/download?reportCardId=${reportId}&versionId=${oldVersionId}&redirect=1`;
  for (const role of ["PARENT", "STUDENT"]) {
    const response = await http(role, path);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("x-report-superseded"), "true");
    assert.ok((await response.arrayBuffer()).byteLength > 1000);
  }
  const data = await http("PARENT", `/api/parent/data?studentId=${studentId}`);
  assert.equal(data.status, 200, await data.clone().text());
  assert.equal((await data.text()).includes("PRIVATE REVIEWER NOTE"), false);
  await raw.student.update({
    where: { id: studentId },
    data: { parentUserId: null },
  });
  assert.equal((await http("PARENT", path)).status, 403);
  await raw.student.update({
    where: { id: studentId },
    data: { parentUserId: users.get("PARENT") },
  });
});
test("HTTP single-send approval override cannot release an unapproved report", async () => {
  const unpublished = await raw.exam.create({
    data: {
      schoolId,
      campusId,
      classId,
      title: "Synthetic unapproved",
      term: "Term 2",
      academicYear: 2026,
      status: "PUBLISHED",
      isLocked: true,
      publishedAt: new Date(),
    },
  });
  const card = await raw.reportCard.create({
    data: {
      schoolId,
      campusId,
      examId: unpublished.id,
      studentId,
      status: "PUBLISHED",
      remarksApproved: false,
    },
  });
  const r = await http("PRINCIPAL", `/api/reports/${card.id}/send`, "POST", {
    approvedData: true,
  });
  assert.equal(r.status, 409, await r.clone().text());
  assert.equal(
    await raw.parentCommunication.count({ where: { relatedId: card.id } }),
    0,
  );
});
test("HTTP teachers edit assigned drafts but cannot approve; other campus denied", async () => {
  const r = await http("TEACHER", `/api/reports/${reportId}/remarks`, "PATCH", {
    remarksEn: "Teacher corrected draft",
  });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(
    (
      await http("TEACHER", `/api/reports/${reportId}`, "PATCH", {
        approve: true,
        versionId: oldVersionId,
      })
    ).status,
    403,
  );
  const other = await raw.campus.create({
    data: {
      schoolId,
      name: "Other synthetic campus",
      city: "Synthetic",
      regId: randomUUID(),
    },
  });
  await raw.user.update({
    where: { id: users.get("TEACHER")! },
    data: { campusId: other.id },
  });
  assert.equal(
    (
      await http("TEACHER", `/api/reports/${reportId}/remarks`, "PATCH", {
        remarksEn: "Forbidden",
      })
    ).status,
    403,
  );
  await raw.user.update({
    where: { id: users.get("TEACHER")! },
    data: { campusId },
  });
});

test("durable delivery rejects superseded version and never repeats provider effect", async () => {
  const events = await raw.workflowEvent.findMany({
    where: { schoolId, kind: "REPORT_DELIVERY" },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(events.length, 2);
  let sends = 0;
  const handle = (ctx: Parameters<typeof reportDeliveryWorkflow>[0]) =>
    reportDeliveryWorkflow(ctx, async () => {
      sends++;
      return { success: true, messageId: "synthetic-provider" };
    });
  for (const e of events) {
    await consume(raw, { eventId: e.id, schoolId }, handle);
    await consume(raw, { eventId: e.id, schoolId }, handle);
  }
  assert.equal(sends, 1);
  const first = await raw.workflowJob.findUniqueOrThrow({
    where: { id: events[0].id },
  });
  assert.equal(first.state, "failed");
  assert.equal(first.reason, "AUTHORIZATION_OR_PUBLICATION_REVOKED");
  assert.equal(
    (await raw.workflowJob.findUniqueOrThrow({ where: { id: events[1].id } }))
      .state,
    "completed",
  );
});

test("approved en/ar/ur PDF bytes are stable across repeated rendering and language changes", async () =>
  scoped(async () => {
    const { renderReportCardPdfBuffer } =
      await import("../../src/lib/academic/pdf");
    for (let pass = 0; pass < 2; pass++)
      for (const language of ["en", "ar", "ur"] as const) {
        await raw.reportCard.update({
          where: { id: reportId },
          data: {
            reportLanguage: language,
            localeSnapshot: { ...defaultLocale, language: "en", timezone: "Asia/Riyadh", numberingSystem: "arab", currency: "SAR" },
            remarksEn: `English approved remark ${pass}`,
            remarksAr: `تقدم جيد في التعلم ${pass}`,
            remarksUr: `تعلیم میں اچھی پیشرفت ${pass}`,
          },
        });
        const [version] = await reviewQueue([reportId]);
        const [approved] = await approveVersions(
          [{ reportCardId: reportId, versionId: version.id }],
          actorId,
          undefined,
          language === "ar"
            ? "تصحيح التقرير بعد المراجعة"
            : language === "ur"
              ? "جائزے کے بعد رپورٹ کی تصحیح"
              : "Report corrected after review.",
        );
        assert.ok(
          approved.documentBytes && approved.documentBytes.length > 1000,
        );
        const first = await renderReportCardPdfBuffer(reportId, version.id);
        const second = await renderReportCardPdfBuffer(reportId, version.id);
        assert.deepEqual(first.buffer, second.buffer);
        assert.equal(first.buffer.subarray(0, 4).toString(), "%PDF");
        const snapshot = approved.snapshot as any;
        assert.equal(snapshot.locale.language, language);
        assert.equal(snapshot.locale.timezone, "Asia/Riyadh");
        assert.equal(snapshot.locale.numberingSystem, "arab");
        assert.equal(snapshot.locale.currency, "SAR");
        if (process.env.SKO210_KEEP)
          writeFileSync(`/private/tmp/sko210-${language}.pdf`, first.buffer);
      }
  }));

test("concurrent sends create one logical delivery and uncertain provider outcome never auto-resends", async () =>
  scoped(async () => {
    await raw.reportCard.update({
      where: { id: reportId },
      data: { reportLanguage: "en", remarksEn: "Approved retry test" },
    });
    const [version] = await reviewQueue([reportId]);
    await approveVersions(
      [{ reportCardId: reportId, versionId: version.id }],
      actorId,
      undefined,
      "Updated approved wording.",
    );
    await publishExam(examId, actorId, "Updated approved wording.");
    await Promise.allSettled(
      [1, 2].map(() =>
        sendReportCardPublishedNotifications({
          reportCardId: reportId,
          createdById: actorId,
          channels: ["EMAIL"],
        }),
      ),
    );
    const communication = await raw.parentCommunication.findUniqueOrThrow({
      where: { idempotencyKey: `report-version:${version.id}:EMAIL` },
    });
    const events = await raw.workflowEvent.findMany({
      where: { schoolId, referenceId: communication.id },
    });
    assert.equal(events.length, 1);
    let sends = 0;
    const handler = (ctx: Parameters<typeof reportDeliveryWorkflow>[0]) =>
      reportDeliveryWorkflow(ctx, async () => {
        sends++;
        throw new Error("Synthetic crash after provider accepted the request");
      });
    await consume(raw, { eventId: events[0].id, schoolId }, handler);
    await consume(raw, { eventId: events[0].id, schoolId }, handler);
    assert.equal(sends, 1);
    const job = await raw.workflowJob.findUniqueOrThrow({
      where: { id: events[0].id },
    });
    assert.equal(job.state, "failed");
    assert.equal(job.reason, "EXTERNAL_OUTCOME_UNCERTAIN");
    const retry = await sendReportCardPublishedNotifications({
      reportCardId: reportId,
      createdById: actorId,
      channels: ["EMAIL"],
    });
    assert.equal(retry[0].id, communication.id);
  }));
