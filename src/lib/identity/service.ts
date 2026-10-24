import { createHash, randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { ApiError } from "@/lib/api/scope";
import { authorityRoleFor, isCampusOperator, isInstitutionAuthority, kindFor } from "@/lib/auth/institution";
import { protectSecret, revealSecret } from "@/lib/auth/mfa-crypto";
import { discover, exchange, pkce, readStateCookie, stateCookie, verifyIdToken, type Discovery } from "./oidc";
import { applyEnrollment, applyWithdrawal, dateOnly } from "@/lib/students/enrollment";

// SKO-446: school identity (OIDC) and roster exchange.
// - Group identity administration (owner/super admin) configures the provider, verified domains, role mapping
//   and field ownership; campus leaders only review and apply roster batches for their campus.
// - A provider subject signs in only through an existing link. A first sign-in links automatically only when the
//   provider asserts a verified email on a verified domain and exactly one active account in this school has it;
//   anything else waits for an administrator's decision. Names never link anyone, and an email change upstream
//   keeps the same link. Role mapping can never produce owner or vendor roles.
// - Roster batches are dry-run first: adds, updates, withdrawals and conflicts, with each field's owner. Apply binds
//   the preview hash; the same batch id replays as the same batch; withdrawals archive pupils and deactivate staff
//   (sessions revoked) while keeping their records. Conflicts stay unchanged unless decided.
// - Local password sign-in is untouched, so named emergency administrators can always recover; their recovery
//   actions are audited.

const MAPPABLE_ROLES = ["TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "PRINCIPAL", "CAMPUS_ADMIN"];
const FIELDS = ["fullName", "admissionNo", "className", "status"] as const;
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
// §7.3 G14: identity administration belongs to the institution authority (group admin, or the school admin of a
// single school); campus operators review and apply roster batches for their own campus. PRINCIPAL does neither.
const isGroupAdmin = (user: AuthUser) => isInstitutionAuthority(user);
function groupAdmin(user: AuthUser) { if (!isGroupAdmin(user)) throw new ApiError("Only the institution administrator manages sign-in and roster connections.", 403); }
const canReviewRoster = (user: AuthUser) => isGroupAdmin(user) || isCampusOperator(user);
/** Emergency administrators are active holders of the authority role for this kind of school. */
const emergencyRole = (user: AuthUser) => authorityRoleFor(kindFor(user) ?? "GROUP");
async function event(schoolId: string, kind: string, actorId: string | null, connectionId: string | null, detail: Record<string, unknown> = {}) {
  await prisma.identityEvent.create({ data: { schoolId, kind, actorId, connectionId, detail: detail as Prisma.InputJsonValue } });
}

// ─── Connection setup (group identity administration) ────────────────────

export async function overview(user: AuthUser) {
  if (!canReviewRoster(user)) throw new ApiError("Only the institution administrator or a campus admin can open sign-in and roster settings.", 403);
  const rows = await prisma.identityConnection.findMany({ where: { schoolId: user.schoolId }, orderBy: { createdAt: "asc" } });
  const [requests, batches, events, campuses] = await Promise.all([
    prisma.identityLinkRequest.findMany({ where: { schoolId: user.schoolId, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.rosterBatch.findMany({ where: { schoolId: user.schoolId, ...(isGroupAdmin(user) ? {} : { campusId: user.campusId ?? "" }) }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, connectionId: true, campusId: true, externalBatchId: true, status: true, preview: true, result: true, createdAt: true, appliedAt: true } }),
    isGroupAdmin(user) ? prisma.identityEvent.findMany({ where: { schoolId: user.schoolId }, orderBy: { createdAt: "desc" }, take: 30 }) : Promise.resolve([]),
    prisma.campus.findMany({ where: { schoolId: user.schoolId, archivedAt: null }, select: { id: true, name: true } }),
  ]);
  const superAdmins = isGroupAdmin(user) ? await runUnscoped("identity: emergency administrator candidates", () => prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: emergencyRole(user) }, select: { id: true, fullName: true } })) : [];
  return {
    isGroupAdmin: isGroupAdmin(user), userId: user.userId, campuses, superAdmins, mappableRoles: MAPPABLE_ROLES, fields: FIELDS,
    connections: rows.map(c => ({ id: c.id, name: c.name, protocol: c.protocol, issuer: c.issuer, clientId: c.clientId, hasSecret: !!c.clientSecret, verifiedDomains: c.verifiedDomains, pendingDomains: c.pendingDomains, roleClaim: c.roleClaim, roleMap: c.roleMap, fieldOwnership: c.fieldOwnership, status: c.status, lastTestedAt: c.lastTestedAt, lastTestResult: c.lastTestResult, emergencyAdminIds: c.emergencyAdminIds })),
    requests: isGroupAdmin(user) ? requests : [], batches, events,
  };
}

export async function saveConnection(user: AuthUser, body: Record<string, unknown>) {
  groupAdmin(user);
  const roleMap = (body.roleMap && typeof body.roleMap === "object" ? body.roleMap : {}) as Record<string, string>;
  for (const [group, role] of Object.entries(roleMap)) if (!MAPPABLE_ROLES.includes(role)) throw new ApiError(`"${group}" maps to ${role}, which a directory group cannot grant. Owner and administrator-of-record roles are assigned in Skoolee only.`, 400);
  const ownership = (body.fieldOwnership && typeof body.fieldOwnership === "object" ? body.fieldOwnership : {}) as Record<string, string>;
  for (const [field, owner] of Object.entries(ownership)) if (!FIELDS.includes(field as never) || !["SOURCE", "LOCAL"].includes(owner)) throw new ApiError("Each field is managed either in the source system or here.", 400);
  const emergencyAdminIds = Array.isArray(body.emergencyAdminIds) ? body.emergencyAdminIds.map(String) : undefined;
  if (emergencyAdminIds && (await runUnscoped("identity: verify emergency administrators", () => prisma.user.count({ where: { schoolId: user.schoolId, id: { in: emergencyAdminIds }, isActive: true, role: emergencyRole(user) } }))) !== emergencyAdminIds.length) throw new ApiError("Emergency administrators must be active institution administrators of this school.", 400);
  const data = {
    name: text(body.name, 120), issuer: text(body.issuer, 300).replace(/\/$/, ""), clientId: text(body.clientId, 200),
    ...(body.clientSecret ? { clientSecret: protectSecret(text(body.clientSecret, 500)) } : {}),
    roleClaim: text(body.roleClaim, 60) || "groups", roleMap: roleMap as Prisma.InputJsonValue, fieldOwnership: ownership as Prisma.InputJsonValue,
    ...(emergencyAdminIds ? { emergencyAdminIds } : {}),
  };
  if (data.name.length < 3 || !data.issuer || !data.clientId) throw new ApiError("Name the connection and enter the issuer and client id.", 400);
  if (body.id) {
    const c = await prisma.identityConnection.findFirst({ where: { id: String(body.id), schoolId: user.schoolId } });
    if (!c) throw new ApiError("Connection not found", 404);
    // Changing the trust settings sends the connection back through a test before it can sign anyone in.
    const trustChanged = c.issuer !== data.issuer || c.clientId !== data.clientId || !!body.clientSecret;
    await prisma.identityConnection.update({ where: { id: c.id }, data: { ...data, ...(trustChanged ? { status: "DRAFT", lastTestedAt: null } : {}) } });
    await event(user.schoolId, "CONNECTION_UPDATED", user.userId, c.id, { trustChanged });
    return { id: c.id };
  }
  const row = await prisma.identityConnection.create({ data: { schoolId: user.schoolId, ...data, createdById: user.userId } });
  await event(user.schoolId, "CONNECTION_CREATED", user.userId, row.id);
  return { id: row.id };
}

/** Validates issuer metadata, endpoints and the callback before the connection can be enabled. */
export async function testConnection(user: AuthUser, id: string, origin: string) {
  groupAdmin(user);
  const c = await prisma.identityConnection.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!c) throw new ApiError("Connection not found", 404);
  const callback = `${origin}/sso/callback`;
  const d = await discover(c.issuer);
  const problems = d.ok ? [] : [d.reason];
  if (!/^https:\/\//.test(callback) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(callback)) problems.push("The callback URL must be HTTPS.");
  if (!c.clientId) problems.push("The client id (audience) is missing.");
  const ok = problems.length === 0;
  await prisma.identityConnection.update({ where: { id: c.id }, data: { discovery: d.ok ? (d.discovery as unknown as Prisma.InputJsonValue) : Prisma.DbNull, lastTestResult: ok ? "OK" : problems.join(" "), ...(ok ? { lastTestedAt: new Date(), status: c.status === "ENABLED" ? "ENABLED" : "TESTED" } : { status: c.status === "ENABLED" ? "ENABLED" : "DRAFT" }) } });
  await event(user.schoolId, "CONNECTION_TESTED", user.userId, c.id, { ok, problems });
  return { ok, problems, callback, audience: c.clientId, issuer: c.issuer };
}

export async function setConnectionStatus(user: AuthUser, body: Record<string, unknown>) {
  const c = await prisma.identityConnection.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId } });
  if (!c) throw new ApiError("Connection not found", 404);
  const emergency = body.emergency === true;
  if (emergency) {
    // Recovery path when the provider is unavailable: a named emergency administrator, signed in locally.
    if (!c.emergencyAdminIds.includes(user.userId)) throw new ApiError("Only a named emergency administrator can use emergency access.", 403);
  } else groupAdmin(user);
  const status = String(body.status ?? "");
  if (!["ENABLED", "DISABLED"].includes(status)) throw new ApiError("Enable or disable the connection.", 400);
  if (status === "ENABLED" && (emergency || !c.lastTestedAt || c.status === "DRAFT")) throw new ApiError("Test the connection successfully before enabling it.", 409);
  await prisma.identityConnection.update({ where: { id: c.id }, data: { status } });
  await event(user.schoolId, emergency ? "EMERGENCY_DISABLE" : status === "ENABLED" ? "CONNECTION_ENABLED" : "CONNECTION_DISABLED", user.userId, c.id, { reason: text(body.reason, 300) });
  return { id: c.id, status };
}

/** Domain ownership: a DNS TXT record (_skoolee-verify.<domain>) must carry the issued token. */
export async function addDomain(user: AuthUser, body: Record<string, unknown>) {
  groupAdmin(user);
  const c = await prisma.identityConnection.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId } });
  if (!c) throw new ApiError("Connection not found", 404);
  const domain = text(body.domain, 200).toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new ApiError("Enter a domain like school.example.", 400);
  const token = `skoolee-verify=${randomBytes(12).toString("hex")}`;
  const pending = ((c.pendingDomains as { domain: string; token: string }[]) ?? []).filter(p => p.domain !== domain).concat([{ domain, token }]);
  await prisma.identityConnection.update({ where: { id: c.id }, data: { pendingDomains: pending as Prisma.InputJsonValue } });
  return { domain, record: `_skoolee-verify.${domain}`, token };
}

export async function verifyDomain(user: AuthUser, body: Record<string, unknown>) {
  groupAdmin(user);
  const c = await prisma.identityConnection.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId } });
  if (!c) throw new ApiError("Connection not found", 404);
  const domain = text(body.domain, 200).toLowerCase();
  const pending = (c.pendingDomains as { domain: string; token: string }[]) ?? [];
  const p = pending.find(x => x.domain === domain);
  if (!p) throw new ApiError("Add the domain first.", 404);
  const testDomains = process.env.NODE_ENV === "production" ? [] : (process.env.IDENTITY_TEST_VERIFIED_DOMAINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  let found = testDomains.includes(domain);
  if (!found) { try { found = (await resolveTxt(`_skoolee-verify.${domain}`)).flat().includes(p.token); } catch { found = false; } }
  if (!found) throw new ApiError(`The TXT record _skoolee-verify.${domain} does not contain the token yet. DNS changes can take a while.`, 409);
  await prisma.identityConnection.update({ where: { id: c.id }, data: { verifiedDomains: [...new Set([...c.verifiedDomains, domain])], pendingDomains: pending.filter(x => x.domain !== domain) as Prisma.InputJsonValue } });
  await event(user.schoolId, "DOMAIN_VERIFIED", user.userId, c.id, { domain });
  return { domain };
}

// ─── Sign-in ─────────────────────────────────────────────────────────────

/** Starts sign-in for an enabled connection. Returns the provider URL and the signed state cookie. */
export async function startSignIn(connectionId: string, origin: string) {
  const c = await runUnscoped("sso: resolve connection before a session exists", () => prisma.identityConnection.findUnique({ where: { id: connectionId } }));
  if (!c || c.status !== "ENABLED" || !c.discovery) throw new ApiError("This school sign-in is not available. Use your Skoolee password instead.", 404);
  const d = c.discovery as unknown as Discovery;
  const { verifier, challenge } = pkce(), state = randomBytes(16).toString("base64url"), nonce = randomBytes(16).toString("base64url"), redirectUri = `${origin}/sso/callback`;
  const url = new URL(d.authorization_endpoint);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: c.clientId, redirect_uri: redirectUri, scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256" })) url.searchParams.set(k, v);
  return { url: url.toString(), cookie: await stateCookie({ connectionId: c.id, schoolId: c.schoolId, state, nonce, verifier, redirectUri }) };
}

export type SignInResult = { kind: "USER"; userId: string } | { kind: "PENDING"; message: string };

/** Completes sign-in: verifies state, PKCE, the ID token and then the link. Never creates or merges accounts. */
export async function completeSignIn(stateToken: string, code: string, state: string): Promise<SignInResult> {
  let s: Awaited<ReturnType<typeof readStateCookie>>;
  try { s = await readStateCookie(stateToken); } catch { throw new ApiError("This sign-in attempt expired. Start again.", 400); }
  if (s.state !== state) throw new ApiError("This sign-in attempt does not match. Start again.", 400);
  return runWithTenantContext({ schoolId: s.schoolId }, async () => {
    const c = await prisma.identityConnection.findFirst({ where: { id: s.connectionId, schoolId: s.schoolId } });
    if (!c || c.status !== "ENABLED" || !c.discovery) throw new ApiError("School sign-in is unavailable. Use your Skoolee password; recovery access is not affected.", 503);
    const d = c.discovery as unknown as Discovery;
    let claims: Awaited<ReturnType<typeof verifyIdToken>>;
    try {
      const idToken = await exchange(d, { code, verifier: s.verifier, redirectUri: s.redirectUri, clientId: c.clientId, clientSecret: c.clientSecret ? revealSecret(c.clientSecret) : null });
      claims = await verifyIdToken(d, idToken, c.clientId, s.nonce);
    } catch (error) {
      await event(c.schoolId, "SIGN_IN_FAILED", null, c.id, { reason: error instanceof Error ? error.message : "unknown" });
      throw new ApiError("The school identity provider did not confirm this sign-in. Try again or use your Skoolee password.", 401);
    }
    const link = await prisma.identityLink.findUnique({ where: { connectionId_subject: { connectionId: c.id, subject: claims.sub } } });
    if (link) {
      const u = await prisma.user.findFirst({ where: { id: link.userId, schoolId: c.schoolId, isActive: true } });
      if (!u) throw new ApiError("This account is not active at the school.", 403);
      await prisma.identityLink.update({ where: { id: link.id }, data: { lastSignInAt: new Date() } });
      await event(c.schoolId, "SIGN_IN", u.id, c.id, { subject: claims.sub, emailChanged: claims.email ? claims.email.toLowerCase() !== u.email.toLowerCase() : false });
      return { kind: "USER", userId: u.id };
    }
    const email = claims.email?.toLowerCase() ?? null, domain = email?.split("@")[1] ?? "";
    const candidates = email ? await prisma.user.findMany({ where: { schoolId: c.schoolId, isActive: true, email: { equals: email, mode: "insensitive" }, role: { notIn: ["APP_OWNER"] } }, select: { id: true } }) : [];
    const verified = claims.email_verified === true && c.verifiedDomains.includes(domain);
    if (verified && candidates.length === 1 && !(await prisma.identityLink.findFirst({ where: { connectionId: c.id, userId: candidates[0].id } }))) {
      await prisma.identityLink.create({ data: { schoolId: c.schoolId, connectionId: c.id, subject: claims.sub, userId: candidates[0].id, method: "VERIFIED_EMAIL", lastSignInAt: new Date() } });
      await event(c.schoolId, "LINKED", null, c.id, { subject: claims.sub, userId: candidates[0].id, method: "VERIFIED_EMAIL" });
      return { kind: "USER", userId: candidates[0].id };
    }
    const reason = !email ? "The provider sent no email." : !claims.email_verified ? "The provider did not verify the email." : !c.verifiedDomains.includes(domain) ? `The domain ${domain} is not verified for this school.` : candidates.length === 0 ? "No active account has this email." : candidates.length > 1 ? "More than one account has this email." : "That account is already linked to another provider identity.";
    await prisma.identityLinkRequest.upsert({ where: { connectionId_subject: { connectionId: c.id, subject: claims.sub } }, create: { schoolId: c.schoolId, connectionId: c.id, subject: claims.sub, email, emailVerified: claims.email_verified === true, name: typeof claims.name === "string" ? claims.name.slice(0, 160) : null, reason, candidateUserIds: candidates.map(x => x.id) }, update: { email, emailVerified: claims.email_verified === true, reason, candidateUserIds: candidates.map(x => x.id), status: "PENDING" } });
    await event(c.schoolId, "LINK_REQUESTED", null, c.id, { subject: claims.sub, reason });
    return { kind: "PENDING", message: "Your school administrator must confirm which Skoolee account is yours before you can sign in this way. You can still use your Skoolee password." };
  });
}

/** An administrator links a provider subject to one account (shown side by side) or rejects it. */
export async function decideLink(user: AuthUser, body: Record<string, unknown>) {
  groupAdmin(user);
  const r = await prisma.identityLinkRequest.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId, status: "PENDING" } });
  if (!r) throw new ApiError("Request not found", 404);
  if (body.decision === "REJECT") {
    await prisma.identityLinkRequest.update({ where: { id: r.id }, data: { status: "REJECTED", decidedById: user.userId, decidedAt: new Date() } });
    await event(user.schoolId, "LINK_REJECTED", user.userId, r.connectionId, { subject: r.subject });
    return { id: r.id, status: "REJECTED" };
  }
  const target = await prisma.user.findFirst({ where: { id: String(body.userId ?? ""), schoolId: user.schoolId, isActive: true, role: { notIn: ["APP_OWNER"] } }, select: { id: true } });
  if (!target) throw new ApiError("Choose an active account in this school.", 400);
  try {
    await prisma.$transaction([
      prisma.identityLink.create({ data: { schoolId: user.schoolId, connectionId: r.connectionId, subject: r.subject, userId: target.id, method: "ADMIN_DECISION", linkedById: user.userId } }),
      prisma.identityLinkRequest.update({ where: { id: r.id }, data: { status: "LINKED", decidedById: user.userId, decidedAt: new Date() } }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("That account is already linked to another identity for this provider.", 409);
    throw error;
  }
  await event(user.schoolId, "LINKED", user.userId, r.connectionId, { subject: r.subject, userId: target.id, method: "ADMIN_DECISION" });
  return { id: r.id, status: "LINKED" };
}

export async function candidates(user: AuthUser, requestId: string) {
  groupAdmin(user);
  const r = await prisma.identityLinkRequest.findFirst({ where: { id: requestId, schoolId: user.schoolId } });
  if (!r) throw new ApiError("Request not found", 404);
  const q = r.email ? { OR: [{ email: { equals: r.email, mode: "insensitive" as const } }, { id: { in: r.candidateUserIds } }] } : { id: { in: r.candidateUserIds } };
  return prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, ...q }, select: { id: true, fullName: true, email: true, role: true, campusId: true, lastLogin: true }, take: 20 });
}

// ─── Roster exchange ─────────────────────────────────────────────────────

type Row = { kind: "student" | "staff"; externalId: string; fullName?: string; admissionNo?: string | null; className?: string; section?: string | null; email?: string; group?: string; status?: "active" | "withdrawn" };
type Change = { key: string; kind: "STUDENT" | "STAFF"; externalId: string; action: "ADD" | "UPDATE" | "WITHDRAW" | "UNCHANGED" | "CONFLICT" | "ERROR"; localId: string | null; changes: { field: string; from: unknown; to: unknown; owner: "SOURCE" | "LOCAL"; applied: boolean }[]; note: string | null; destructive: boolean };

const owner = (c: { fieldOwnership: Prisma.JsonValue }, field: string) => (((c.fieldOwnership ?? {}) as Record<string, string>)[field] === "LOCAL" ? "LOCAL" : "SOURCE") as "SOURCE" | "LOCAL";

/** Stores a batch (idempotently by its external id) and computes its dry run. */
export async function submitBatch(user: AuthUser, body: Record<string, unknown>) {
  if (!canReviewRoster(user)) throw new ApiError("Only the institution administrator or a campus admin reviews roster batches.", 403);
  const connectionId = String(body.connectionId ?? ""), campusId = isGroupAdmin(user) ? String(body.campusId || user.campusId || "") : user.campusId ?? "";
  const c = await prisma.identityConnection.findFirst({ where: { id: connectionId, schoolId: user.schoolId } });
  if (!c) throw new ApiError("Connection not found", 404);
  if (!(await prisma.campus.findFirst({ where: { id: campusId, schoolId: user.schoolId } }))) throw new ApiError("Choose a campus.", 400);
  const externalBatchId = text(body.externalBatchId, 120);
  if (!externalBatchId) throw new ApiError("Give the source system's batch id.", 400);
  const rows = (Array.isArray(body.rows) ? body.rows : []) as Row[];
  if (!rows.length || rows.length > 5000) throw new ApiError("A batch has between 1 and 5000 rows.", 400);
  const keys = new Set<string>();
  for (const r of rows) {
    if (!["student", "staff"].includes(r?.kind) || !text(r.externalId, 120)) throw new ApiError("Every row needs a kind (student or staff) and a stable externalId.", 400);
    const k = `${r.kind}:${r.externalId}`;
    if (keys.has(k)) throw new ApiError(`The batch lists ${k} twice.`, 400);
    keys.add(k);
  }
  const payloadHash = sha(JSON.stringify(rows));
  const existing = await prisma.rosterBatch.findUnique({ where: { connectionId_externalBatchId: { connectionId, externalBatchId } } });
  if (existing) {
    if (existing.payloadHash !== payloadHash) throw new ApiError("This batch id was already used with different rows. The source must send a new batch id.", 409);
    return { id: existing.id, replayed: true, status: existing.status };
  }
  const batch = await prisma.rosterBatch.create({ data: { schoolId: user.schoolId, connectionId, campusId, externalBatchId, payloadHash, rows: rows as unknown as Prisma.InputJsonValue, submittedById: user.userId } });
  const p = await computePreview(user.schoolId, c, campusId, rows);
  await prisma.rosterBatch.update({ where: { id: batch.id }, data: { preview: p.changes as unknown as Prisma.InputJsonValue, previewHash: p.hash } });
  return { id: batch.id, replayed: false, status: "DRY_RUN" };
}

async function computePreview(schoolId: string, c: Prisma.IdentityConnectionGetPayload<object>, campusId: string, rows: Row[]) {
  const changes: Change[] = [];
  const roleMap = (c.roleMap ?? {}) as Record<string, string>;
  for (const r of rows) {
    const kind = r.kind === "student" ? "STUDENT" : "STAFF", key = `${r.kind}:${r.externalId}`;
    const map = await prisma.rosterExternalId.findUnique({ where: { connectionId_kind_externalId: { connectionId: c.id, kind, externalId: r.externalId } } });
    const withdrawn = r.status === "withdrawn";
    if (kind === "STUDENT") {
      let local = map ? await prisma.student.findFirst({ where: { id: map.localId, schoolId }, select: { id: true, fullName: true, admissionNo: true, campusId: true, archivedAt: true, class: { select: { name: true, section: true } } } }) : null;
      let note: string | null = null;
      // An unmapped row can match only a stable identifier (admission number), never a name.
      if (!local && r.admissionNo) {
        local = await prisma.student.findFirst({ where: { schoolId, campusId, admissionNo: r.admissionNo, archivedAt: null }, select: { id: true, fullName: true, admissionNo: true, campusId: true, archivedAt: true, class: { select: { name: true, section: true } } } });
        if (local && await prisma.rosterExternalId.findUnique({ where: { connectionId_kind_localId: { connectionId: c.id, kind, localId: local.id } } })) { changes.push({ key, kind, externalId: r.externalId, action: "CONFLICT", localId: local.id, changes: [], note: "This admission number already belongs to a pupil linked to a different source id.", destructive: false }); continue; }
        if (local) note = "Matched by admission number.";
      }
      if (local && local.campusId !== campusId) { changes.push({ key, kind, externalId: r.externalId, action: "ERROR", localId: null, changes: [], note: "This pupil belongs to another campus.", destructive: false }); continue; }
      const className = r.className ? `${r.className}${r.section ? ` ${r.section}` : ""}` : null;
      if (!local) {
        if (withdrawn) { changes.push({ key, kind, externalId: r.externalId, action: "UNCHANGED", localId: null, changes: [], note: "Withdrawn upstream and not present here.", destructive: false }); continue; }
        if (!r.fullName || !r.className) { changes.push({ key, kind, externalId: r.externalId, action: "ERROR", localId: null, changes: [], note: "A new pupil needs fullName and className.", destructive: false }); continue; }
        const cls = await prisma.class.findFirst({ where: { schoolId, campusId, name: r.className, ...(r.section ? { section: r.section } : {}), status: "ACTIVE" }, select: { id: true } });
        if (!cls) { changes.push({ key, kind, externalId: r.externalId, action: "ERROR", localId: null, changes: [], note: `No active class "${className}" at this campus.`, destructive: false }); continue; }
        changes.push({ key, kind, externalId: r.externalId, action: "ADD", localId: null, changes: [{ field: "fullName", from: null, to: r.fullName, owner: "SOURCE", applied: true }, { field: "className", from: null, to: className, owner: "SOURCE", applied: true }, ...(r.admissionNo ? [{ field: "admissionNo", from: null, to: r.admissionNo, owner: "SOURCE" as const, applied: true }] : [])], note, destructive: false });
        continue;
      }
      const current = { fullName: local.fullName, admissionNo: local.admissionNo, className: local.class ? `${local.class.name}${local.class.section ? ` ${local.class.section}` : ""}` : null, status: local.archivedAt ? "withdrawn" : "active" };
      const synced = (map?.synced ?? {}) as Record<string, unknown>;
      const incoming: Record<string, unknown> = { fullName: r.fullName ?? current.fullName, admissionNo: r.admissionNo ?? current.admissionNo, className: className ?? current.className, status: withdrawn ? "withdrawn" : "active" };
      const diffs: Change["changes"] = [];
      let conflict = false;
      for (const f of FIELDS) {
        if (JSON.stringify(incoming[f]) === JSON.stringify(current[f])) continue;
        const o = owner(c, f);
        // A field changed here since the last sync and also differs upstream: a conflict for a person to decide.
        const localEdit = map && f in synced && JSON.stringify(synced[f]) !== JSON.stringify(current[f]);
        if (o === "SOURCE" && localEdit) conflict = true;
        diffs.push({ field: f, from: current[f], to: incoming[f], owner: o, applied: o === "SOURCE" });
      }
      const destructive = withdrawn && current.status !== "withdrawn";
      if (!diffs.length) { changes.push({ key, kind, externalId: r.externalId, action: "UNCHANGED", localId: local.id, changes: [], note, destructive: false }); continue; }
      changes.push({ key, kind, externalId: r.externalId, action: conflict ? "CONFLICT" : destructive ? "WITHDRAW" : "UPDATE", localId: local.id, changes: diffs, note: conflict ? "Changed here since the last sync and changed upstream too." : note, destructive });
    } else {
      const local = map ? await prisma.user.findFirst({ where: { id: map.localId, schoolId }, select: { id: true, fullName: true, email: true, role: true, isActive: true } }) : null;
      const role = r.group ? roleMap[r.group] : undefined;
      if (r.group && !role) { changes.push({ key, kind, externalId: r.externalId, action: "ERROR", localId: local?.id ?? null, changes: [], note: `The directory group "${r.group}" has no role mapping.`, destructive: false }); continue; }
      if (!local) {
        if (withdrawn) { changes.push({ key, kind, externalId: r.externalId, action: "UNCHANGED", localId: null, changes: [], note: "Withdrawn upstream and not present here.", destructive: false }); continue; }
        const email = text(r.email, 200).toLowerCase();
        if (!email || !r.fullName || !role) { changes.push({ key, kind, externalId: r.externalId, action: "ERROR", localId: null, changes: [], note: "A new staff member needs fullName, email and a mapped group.", destructive: false }); continue; }
        // Never adopt an existing account by email from a roster: that is a link decision for an administrator.
        if (await prisma.user.findFirst({ where: { schoolId, email: { equals: email, mode: "insensitive" } }, select: { id: true } })) { changes.push({ key, kind, externalId: r.externalId, action: "CONFLICT", localId: null, changes: [], note: "An account with this email already exists. Link it deliberately instead of creating a second one.", destructive: false }); continue; }
        changes.push({ key, kind, externalId: r.externalId, action: "ADD", localId: null, changes: [{ field: "fullName", from: null, to: r.fullName, owner: "SOURCE", applied: true }, { field: "email", from: null, to: email, owner: "SOURCE", applied: true }, { field: "role", from: null, to: role, owner: "SOURCE", applied: true }], note: "Account created without a password; the person signs in through the school provider.", destructive: false });
        continue;
      }
      if (withdrawn && local.isActive) { changes.push({ key, kind, externalId: r.externalId, action: "WITHDRAW", localId: local.id, changes: [{ field: "status", from: "active", to: "withdrawn", owner: "SOURCE", applied: true }], note: "Access is revoked and sessions end; their records stay.", destructive: true }); continue; }
      const diffs: Change["changes"] = [];
      if (r.fullName && r.fullName !== local.fullName) diffs.push({ field: "fullName", from: local.fullName, to: r.fullName, owner: owner(c, "fullName"), applied: owner(c, "fullName") === "SOURCE" });
      // Roles never change from a roster: a different mapped role is shown for an administrator to act on.
      if (role && role !== local.role) diffs.push({ field: "role", from: local.role, to: role, owner: "LOCAL", applied: false });
      changes.push({ key, kind, externalId: r.externalId, action: diffs.some(d => d.applied) ? "UPDATE" : "UNCHANGED", localId: local.id, changes: diffs, note: diffs.some(d => d.field === "role") ? "Role differences are not applied from a roster." : null, destructive: false });
    }
  }
  return { changes, hash: sha(JSON.stringify(changes)) };
}

export async function batchDetail(user: AuthUser, id: string) {
  if (!canReviewRoster(user)) throw new ApiError("Only the institution administrator or a campus admin reviews roster batches.", 403);
  const b = await prisma.rosterBatch.findFirst({ where: { id, schoolId: user.schoolId, ...(isGroupAdmin(user) ? {} : { campusId: user.campusId ?? "" }) } });
  if (!b) throw new ApiError("Batch not found", 404);
  const changes = (b.preview ?? []) as unknown as Change[];
  const count = (a: Change["action"]) => changes.filter(c => c.action === a).length;
  return { id: b.id, externalBatchId: b.externalBatchId, status: b.status, previewHash: b.previewHash, changes, result: b.result, summary: { add: count("ADD"), update: count("UPDATE"), withdraw: count("WITHDRAW"), conflict: count("CONFLICT"), error: count("ERROR"), unchanged: count("UNCHANGED") } };
}

/** Applies a reviewed batch. The preview must be current; conflicts change only with an explicit decision. */
export async function applyBatch(user: AuthUser, body: Record<string, unknown>) {
  if (!canReviewRoster(user)) throw new ApiError("Only the institution administrator or a campus admin reviews roster batches.", 403);
  const b = await prisma.rosterBatch.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId, ...(isGroupAdmin(user) ? {} : { campusId: user.campusId ?? "" }) }, include: { connection: true } });
  if (!b) throw new ApiError("Batch not found", 404);
  if (b.status === "APPLIED") return { id: b.id, repeated: true, result: b.result };
  const fresh = await computePreview(user.schoolId, b.connection, b.campusId, b.rows as unknown as Row[]);
  if (fresh.hash !== String(body.previewHash ?? "") || fresh.hash !== b.previewHash) {
    await prisma.rosterBatch.update({ where: { id: b.id }, data: { preview: fresh.changes as unknown as Prisma.InputJsonValue, previewHash: fresh.hash } });
    throw new ApiError("Local records changed since this preview. Review the refreshed changes before applying.", 409);
  }
  const decisions = (body.decisions && typeof body.decisions === "object" ? body.decisions : {}) as Record<string, string>;
  const rows = new Map((b.rows as unknown as Row[]).map(r => [`${r.kind}:${r.externalId}`, r]));
  const result = { applied: 0, skippedConflicts: 0, errors: 0, keptLocal: 0 };
  await prisma.$transaction(async tx => {
    const claimed = await tx.rosterBatch.updateMany({ where: { id: b.id, status: "DRY_RUN" }, data: { status: "APPLIED", appliedById: user.userId, appliedAt: new Date() } });
    if (!claimed.count) throw new ApiError("This batch was just applied by someone else.", 409);
    const failures: { key: string; error: string }[] = [];
    for (const ch of fresh.changes) {
      const r = rows.get(ch.key)!;
      if (ch.action === "ERROR") { result.errors++; continue; }
      // A pupil matched by a stable identifier with nothing to change still gets its source mapping.
      if (ch.action === "UNCHANGED") { if (ch.localId && ch.kind === "STUDENT") await syncMark(tx, b.connectionId, ch, r, user.schoolId); continue; }
      if (ch.action === "CONFLICT") {
        const d = decisions[ch.key];
        if (d === "KEEP_LOCAL") { result.keptLocal++; if (ch.localId) await syncMark(tx, b.connectionId, ch, r, user.schoolId); continue; }
        if (d !== "APPLY_SOURCE" || !ch.localId) { result.skippedConflicts++; continue; }
      }
      // Each row is its own savepoint: a placement the enrollment rules refuse fails alone and is reported.
      await tx.$executeRaw`SAVEPOINT roster_row`;
      try {
        if (ch.kind === "STUDENT") await applyStudent(tx, user.schoolId, b.campusId, b.connectionId, ch, r, user.userId);
        else await applyStaff(tx, user.schoolId, b.campusId, b.connectionId, ch, r);
        await tx.$executeRaw`RELEASE SAVEPOINT roster_row`;
        result.applied++;
      } catch (error) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT roster_row`;
        result.errors++;
        failures.push({ key: ch.key, error: error instanceof Error ? error.message : "Could not apply" });
      }
    }
    await tx.rosterBatch.update({ where: { id: b.id }, data: { result: { ...result, failures } as unknown as Prisma.InputJsonValue } });
  });
  await event(user.schoolId, "ROSTER_APPLIED", user.userId, b.connectionId, { batchId: b.id, externalBatchId: b.externalBatchId, ...result, decisions });
  return { id: b.id, repeated: false, result };
}

type Tx = TxClient;
async function syncMark(tx: Tx, connectionId: string, ch: Change, r: Row, schoolId: string) {
  const local = await tx.student.findFirst({ where: { id: ch.localId! }, select: { fullName: true, admissionNo: true, archivedAt: true, class: { select: { name: true, section: true } } } });
  const snapshot = local ? { fullName: local.fullName, admissionNo: local.admissionNo, className: local.class ? `${local.class.name}${local.class.section ? ` ${local.class.section}` : ""}` : null, status: local.archivedAt ? "withdrawn" : "active" } : {};
  await tx.rosterExternalId.upsert({ where: { connectionId_kind_externalId: { connectionId, kind: ch.kind, externalId: r.externalId } }, create: { schoolId, connectionId, kind: ch.kind, externalId: r.externalId, localId: ch.localId!, synced: snapshot }, update: { synced: snapshot } });
}

async function applyStudent(tx: Tx, schoolId: string, campusId: string, connectionId: string, ch: Change, r: Row, actorId: string) {
  let id = ch.localId;
  const classFor = () => tx.class.findFirstOrThrow({ where: { schoolId, campusId, name: r.className, ...(r.section ? { section: r.section } : {}), status: "ACTIVE" }, select: { id: true } });
  if (ch.action === "ADD") {
    const cls = await classFor();
    id = (await tx.student.create({ data: { schoolId, campusId, classId: cls.id, fullName: r.fullName!, admissionNo: r.admissionNo ?? null, rollNo: (r.admissionNo ?? r.externalId).slice(0, 30), gender: "OTHER", status: "active" } as never, select: { id: true } })).id;
  } else {
    const wanted = (f: string) => ch.changes.find(d => d.field === f && d.owner === "SOURCE" && (d.applied || ch.action === "CONFLICT"));
    const data: Record<string, unknown> = {};
    if (wanted("fullName")) data.fullName = wanted("fullName")!.to;
    if (wanted("admissionNo")) data.admissionNo = wanted("admissionNo")!.to;
    if (Object.keys(data).length) await tx.student.update({ where: { id: id! }, data: data as never });
    const today = dateOnly(new Date().toISOString().slice(0, 10));
    if (wanted("status")?.to === "withdrawn") {
      // Withdrawal goes through the enrollment rules: the placement closes, history (marks, attendance, invoices) stays.
      await applyWithdrawal(tx, { studentId: id!, effectiveDate: today, actorId, reason: "Withdrawn by roster sync" });
    } else if (wanted("className") && r.className) {
      const cls = await classFor(), pupil = await tx.student.findFirstOrThrow({ where: { id: id! }, select: { rollNo: true } });
      const from = await tx.studentEnrollment.findFirstOrThrow({ where: { studentId: id!, endDate: null, status: "ACTIVE" }, select: { id: true } });
      await applyEnrollment(tx, { studentId: id!, fromId: from.id, targetClassId: cls.id, effectiveDate: today, rollNo: pupil.rollNo, actorId, reason: "Roster sync" });
    }
  }
  await syncMark(tx, connectionId, { ...ch, localId: id }, r, schoolId);
}

async function applyStaff(tx: Tx, schoolId: string, campusId: string, connectionId: string, ch: Change, r: Row) {
  let id = ch.localId;
  if (ch.action === "ADD") {
    const role = ch.changes.find(c => c.field === "role")!.to as string;
    id = (await tx.user.create({ data: { schoolId, campusId, email: String(r.email).toLowerCase(), fullName: r.fullName!, role: role as never, isActive: true, onboardingComplete: true }, select: { id: true } })).id;
  } else if (ch.action === "WITHDRAW") {
    // Revoke access now: deactivate and bump the access version so existing sessions stop; records remain.
    await tx.user.update({ where: { id: id! }, data: { isActive: false, accessVersion: { increment: 1 } } });
  } else {
    const name = ch.changes.find(c => c.field === "fullName" && c.applied);
    if (name) await tx.user.update({ where: { id: id! }, data: { fullName: String(name.to) } });
  }
  await tx.rosterExternalId.upsert({ where: { connectionId_kind_externalId: { connectionId, kind: "STAFF", externalId: r.externalId } }, create: { schoolId, connectionId, kind: "STAFF", externalId: r.externalId, localId: id!, synced: { fullName: r.fullName ?? null } }, update: { synced: { fullName: r.fullName ?? null } } });
}
