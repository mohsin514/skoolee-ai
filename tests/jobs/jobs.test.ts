import { tmpdir } from "node:os";
import { hashSessionToken } from "../../src/lib/auth/session-cookie";
import { SignJWT } from "jose";
import { USER_ROLES } from "../../src/lib/roles";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { fork } from "node:child_process";
import { PrismaClient, type ParentCommunication } from "@prisma/client";
import { randomUUID, createHmac } from "node:crypto";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import {
  reviewQueue,
  approveVersions,
  reviewExam,
  publishExam,
  getPublishedVersion,
} from "../../src/lib/academic/report-versions";
import { resolveCurrentPrincipal } from "../../src/lib/auth/principal";
import {
  trackDeliveries,
  readJob,
  operateJob,
} from "../../src/lib/jobs/service";
import {
  startPdfJob,
  startImportJob,
  processingWorkflow,
} from "../../src/lib/jobs/processing";
import {
  recordMetaReceipts,
  verifiedMetaSignature,
} from "../../src/lib/jobs/receipts";
import { consume, appendEvent } from "../../src/lib/queue/outbox";
import { reportDeliveryWorkflow } from "../../src/lib/queue/report-delivery";
if (process.env.DATABASE_URL !== "postgresql://postgres@127.0.0.1:55423/sko223")
  throw new Error("Only isolated sko223:55423 is allowed");
const raw = new PrismaClient();
const schoolId = `jobs-${randomUUID()}`,
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
    await raw.user.update({ where: { id }, data: { mfaEnabled: true } });
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
          process.env.AUTH_SECRET || "synthetic-sko223-local-only",
        ),
      );
    await raw.loginSession.create({
      data: {
        schoolId,
        userId: id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 7200000),
      },
    });
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
      rollNo: "S223",
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
  if (false) await raw.school.delete({ where: { id: schoolId } });
  else
    writeFileSync(
      `${tmpdir()}/sko223-browser-fixture.json`,
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
test("100 recipients: 97 acceptances, missing contact, authorization expiry and provider outage; retry and receipts", async () =>
  scoped(async () => {
    const actor = (await resolveCurrentPrincipal({
      schoolId,
      userId: actorId,
    }))!;
    await raw.reportCard.update({
      where: { id: reportId },
      data: { remarksEn: "Approved synthetic original" },
    });
    const [v] = await reviewQueue([reportId]);
    await approveVersions(
      [{ reportCardId: reportId, versionId: v.id }],
      actorId,
    );
    await reviewExam(examId, actorId);
    await publishExam(examId, actorId);
    const original = await getPublishedVersion(reportId);
    oldVersionId = original.id;
    const communications: ParentCommunication[] = [];
    for (let n = 0; n < 100; n++) {
      const sid = n ? randomUUID() : studentId,
        rid = n ? randomUUID() : reportId,
        vid = n ? randomUUID() : v.id;
      if (n) {
        await raw.student.create({
          data: {
            id: sid,
            schoolId,
            campusId,
            classId,
            fullName: `Synthetic pupil ${n}`,
            rollNo: `J${n}`,
            gender: "MALE",
            guardianWhatsapp: `+1555000${String(n).padStart(4, "0")}`,
          },
        });
        await raw.reportCard.create({
          data: { id: rid, schoolId, campusId, examId, studentId: sid },
        });
        await raw.reportVersion.create({
          data: {
            id: vid,
            schoolId,
            reportCardId: rid,
            number: 1,
            contentHash: original.contentHash,
            documentIdentity: randomUUID(),
            snapshot: {
              ...(original.snapshot as Record<string, unknown>),
              reportCard: {
                ...(
                  original.snapshot as { reportCard: Record<string, unknown> }
                ).reportCard,
                id: rid,
                studentId: sid,
              },
            },
            blockers: [],
            changedSections: [],
            approvedAt: new Date(),
            publishedAt: new Date(),
            approvedBy: actorId,
            documentBytes: original.documentBytes,
          },
        });
        await raw.reportCard.update({
          where: { id: rid },
          data: { publishedVersionId: vid, currentVersionId: vid },
        });
      } else
        await raw.student.update({
          where: { id: sid },
          data: { guardianWhatsapp: "+15550000000" },
        });
      if (n === 97)
        await raw.student.update({
          where: { id: sid },
          data: { guardianWhatsapp: null, guardianPhone: null },
        });
      const c = await raw.parentCommunication.create({
        data: {
          schoolId,
          campusId,
          studentId: sid,
          channel: "WHATSAPP",
          recipient:
            n === 97 ? "UNAVAILABLE" : `+1555000${String(n).padStart(4, "0")}`,
          recipientName: `Synthetic family ${String(n).padStart(3, "0")}`,
          body: "Original approved content",
          relatedId: rid,
          relatedType: "REPORT_CARD",
          templateKey: "REPORT_CARD_PUBLISHED",
          metadata: { reportVersionId: vid },
          idempotencyKey: `report-version:${vid}:WHATSAPP`,
          status: n === 97 ? "NO_RECIPIENT" : "PENDING",
        },
      });
      communications.push(c);
      if (n !== 97)
        await raw.$transaction((tx) =>
          appendEvent(tx, {
            schoolId,
            actorId,
            referenceId: c.id,
            kind: "REPORT_DELIVERY",
            version: 1,
            identity: `report-delivery:${c.idempotencyKey}`,
          }),
        );
    }
    const exam = {
      id: examId,
      campusId,
      classId,
      title: "Synthetic 100-recipient batch",
    };
    const jobId = await trackDeliveries(actor, exam, communications);
    assert.equal(await trackDeliveries(actor, exam, communications), jobId);
    let sends = 0;
    for (let n = 0; n < 97; n++) {
      const e = await raw.workflowEvent.findFirstOrThrow({
        where: { referenceId: communications[n].id },
      });
      await consume(raw, { schoolId, eventId: e.id }, (ctx) =>
        reportDeliveryWorkflow(ctx, async () => {
          sends++;
          return {
            success: true,
            messageId: `receipt-${communications[n].id}`,
          };
        }),
      );
    }
    for (let n = 98; n < 100; n++) {
      const e = await raw.workflowEvent.findFirstOrThrow({
        where: { referenceId: communications[n].id },
      });
      if (n === 98)
        await raw.user.update({
          where: { id: actorId },
          data: { isActive: false },
        });
      await consume(raw, { schoolId, eventId: e.id }, (ctx) =>
        reportDeliveryWorkflow(ctx),
      );
      await raw.user.update({
        where: { id: actorId },
        data: { isActive: true },
      });
    }
    let job = await readJob(actor, jobId);
    assert.deepEqual(job.counts, {
      total: 100,
      queued: 0,
      running: 0,
      completed: 97,
      failed: 3,
      cancelled: 0,
    });
    assert.equal(job.items.filter((i) => i.accepted_at).length, 97);
    assert.equal(
      job.items.filter((i) => i.delivered_at || i.read_at).length,
      0,
    );
    await assert.rejects(
      operateJob(actor, jobId, "retry", [
        job.items.find((i) => i.state === "completed")!.id,
      ]),
      /confirmed failed/,
    );
    const failed = job.items.filter((i) => i.state === "failed");
    await assert.rejects(
      operateJob(actor, jobId, "retry", [failed[0].id]),
      /guardian contact/,
    );
    await raw.student.update({
      where: { id: communications[97].studentId! },
      data: { guardianWhatsapp: "+15550000097" },
    });
    await operateJob(
      actor,
      jobId,
      "retry",
      failed.map((i) => i.id),
    );
    job = await readJob(actor, jobId);
    assert.equal(job.counts.completed, 97);
    assert.equal(job.counts.queued, 3);
    for (const item of job.items.filter((i) => i.state === "queued"))
      await consume(raw, { schoolId, eventId: item.workflow_id! }, (ctx) =>
        reportDeliveryWorkflow(ctx, async (c) => {
          assert.equal(c.body, "Original approved content");
          sends++;
          return {
            success: true,
            messageId: `receipt-${item.communication_id}`,
          };
        }),
      );
    assert.equal(sends, 100);
    assert.equal((await readJob(actor, jobId)).counts.completed, 100);
    await operateJob(actor, jobId, "cancel", []);
    process.env.WHATSAPP_PHONE_NUMBER_ID = "synthetic-provider";
    const receipt = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "synthetic-provider" },
                statuses: [
                  {
                    id: `receipt-${communications[0].id}`,
                    status: "read",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                  },
                  {
                    id: `receipt-${communications[0].id}`,
                    status: "delivered",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(receipt),
      sig =
        "sha256=" +
        createHmac("sha256", "synthetic").update(body).digest("hex");
    assert.ok(verifiedMetaSignature(body, sig, "synthetic"));
    assert.equal(verifiedMetaSignature(body + " ", sig, "synthetic"), false);
    await recordMetaReceipts(receipt);
    await recordMetaReceipts(receipt);
    assert.equal(
      await raw.deliveryReceipt.count({
        where: { communicationId: communications[0].id },
      }),
      2,
    );
    job = await readJob(actor, jobId);
    assert.equal(job.counts.completed, 100);
    assert.ok(job.items[0].read_at);
    assert.ok(job.items[0].delivered_at);
    // Receipt evidence cannot become authorization to re-send.
    await assert.rejects(
      operateJob(actor, jobId, "retry", [job.items[0].id]),
      /confirmed failed/,
    );
    const foreign = { ...actor, schoolId: "other-tenant" };
    await assert.rejects(readJob(foreign, jobId), /not found/);
    await assert.rejects(
      readJob({ ...actor, campusId: "other-campus" }, jobId),
      /not found/,
    );
    const readonlyRole = await raw.rolePermission.create({
      data: {
        schoolId,
        role: "TEACHER",
        module: "reports",
        canView: true,
        canEdit: false,
      },
    });
    const teacher = (await resolveCurrentPrincipal({
      schoolId,
      userId: users.get("TEACHER")!,
    }))!;
    assert.equal((await readJob(teacher, jobId)).canEdit, false);
    await assert.rejects(operateJob(teacher, jobId, "cancel", []));
    await raw.rolePermission.delete({ where: { id: readonlyRole.id } });
    writeFileSync(
      `${tmpdir()}/sko223-job-fixture.json`,
      JSON.stringify({
        jobId,
        schoolId,
        campusId,
        examId,
        cookies: Object.fromEntries(cookies),
        users: Object.fromEntries(users),
      }),
    );
  }));
test("PDF processing resumes the same saved version after an expired worker lease; import committed once", async () =>
  scoped(async () => {
    const actor = (await resolveCurrentPrincipal({
      schoolId,
      userId: actorId,
    }))!;
    const jobId = await startPdfJob(actor, {
      id: examId,
      campusId,
      classId,
      title: "Synthetic PDF batch",
    });
    let job = await readJob(actor, jobId);
    const item = job.items[0];
    const child = fork(
      "tests/jobs/crash-child.ts",
      [JSON.stringify({ schoolId, eventId: item.workflow_id! })],
      {
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      },
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Worker checkpoint timeout")),
        20000,
      );
      child.once("message", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("error", reject);
    });
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
    await raw.workflowJob.update({
      where: { id: item.workflow_id! },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    await consume(
      raw,
      { schoolId, eventId: item.workflow_id! },
      processingWorkflow,
    );
    await consume(
      raw,
      { schoolId, eventId: item.workflow_id! },
      processingWorkflow,
    );
    job = await readJob(actor, jobId);
    assert.equal(job.counts.completed, 1);
    assert.equal(
      await raw.workflowEffect.count({ where: { jobId: item.workflow_id! } }),
      1,
    );
    await operateJob(actor, jobId, "cancel", []);
    job = await readJob(actor, jobId);
    assert.equal(job.counts.completed, 1);
    assert.equal(job.counts.cancelled, 99);
    const payload = {
      csv: "transaction_date,amount,description\n2026-10-08,1500,Synthetic payment",
      fileName: "synthetic.csv",
      accountName: "Synthetic account",
      statementFrom: "2026-10-01",
      statementTo: "2026-10-08",
      currency: "PKR",
      campusId,
    };
    const importId = await startImportJob(actor, campusId, payload);
    assert.equal(await startImportJob(actor, campusId, payload), importId);
    const imp = await readJob(actor, importId);
    await consume(
      raw,
      { schoolId, eventId: imp.items[0].workflow_id! },
      processingWorkflow,
    );
    await consume(
      raw,
      { schoolId, eventId: imp.items[0].workflow_id! },
      processingWorkflow,
    );
    const done = await readJob(actor, importId);
    assert.equal(done.counts.completed, 1);
    assert.equal(
      await raw.bankReconciliation.count({ where: { schoolId } }),
      1,
    );
    const invalidId = await startImportJob(actor, campusId, {
      ...payload,
      csv: "wrong,headers\na,b",
    });
    const bad = await readJob(actor, invalidId);
    await consume(
      raw,
      { schoolId, eventId: bad.items[0].workflow_id! },
      processingWorkflow,
    );
    assert.equal(
      (await readJob(actor, invalidId)).items[0].category,
      "invalid_file",
    );
  }));

test("in-flight cancellation preserves acceptance, uncertain outcomes cannot retry, and superseded snapshots cannot be substituted", async () =>
  scoped(async () => {
    const actor = (await resolveCurrentPrincipal({
      schoolId,
      userId: actorId,
    }))!;
    const version = await getPublishedVersion(reportId);
    const communication = await raw.parentCommunication.create({
      data: {
        schoolId,
        campusId,
        studentId,
        recipient: "synthetic@example.invalid",
        channel: "EMAIL",
        recipientName: "Synthetic in-flight family",
        body: "Frozen approved email",
        relatedId: reportId,
        templateKey: "REPORT_CARD_PUBLISHED",
        idempotencyKey: `report-version:${version.id}:EMAIL`,
        metadata: { reportVersionId: version.id },
      },
    });
    const eventId = await raw.$transaction((tx) =>
      appendEvent(tx, {
        schoolId,
        actorId,
        referenceId: communication.id,
        kind: "REPORT_DELIVERY",
        version: 1,
        identity: `report-delivery:${communication.idempotencyKey}`,
      }),
    );
    const jobId = await trackDeliveries(
      actor,
      { id: examId, campusId, classId, title: "Synthetic cancellation race" },
      [communication],
    );
    let started!: () => void, finish!: () => void;
    const inFlight = new Promise<void>((r) => (started = r)),
      release = new Promise<void>((r) => (finish = r));
    const running = consume(raw, { schoolId, eventId }, (ctx) =>
      reportDeliveryWorkflow(ctx, async () => {
        started();
        await release;
        return { success: true, messageId: "synthetic-email-accepted" };
      }),
    );
    await inFlight;
    await operateJob(actor, jobId, "cancel", []);
    finish();
    await running;
    const job = await readJob(actor, jobId);
    assert.equal(job.counts.completed, 1);
    assert.ok(job.cancel_requested_at);
    assert.ok(job.items[0].accepted_at);
    assert.equal(job.items[0].delivered_at, null);
    // A genuinely unknown provider outcome is not a confirmed failure eligible for retry.
    const unknown = await raw.parentCommunication.create({
      data: {
        schoolId,
        campusId,
        studentId,
        recipient: "synthetic@example.invalid",
        channel: "EMAIL",
        recipientName: "Synthetic unknown family",
        body: "Frozen approved email",
        relatedId: reportId,
        templateKey: "REPORT_CARD_PUBLISHED",
        idempotencyKey: `synthetic-unknown:${randomUUID()}`,
        metadata: { reportVersionId: version.id },
      },
    });
    const unknownEvent = await raw.$transaction((tx) =>
      appendEvent(tx, {
        schoolId,
        actorId,
        referenceId: unknown.id,
        kind: "REPORT_DELIVERY",
        version: 1,
        identity: `report-delivery:${unknown.idempotencyKey}`,
      }),
    );
    const unknownJob = await trackDeliveries(
      actor,
      { id: examId, campusId, classId, title: "Synthetic uncertain provider" },
      [unknown],
    );
    await consume(raw, { schoolId, eventId: unknownEvent }, (ctx) =>
      reportDeliveryWorkflow(ctx, async () => ({
        success: false,
        error: "Connection lost after provider request",
      })),
    );
    let failed = await readJob(actor, unknownJob);
    assert.equal(failed.items[0].uncertain, true);
    assert.equal(failed.items[0].canRetry, false);
    await assert.rejects(
      operateJob(actor, unknownJob, "retry", [failed.items[0].id]),
      /uncertain provider/,
    );
    // Definitive local preflight failure has no uncertain effect, but cannot switch versions.
    await raw.workflowEffect.deleteMany({ where: { jobId: unknownEvent } });
    const newer = await raw.reportVersion.create({
      data: {
        schoolId,
        reportCardId: reportId,
        number: 2,
        contentHash: "synthetic-new-version",
        documentBytes: version.documentBytes,
        approvedBy: actorId,
        documentIdentity: randomUUID(),
        snapshot: version.snapshot!,
        blockers: [],
        changedSections: [],
        approvedAt: new Date(),
        publishedAt: new Date(),
      },
    });
    await raw.reportCard.update({
      where: { id: reportId },
      data: { publishedVersionId: newer.id },
    });
    failed = await readJob(actor, unknownJob);
    await assert.rejects(
      operateJob(actor, unknownJob, "retry", [failed.items[0].id]),
      /superseded/,
    );
    assert.equal(
      (
        await raw.parentCommunication.findUniqueOrThrow({
          where: { id: unknown.id },
        })
      ).body,
      "Frozen approved email",
    );
  }));
