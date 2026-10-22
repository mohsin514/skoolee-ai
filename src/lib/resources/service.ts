import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { teacherClassIds } from "@/lib/chat/policy";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { createPrivateUploadUrl, MAX_PRIVATE_UPLOAD_BYTES } from "@/lib/storage/private-upload";
import { readPrivateObject } from "@/lib/storage/s3";
import { assertObjectivesExist } from "@/lib/curriculum/service";
import { coverResourceGrant } from "@/lib/cover/recovery";

// SKO-400 learning resource library. Learners and families only ever reach the
// published version of a resource addressed to them; staff can open every
// version so pinned references stay reproducible. Files never leave through a
// stored URL: each download is re-authorised against current membership.

export const RESOURCE_KINDS = ["HANDOUT", "NOTES", "ROUTINE", "WORKSHEET", "ANSWER_KEY", "OTHER"] as const;
export const RESOURCE_AUDIENCES = ["CLASS", "CLASS_AND_GUARDIANS", "STAFF"] as const;
export type ResourceAudience = typeof RESOURCE_AUDIENCES[number];
const LEARNER_AUDIENCES: ResourceAudience[] = ["CLASS", "CLASS_AND_GUARDIANS"];
const GUARDIAN_AUDIENCES: ResourceAudience[] = ["CLASS_AND_GUARDIANS"];
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain"] as const;

const isLearner = (user: AuthUser) => user.role === "STUDENT" || user.role === "PARENT";

/** Classes the staff member may author for: managers in their campus scope, teachers of the class. */
async function authorClassIds(tx: TxClient, user: AuthUser): Promise<string[] | "campus"> {
  if (canManageOperations(user)) return "campus";
  if (user.role === "TEACHER") return teacherClassIds(user.userId, tx);
  return [];
}
async function assertAuthor(tx: TxClient, user: AuthUser, classId: string) {
  const klass = await tx.class.findFirst({ where: { id: classId, schoolId: user.schoolId, archivedAt: null }, select: { id: true, campusId: true } });
  if (!klass) throw new ApiError("Class not found.", 404);
  const scope = await authorClassIds(tx, user);
  const allowed = scope === "campus" ? (user.role === "SUPER_ADMIN" || klass.campusId === user.campusId) : scope.includes(klass.id);
  if (!allowed) throw new ApiError("You cannot manage resources for this class.", 403);
  return klass;
}
async function authorResource(tx: TxClient, user: AuthUser, resourceId: string) {
  const resource = await tx.learningResource.findFirst({ where: { id: resourceId, schoolId: user.schoolId } });
  if (!resource) throw new ApiError("Resource not found.", 404);
  await assertAuthor(tx, user, resource.classId);
  return resource;
}

/** Classes a learner or guardian may read from, with the audiences that reach them. */
async function learnerReach(tx: TxClient, user: AuthUser): Promise<{ classIds: string[]; audiences: ResourceAudience[] }> {
  if (user.role === "STUDENT") {
    const own = await tx.student.findMany({ where: { schoolId: user.schoolId, studentUserId: user.userId, archivedAt: null }, select: { classId: true } });
    return { classIds: own.map(row => row.classId), audiences: LEARNER_AUDIENCES };
  }
  const children = await tx.student.findMany({ where: { AND: [studentScope(user, "learningRecords"), { archivedAt: null }] }, select: { classId: true } });
  return { classIds: [...new Set(children.map(row => row.classId))], audiences: GUARDIAN_AUDIENCES };
}

const versionView = (version: { version: number; fileName: string | null; contentType: string | null; sizeBytes: number | null; linkUrl: string | null; description: string; uploadedAt: Date | null; createdAt: Date }) => ({
  version: version.version, fileName: version.fileName, contentType: version.contentType, sizeBytes: version.sizeBytes,
  link: version.linkUrl, description: version.description, ready: !!version.linkUrl || !!version.uploadedAt, createdAt: version.createdAt,
});

// ─── Reading ──────────────────────────────────────────────────────
export const listInput = z.object({ classId: z.string().min(1).optional(), viewAs: z.enum(["CLASS", "GUARDIANS"]).optional(), q: z.string().trim().max(120).optional() }).strict();

export async function listResources(user: AuthUser, raw: unknown) {
  const input = listInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const search = input.q ? { title: { contains: input.q, mode: "insensitive" as const } } : {};
    // Learners, families and a staff "view as" preview share one query: published, addressed to them, current version only.
    const learnerView = async (classIds: string[], audiences: ResourceAudience[]) => {
      const rows = await tx.learningResource.findMany({ where: { schoolId: user.schoolId, classId: { in: classIds }, status: "PUBLISHED", audience: { in: audiences }, ...search }, orderBy: [{ updatedAt: "desc" }] });
      const versions = await tx.learningResourceVersion.findMany({ where: { schoolId: user.schoolId, OR: rows.map(row => ({ resourceId: row.id, version: row.publishedVersion! })) } });
      return rows.map(row => ({ id: row.id, title: row.title, kind: row.kind, classId: row.classId, language: row.language, version: row.publishedVersion, current: versionView(versions.find(v => v.resourceId === row.id)!) }));
    };
    if (isLearner(user)) {
      const reach = await learnerReach(tx, user);
      return { mode: "learner" as const, resources: await learnerView(reach.classIds, reach.audiences), classes: [] };
    }
    const scope = await authorClassIds(tx, user);
    const classes = await tx.class.findMany({ where: { schoolId: user.schoolId, archivedAt: null, ...(scope === "campus" ? (user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) : { id: { in: scope } }) }, select: { id: true, name: true, section: true, campusId: true }, orderBy: [{ name: "asc" }] });
    if (!classes.length) {
      if (input.classId || (user.role !== "TEACHER" && !canManageOperations(user))) throw new ApiError("You cannot manage resources for this class.", 403);
      return { mode: "staff" as const, classId: "", classes, resources: [] };
    }
    const classId = input.classId && classes.some(c => c.id === input.classId) ? input.classId : classes[0].id;
    if (input.classId && input.classId !== classId) throw new ApiError("You cannot manage resources for this class.", 403);
    if (input.viewAs) {
      return { mode: "preview" as const, viewAs: input.viewAs, classId, classes, resources: await learnerView([classId], input.viewAs === "CLASS" ? LEARNER_AUDIENCES : GUARDIAN_AUDIENCES) };
    }
    const rows = await tx.learningResource.findMany({ where: { schoolId: user.schoolId, classId, ...search }, orderBy: [{ updatedAt: "desc" }] });
    const versions = await tx.learningResourceVersion.findMany({ where: { schoolId: user.schoolId, resourceId: { in: rows.map(row => row.id) } }, orderBy: { version: "desc" } });
    return { mode: "staff" as const, classId, classes, resources: rows.map(row => ({ ...row, versions: versions.filter(v => v.resourceId === row.id).map(versionView) })) };
  });
}

/** What a download may return: staff any version of an authorable resource, learners only the published one addressed to them. */
export async function resolveDownload(user: AuthUser, resourceId: string, requestedVersion?: number) {
  return schoolAiTransaction(user, async tx => {
    const resource = await tx.learningResource.findFirst({ where: { id: resourceId, schoolId: user.schoolId } });
    // Not found and not allowed share one answer, so restricted titles and ids reveal nothing.
    const denied = () => new ApiError("Resource not found.", 404);
    if (!resource) throw denied();
    let version: number;
    if (isLearner(user)) {
      const reach = await learnerReach(tx, user);
      if (resource.status !== "PUBLISHED" || !reach.classIds.includes(resource.classId) || !reach.audiences.includes(resource.audience as ResourceAudience)) throw denied();
      if (requestedVersion !== undefined && requestedVersion !== resource.publishedVersion) throw denied();
      version = resource.publishedVersion!;
    } else {
      const authored = await assertAuthor(tx, user, resource.classId).then(() => true, () => false);
      // SKO-442: a substitute reaches a handover resource through the duty only, published version only.
      const grant = authored ? null : await coverResourceGrant(tx, user, resource);
      if (!authored && (!grant || (requestedVersion !== undefined && requestedVersion !== grant))) throw denied();
      version = grant ?? requestedVersion ?? resource.publishedVersion ?? resource.latestVersion;
    }
    const row = await tx.learningResourceVersion.findFirst({ where: { schoolId: user.schoolId, resourceId, version } });
    if (!row || (!row.linkUrl && !row.uploadedAt)) throw denied();
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: resource.campusId, tableName: "learning_resources", recordId: resource.id, userId: user.userId, newValue: { action: "DOWNLOAD", version } } });
    return { link: row.linkUrl, storageKey: row.storageKey, fileName: row.fileName ?? "resource", contentType: row.contentType ?? "application/octet-stream" };
  });
}

/** The only sanctioned bridge for AI features: published, learner-facing versions. Answer keys and staff material never qualify. */
export async function aiEligibleResources(tx: TxClient, schoolId: string, classId: string) {
  return tx.learningResource.findMany({ where: { schoolId, classId, status: "PUBLISHED", audience: { in: LEARNER_AUDIENCES }, kind: { not: "ANSWER_KEY" } }, select: { id: true, title: true, publishedVersion: true } });
}

// ─── Authoring ────────────────────────────────────────────────────
const content = z.union([
  z.object({ link: z.string().url().max(2048).refine(url => /^https:\/\//i.test(url), "Use an https link.") }).strict(),
  z.object({ fileName: z.string().trim().min(1).max(160), contentType: z.enum(FILE_TYPES), sizeBytes: z.number().int().positive().max(MAX_PRIVATE_UPLOAD_BYTES) }).strict(),
]);
const objectives = z.object({ curriculumId: z.string().min(1), curriculumVersion: z.number().int().positive(), outcomeIds: z.array(z.string().min(1).max(64)).max(30) }).strict().nullable().optional();
export const createInput = z.object({
  classId: z.string().min(1), subjectId: z.string().min(1).nullable().optional(), title: z.string().trim().min(3).max(160),
  kind: z.enum(RESOURCE_KINDS), audience: z.enum(RESOURCE_AUDIENCES), language: z.enum(["en", "ar", "ur"]).default("en"),
  sourceRights: z.string().trim().max(240).default(""), description: z.string().trim().min(10).max(2000), objectives, content,
}).strict().refine(value => value.kind !== "ANSWER_KEY" || value.audience === "STAFF", { message: "An answer key can only be shared with staff.", path: ["audience"] });

async function reserveVersion(tx: TxClient, user: AuthUser, resource: { id: string; campusId: string }, version: number, description: string, input: z.infer<typeof content>) {
  if ("link" in input) {
    await tx.learningResourceVersion.create({ data: { schoolId: user.schoolId, resourceId: resource.id, version, linkUrl: input.link, description, createdById: user.userId } });
    return { uploadUrl: null };
  }
  const leaf = `${randomUUID()}-${input.fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file"}`;
  const storageKey = `resources/${resource.campusId}/${resource.id}/${leaf}`;
  await tx.learningResourceVersion.create({ data: { schoolId: user.schoolId, resourceId: resource.id, version, storageKey, fileName: input.fileName, contentType: input.contentType, sizeBytes: input.sizeBytes, description, createdById: user.userId } });
  return { uploadUrl: await createPrivateUploadUrl(user, { kind: "resource", targetId: resource.id, storageKey, contentType: input.contentType, sizeBytes: input.sizeBytes, fileName: input.fileName }) };
}

export async function createResource(user: AuthUser, raw: unknown) {
  const input = createInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const klass = await assertAuthor(tx, user, input.classId);
    if (input.subjectId && !(await tx.subject.findFirst({ where: { id: input.subjectId, schoolId: user.schoolId, classId: klass.id }, select: { id: true } }))) throw new ApiError("Choose a subject of this class.", 400);
    if (input.objectives) await assertObjectivesExist(tx, user, klass.id, input.objectives);
    const resource = await tx.learningResource.create({ data: { schoolId: user.schoolId, campusId: klass.campusId, classId: klass.id, subjectId: input.subjectId ?? null, title: input.title, kind: input.kind, audience: input.audience, language: input.language, sourceRights: input.sourceRights, objectives: input.objectives ?? undefined, ownerId: user.userId, latestVersion: 1 } });
    const { uploadUrl } = await reserveVersion(tx, user, resource, 1, input.description, input.content);
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: resource.campusId, tableName: "learning_resources", recordId: resource.id, userId: user.userId, newValue: { status: "DRAFT", version: 1 } } });
    return { resource, uploadUrl };
  });
}

export const versionInput = z.object({ description: z.string().trim().min(10).max(2000), content, expectedLatest: z.number().int().positive() }).strict();
/** Replacing content adds a version; earlier versions stay readable for pinned references. */
export async function addResourceVersion(user: AuthUser, resourceId: string, raw: unknown) {
  const input = versionInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const resource = await authorResource(tx, user, resourceId);
    if (resource.status === "RETIRED") throw new ApiError("Restore is not supported; create a new resource instead.", 409);
    if (resource.latestVersion !== input.expectedLatest) throw new ApiError("Someone added a version meanwhile. Refresh and try again.", 409);
    const version = resource.latestVersion + 1;
    await tx.learningResource.update({ where: { id: resource.id }, data: { latestVersion: version } });
    const { uploadUrl } = await reserveVersion(tx, user, resource, version, input.description, input.content);
    return { version, uploadUrl };
  });
}

/** Called after the browser's PUT: the object must really exist before a version can be published. */
export async function confirmResourceUpload(user: AuthUser, resourceId: string, version: number, read: typeof readPrivateObject = readPrivateObject) {
  return schoolAiTransaction(user, async tx => {
    await authorResource(tx, user, resourceId);
    const row = await tx.learningResourceVersion.findFirst({ where: { schoolId: user.schoolId, resourceId, version } });
    if (!row?.storageKey) throw new ApiError("Version not found.", 404);
    if (row.uploadedAt) return { version, ready: true };
    try { const stream = await read(row.storageKey); await stream.cancel(); }
    catch { throw new ApiError("The file has not finished uploading. Choose the file again.", 409); }
    await tx.learningResourceVersion.update({ where: { id: row.id }, data: { uploadedAt: new Date() } });
    return { version, ready: true };
  });
}

export const publishInput = z.object({ version: z.number().int().positive(), sourceRights: z.string().trim().min(3).max(240).optional() }).strict();
export async function publishResource(user: AuthUser, resourceId: string, raw: unknown) {
  const input = publishInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const resource = await authorResource(tx, user, resourceId);
    if (resource.status === "RETIRED") throw new ApiError("This resource is retired.", 409);
    const row = await tx.learningResourceVersion.findFirst({ where: { schoolId: user.schoolId, resourceId, version: input.version } });
    if (!row) throw new ApiError("Version not found.", 404);
    if (!row.linkUrl && !row.uploadedAt) throw new ApiError("The file for this version is not uploaded yet.", 409);
    const sourceRights = input.sourceRights ?? resource.sourceRights;
    if (!sourceRights.trim()) throw new ApiError("Record where this material comes from and that it may be shared.", 400);
    const updated = await tx.learningResource.update({ where: { id: resource.id }, data: { status: "PUBLISHED", publishedVersion: input.version, sourceRights } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: resource.campusId, tableName: "learning_resources", recordId: resource.id, userId: user.userId, oldValue: { status: resource.status, version: resource.publishedVersion ?? 0 }, newValue: { status: "PUBLISHED", version: input.version } } });
    return updated;
  });
}

export const objectivesInput = z.object({ objectives: objectives.unwrap().unwrap() }).strict();
/** SKO-406: link a resource to objectives of one exact curriculum version; an empty list makes it unmapped review work. */
export async function linkResourceObjectives(user: AuthUser, resourceId: string, raw: unknown) {
  const { objectives: value } = objectivesInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const resource = await authorResource(tx, user, resourceId);
    await assertObjectivesExist(tx, user, resource.classId, value);
    return tx.learningResource.update({ where: { id: resource.id }, data: { objectives: value } });
  });
}

export const audienceInput = z.object({ audience: z.enum(RESOURCE_AUDIENCES) }).strict();
/** Narrowing or widening the audience applies to the next request; nothing was shared by URL. */
export async function changeAudience(user: AuthUser, resourceId: string, raw: unknown) {
  const { audience } = audienceInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const resource = await authorResource(tx, user, resourceId);
    if (resource.kind === "ANSWER_KEY" && audience !== "STAFF") throw new ApiError("An answer key can only be shared with staff.", 400);
    return tx.learningResource.update({ where: { id: resource.id }, data: { audience } });
  });
}

export async function retireResource(user: AuthUser, resourceId: string) {
  return schoolAiTransaction(user, async tx => {
    const resource = await authorResource(tx, user, resourceId);
    const updated = await tx.learningResource.update({ where: { id: resource.id }, data: { status: "RETIRED", retiredAt: new Date() } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: resource.campusId, tableName: "learning_resources", recordId: resource.id, userId: user.userId, oldValue: { status: resource.status }, newValue: { status: "ARCHIVED" } } });
    return updated;
  });
}

/** Private-upload hook: the key must be the reserved, not-yet-uploaded file of a version this author may change. */
export async function assertResourceUploadTarget(tx: TxClient, user: AuthUser, resourceId: string, storageKey: string) {
  const resource = await authorResource(tx, user, resourceId);
  const parts = storageKey.split("/");
  if (parts.length !== 4 || parts[0] !== "resources" || parts[1] !== resource.campusId || parts[2] !== resource.id || !parts[3] || /[\\\x00-\x1f]/.test(storageKey)) throw new ApiError("This upload is unavailable.", 403);
  const version = await tx.learningResourceVersion.findFirst({ where: { schoolId: user.schoolId, resourceId, storageKey, uploadedAt: null }, select: { id: true } });
  if (!version) throw new ApiError("This upload is unavailable.", 403);
}
