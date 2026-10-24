import { randomUUID, createHash } from "node:crypto";
import { SignJWT } from "jose";
import { prisma } from "@/lib/db/prisma";
import { JWT_SECRET } from "@/lib/auth/secret";
import { runUnscoped } from "@/lib/db/tenant-context";
import { expireSupportGrants } from "@/lib/owner/support-expiry";

const base = process.env.SKO_215_TEST_BASE_URL || "http://127.0.0.1:3015";
const localDb = new URL(process.env.DATABASE_URL || "");
const localApp = new URL(base);
if (localDb.hostname !== "127.0.0.1" || localDb.port !== "55415" || localDb.pathname !== "/skoolee215") throw new Error("SKO-215 acceptance checks require synthetic database skoolee215 on 127.0.0.1:55415");
if (!(["127.0.0.1", "localhost"].includes(localApp.hostname) && localApp.port === "3015")) throw new Error("SKO-215 acceptance checks require the local app on port 3015");
const fixtureSchoolIds: string[] = [];

function ok(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

async function seedSchool(name: string) {
  const id = randomUUID();
  fixtureSchoolIds.push(id);
  return prisma.school.create({ data: { id, name, slug: id, status: "ACTIVE", plan: "PRO", city: "Synthetic", regId: `TEST-${id}`, contactEmail: `${id}@example.test` } });
}

async function seedActor(schoolId: string, role: "APP_OWNER" | "SUPER_ADMIN" | "CAMPUS_ADMIN", email: string, mfaEnabled = true) {
  const user = await prisma.user.create({ data: { schoolId, email, username: email, fullName: `Synthetic ${role}`, role, mfaEnabled, isActive: true } });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  const token = await new SignJWT({ userId: user.id, accessVersion: user.accessVersion, email: user.email, fullName: user.fullName, role: user.role, schoolId, campusId: null, schoolSlug: school.slug, schoolStatus: school.status, onboardingComplete: true, mfaVerified: true })
    .setJti(randomUUID()).setIssuedAt().setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(JWT_SECRET);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.loginSession.create({ data: { schoolId, userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 2 * 60 * 60_000) } });
  return { user, cookie: `skoolee_token=${token}` };
}

async function request(path: string, cookie: string, method = "GET", body?: unknown) {
  const response = await fetch(`${base}${path}`, { method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = response.headers.get("content-type")?.includes("application/json")
    ? await response.json().catch(() => ({}))
    : { text: await response.text().catch(() => "") };
  return { response, json };
}

async function main() {
  const schoolA = await seedSchool("Synthetic Cedar Support");
  const schoolB = await seedSchool("Synthetic Maple Support");
  const owner = await seedActor(schoolA.id, "APP_OWNER", "owner@example.test");
  const adminA = await seedActor(schoolA.id, "SUPER_ADMIN", "admin-a@example.test");
  const adminB = await seedActor(schoolB.id, "SUPER_ADMIN", "admin-b@example.test");
  const campus = await seedActor(schoolA.id, "CAMPUS_ADMIN", "campus@example.test");
  const noMfaOwner = await seedActor(schoolA.id, "APP_OWNER", "no-mfa@example.test", false);

  const noMfa = await request("/api/owner/support/grants", noMfaOwner.cookie);
  ok(noMfa.response.status === 401, "APP_OWNER without enrolled privileged MFA cannot enter support management");

  const deniedScope = await request("/api/owner/support/grants", owner.cookie, "POST", { schoolId: schoolA.id, purpose: "Investigate timetable sync issue", impact: "Staff cannot view updated timetables", scope: ["safeguarding"], actions: ["read"], durationMinutes: 30 });
  ok(deniedScope.response.status === 403, "safeguarding domain stays excluded");
  const deniedExport = await request("/api/owner/support/grants", owner.cookie, "POST", { schoolId: schoolA.id, purpose: "Investigate timetable sync issue", impact: "Staff cannot view updated timetables", scope: ["users"], actions: ["read", "export"], durationMinutes: 30 });
  ok(deniedExport.response.status === 403, "staff and learning exports cannot be approved");

  const readOnlyDefault = await request("/api/owner/support/grants", owner.cookie, "POST", { schoolId: schoolA.id, purpose: "Investigate timetable sync issue", impact: "Staff cannot view updated timetables", scope: ["school_profile"], durationMinutes: 30 });
  ok(readOnlyDefault.response.status === 201 && readOnlyDefault.json.data.grant.actions.join(",") === "read", "new support requests default to read-only");
  const defaultGrantId = readOnlyDefault.json.data.grant.id as string;
  await request("/api/super/support-grants", adminA.cookie, "PATCH", { grantId: defaultGrantId, decision: "reject" });
  const requestA = await request("/api/owner/support/grants", owner.cookie, "POST", { schoolId: schoolA.id, purpose: "Investigate timetable sync issue", impact: "Staff cannot view updated timetables", scope: ["school_profile"], actions: ["read", "write", "export"], durationMinutes: 30 });
  ok(requestA.response.status === 201 && requestA.json.data.grant.status === "pending", "support incident and scoped grant are created pending school review");
  const grantId = requestA.json.data.grant.id as string;
  const requestNotice = await prisma.notification.findFirst({ where: { schoolId: schoolA.id, userId: adminA.user.id, type: "support_access_request" } });
  ok(Boolean(requestNotice), "school approver receives an in-app support request notice");
  const tooBroad = await request("/api/super/support-grants", adminB.cookie, "PATCH", { grantId, decision: "approve" });
  ok(tooBroad.response.status === 404, "a different school administrator cannot approve this tenant's grant");
  const campusApproval = await request("/api/super/support-grants", campus.cookie, "PATCH", { grantId, decision: "approve" });
  ok(campusApproval.response.status === 403, "campus staff cannot approve school-wide support access");
  const beforeApproval = await request(`/api/owner/support/grants/${grantId}/start`, owner.cookie, "POST", {});
  ok(beforeApproval.response.status === 403, "unapproved grant cannot start");
  const approval = await request("/api/super/support-grants", adminA.cookie, "PATCH", { grantId, decision: "approve" });
  ok(approval.response.ok && approval.json.data.approvedById === adminA.user.id, "school SUPER_ADMIN approval records the real approver");
  const started = await request(`/api/owner/support/grants/${grantId}/start`, owner.cookie, "POST", {});
  const supportCookie = started.response.headers.get("set-cookie")?.split(";")[0];
  ok(started.response.ok && Boolean(supportCookie), "MFA-authenticated APP_OWNER starts a bounded grant");
  const supportActorCookie = `${owner.cookie}; ${supportCookie}`;
  const workspace = await request("/api/owner/support/workspace?domain=school_profile", supportActorCookie);
  ok(workspace.response.ok && workspace.json.data.id === schoolA.id, "grant scope reads only its named school's approved workspace");
  const outOfScope = await request("/api/owner/support/workspace?domain=users", supportActorCookie);
  ok(outOfScope.response.status === 403, "unapproved domain is denied during the live session");
  const tenantSwap = await request(`/api/owner/support/workspace?grantId=${schoolB.id}&domain=school_profile`, supportActorCookie);
  ok(tenantSwap.response.status === 403, "support cookie cannot be used to switch tenants");
  const broadOwnerTool = await request("/api/owner/stats", supportActorCookie);
  ok(broadOwnerTool.response.status === 403, "general owner APIs are closed while scoped support access is active");
  const queuedExport = await request("/api/owner/support/actions", supportActorCookie, "POST", { domain: "school_profile", action: "export" });
  ok(queuedExport.response.status === 202 && queuedExport.json.data.status === "queued", "explicitly approved export enters the auditable action queue");
  const queuedWrite = await request("/api/owner/support/actions", supportActorCookie, "POST", { domain: "school_profile", action: "write", payload: { field: "website", value: "https://synthetic.example.test" } });
  ok(queuedWrite.response.status === 202, "explicitly approved school profile change enters the queue");
  const appliedWrite = await request(`/api/owner/support/actions/${queuedWrite.json.data.id}/execute`, supportActorCookie, "POST", {});
  ok(appliedWrite.response.ok && (await prisma.school.findUnique({ where: { id: schoolA.id } }))?.website === "https://synthetic.example.test", "approved scoped write changes only the permitted school field");
  const exportCompleted = await request(`/api/owner/support/actions/${queuedExport.json.data.id}/execute`, supportActorCookie, "POST", {});
  const csv = exportCompleted.json.text;
  ok(exportCompleted.response.ok && exportCompleted.response.headers.get("content-type")?.includes("text/csv") && csv.includes("synthetic.example.test"), "approved school profile export returns an audited CSV");
  const secondQueuedExport = await request("/api/owner/support/actions", supportActorCookie, "POST", { domain: "school_profile", action: "export" });
  ok(secondQueuedExport.response.status === 202, "another export can wait in queue for revocation cancellation");

  const revoke = await request("/api/super/support-grants", adminA.cookie, "PATCH", { grantId, decision: "revoke" });
  ok(revoke.response.ok, "school SUPER_ADMIN can revoke the active grant immediately");
  const afterRevoke = await request("/api/owner/support/workspace?domain=school_profile", supportActorCookie);
  ok(afterRevoke.response.status === 403, "revoked session cannot read again while its page remains open");
  const action = await prisma.supportAction.findUniqueOrThrow({ where: { id: secondQueuedExport.json.data.id } });
  ok(action.status === "cancelled", "revocation cancels the queued export");
  const readLog = await prisma.superAdminAuditLog.findFirst({ where: { userId: owner.user.id, action: "support_sensitive_read", targetId: grantId } });
  ok(Boolean(readLog), "sensitive support read audit identifies the actual APP_OWNER and grant");
  const writeLog = await prisma.superAdminAuditLog.findFirst({ where: { userId: owner.user.id, action: "support_write_completed", targetId: grantId } });
  ok(Boolean(writeLog), "school profile writes record the real actor and changed field");
  const exportLog = await prisma.superAdminAuditLog.findFirst({ where: { userId: owner.user.id, action: "support_export_completed", targetId: grantId } });
  ok(Boolean(exportLog), "CSV exports record the real actor and grant");
  const staleSession = await request("/api/owner/support/session", supportActorCookie);
  ok(staleSession.response.status === 403, "revoked support session clears on its next status check");
  const closeIncident = await request(`/api/owner/support/grants/${grantId}`, owner.cookie, "PATCH", { status: "closed", closureEvidence: "School administrator confirmed timetable access is restored and reviewed the completed support audit." });
  ok(closeIncident.response.ok && closeIncident.json.data.status === "closed", "incident closes only with recorded evidence");

  const emergency = await request("/api/owner/support/grants", owner.cookie, "POST", { schoolId: schoolA.id, purpose: "Restore outage recovery evidence", impact: "Recovery evidence is unavailable to administrators", scope: ["school_profile"], actions: ["read", "write"], durationMinutes: 5, emergency: true, emergencyReason: "Production recovery is blocked and school approval cannot be reached before the incident window closes." });
  ok(emergency.response.status === 201 && emergency.json.data.grant.status === "active", "emergency access starts with a recorded justification");
  const emergencyId = emergency.json.data.grant.id as string;
  const notification = await prisma.notification.findFirst({ where: { schoolId: schoolA.id, userId: adminA.user.id, type: "support_emergency_review" } });
  ok(Boolean(notification), "emergency access sends an in-app notice to the designated school reviewer");
  const emergencyCookie = `${owner.cookie}; ${emergency.response.headers.get("set-cookie")?.split(";")[0]}`;
  const queued = await request("/api/owner/support/actions", emergencyCookie, "POST", { domain: "school_profile", action: "write", payload: { field: "phone", value: "+1 555 010 1200" } });
  ok(queued.response.status === 202, "emergency support actions retain the real actor and grant");
  const review = await request("/api/super/support-grants", adminA.cookie, "PATCH", { grantId: emergencyId, decision: "review", evidence: "Reviewed the access log with the incident owner and confirmed only approved actions occurred." });
  ok(review.response.ok && Boolean(review.json.data.reviewedAt), "emergency access supports retrospective school review and evidence");
  await prisma.supportGrant.update({ where: { id: emergencyId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
  ok(await expireSupportGrants(prisma) >= 1, "background expiry sweep closes expired grants without an open browser page");
  const afterExpiry = await request("/api/owner/support/workspace?domain=school_profile", emergencyCookie);
  ok(afterExpiry.response.status === 403, "expiry is enforced on an already-open support page");
  const emergencyAction = await prisma.supportAction.findFirstOrThrow({ where: { grantId: emergencyId } });
  ok(emergencyAction.status === "cancelled", "expiry cancels queued privileged actions");
  const expiryAudit = await prisma.superAdminAuditLog.findFirst({ where: { userId: null, action: "support_access_expired", targetId: emergencyId } });
  ok(Boolean(expiryAudit), "expiry worker preserves the support actor ID and grant in its system audit");
  const emergencyAudit = await prisma.superAdminAuditLog.findFirst({ where: { userId: owner.user.id, action: "support_emergency_access_started", targetId: emergencyId } });
  ok(Boolean(emergencyAudit), "emergency audit preserves the actual support actor");

  console.log("SKO-215 synthetic acceptance checks complete");
}

runUnscoped("performing synthetic SKO-215 acceptance checks; every cross-school query is explicitly fixture-scoped", main)
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (fixtureSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: fixtureSchoolIds } } });
    await prisma.$disconnect();
  });
