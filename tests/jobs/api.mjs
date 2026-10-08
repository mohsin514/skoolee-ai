import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
if (process.env.DATABASE_URL !== "postgresql://postgres@127.0.0.1:55423/sko223")
  throw new Error("Local synthetic database only");
const db = new PrismaClient(),
  base = "http://localhost:3223",
  f = JSON.parse(await readFile(`${tmpdir()}/sko223-job-fixture.json`, "utf8"));
const evidence = [];
async function request(
  path,
  method = "GET",
  body,
  cookie = f.cookies.PRINCIPAL,
) {
  return fetch(base + path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
for (const action of ["pdf", "send"]) {
  const r = await request("/api/reports", "POST", { examId: f.examId, action });
  assert.ok(r.ok, await r.clone().text());
  const d = await r.json();
  assert.ok(d.jobId);
  assert.equal((await request(`/api/jobs/${d.jobId}`)).status, 200);
  evidence.push({ action, status: r.status, persistedJob: true });
}
const form = new FormData();
form.set(
  "file",
  new File(
    ["transaction_date,amount,description\n2026-10-08,1500,API synthetic"],
    "api.csv",
    { type: "text/csv" },
  ),
);
for (const [key, value] of Object.entries({
  campusId: f.campusId,
  accountName: "API synthetic",
  currency: "PKR",
  statementFrom: "2026-10-01",
  statementTo: "2026-10-08",
}))
  form.set(key, value);
const imported = await fetch(base + "/api/fees/bank-import", {
  method: "POST",
  headers: { cookie: f.cookies.PRINCIPAL },
  body: form,
});
assert.equal(imported.status, 202);
const data = await imported.json();
assert.ok(data.jobId);
evidence.push({ action: "bank import", status: 202, persistedJob: true });
const otherCampus = await db.campus.create({
  data: {
    schoolId: f.schoolId,
    name: "Synthetic denied campus",
    city: "Synthetic",
    regId: randomUUID(),
  },
});
await db.user.update({
  where: { id: f.users.PRINCIPAL },
  data: { campusId: otherCampus.id },
});
assert.equal((await request(`/api/jobs/${f.jobId}`)).status, 404);
assert.equal(
  (
    await request(`/api/jobs/${f.jobId}`, "POST", {
      action: "retry",
      items: ["not-owned"],
    })
  ).status,
  404,
);
await db.user.update({
  where: { id: f.users.PRINCIPAL },
  data: { campusId: f.campusId },
});
evidence.push({ check: "cross-campus read/retry", status: 404 });
const schoolId = randomUUID(),
  campusId = randomUUID(),
  userId = randomUUID();
await db.school.create({
  data: {
    id: schoolId,
    name: "Synthetic other school",
    slug: schoolId,
    regId: schoolId,
    contactEmail: `${schoolId}@example.invalid`,
    city: "Synthetic",
    status: "ACTIVE",
    plan: "PRO",
  },
});
await db.campus.create({
  data: {
    id: campusId,
    schoolId,
    name: "Other synthetic campus",
    city: "Synthetic",
    regId: campusId,
  },
});
await db.user.create({
  data: {
    id: userId,
    schoolId,
    campusId,
    role: "PRINCIPAL",
    fullName: "Synthetic outsider",
    email: `${userId}@example.invalid`,
    mfaEnabled: true,
    onboardingComplete: true,
  },
});
const token = await new SignJWT({
  userId,
  schoolId,
  campusId,
  role: "PRINCIPAL",
  mfaVerified: true,
  onboardingComplete: true,
})
  .setProtectedHeader({ alg: "HS256" })
  .setJti(randomUUID())
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
await db.loginSession.create({
  data: {
    schoolId,
    userId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 3600000),
  },
});
const outsider = `skoolee_token=${token}`;
assert.equal(
  (await request(`/api/jobs/${f.jobId}`, "GET", undefined, outsider)).status,
  404,
);
assert.equal(
  (
    await request(
      `/api/jobs/${f.jobId}`,
      "POST",
      { action: "retry", items: ["not-owned"] },
      outsider,
    )
  ).status,
  404,
);
evidence.push({ check: "cross-tenant read/retry", status: 404 });
for (const role of ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"]) {
  assert.equal(
    (
      await request(
        `/api/jobs/${f.jobId}`,
        "POST",
        { action: "cancel", items: [] },
        f.cookies[role],
      )
    ).status,
    403,
  );
  evidence.push({ check: "read-only cancellation denial", role, status: 403 });
}
const unsupported = await fetch(base + "/api/whatsapp/webhook", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ entry: [] }),
});
assert.equal(unsupported.status, 401);
evidence.push({ check: "unsigned provider callbacks rejected", status: 401 });
await db.$disconnect();
await writeFile(
  "docs/qa/evidence/sko-223/api.json",
  JSON.stringify(evidence, null, 2),
);
console.log(`Verified ${evidence.length} actual API start and denial cases`);
