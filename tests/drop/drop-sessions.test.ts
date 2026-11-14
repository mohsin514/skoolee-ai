import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-1847: Skoolee Drop sessions. Only the creator sees a session; a phone link only adds files to its own
// open session, with type, signature, size and count limits; another school never resolves.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

type Row = Record<string, unknown> & { id: string };
const tables: Record<"dropSession" | "dropItem", Row[]> = { dropSession: [], dropItem: [] };
const stored = new Map<string, Uint8Array>();
const deletes: string[] = [], failingKeys = new Set<string>();
let nextId = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`;
const matches = (row: Row, where: Record<string, unknown> = {}) => Object.entries(where).every(([key, value]) =>
  value && typeof value === "object" && !(value instanceof Date) && "in" in value ? (value as { in: unknown[] }).in.includes(row[key])
    : value && typeof value === "object" && !(value instanceof Date) && "lt" in value ? (row[key] as Date) < (value as { lt: Date }).lt : row[key] === value);
const model = (name: keyof typeof tables) => ({
  create: async ({ data }: { data: Omit<Row, "id"> }) => { const row: Row = { status: "OPEN", createdAt: new Date(), ...data, id: uuid() }; tables[name].push(row); return row; },
  findFirst: async ({ where }: { where: Record<string, unknown> }) => tables[name].find(row => matches(row, where)) ?? null,
  findMany: async ({ where, take }: { where?: Record<string, unknown>; take?: number }) => tables[name].filter(row => matches(row, where)).slice(0, take ?? 1000)
    .map(row => name === "dropSession" ? { ...row, items: tables.dropItem.filter(item => item.sessionId === row.id) } : row),
  count: async ({ where }: { where: Record<string, unknown> }) => tables[name].filter(row => matches(row, where)).length,
  update: async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(tables[name].find(row => row.id === where.id)!, data),
  delete: async ({ where }: { where: { id: string } }) => { tables[name] = tables[name].filter(row => row.id !== where.id); if (name === "dropSession") tables.dropItem = tables.dropItem.filter(row => row.sessionId !== where.id); },
  deleteMany: async ({ where }: { where: Record<string, unknown> }) => { tables[name] = tables[name].filter(row => !matches(row, where)); },
});
const prisma = { dropSession: model("dropSession"), dropItem: model("dropItem"), $queryRaw: async () => [], $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma) };
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/storage/s3.ts"), { namedExports: {
  uploadPrivateObject: async (key: string, bytes: Uint8Array) => { stored.set(key, bytes); },
  deleteFile: async (key: string) => { deletes.push(key); if (failingKeys.has(key)) throw new Error("S3 unavailable"); stored.delete(key); },
} });

const user = (userId: string, schoolId = "school-a", role = "TEACHER"): AuthUser => ({ userId, schoolId, campusId: `campus-${schoolId}`, role, email: "synthetic@example.invalid", accessVersion: 1 } as AuthUser);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode("%PDF-1.7 synthetic");

test("drop sessions", async t => {
  const drop = await import("../../src/lib/drop/service");
  const teacher = user("teacher-a"), sameSchool = user("teacher-b"), otherSchool = user("teacher-c", "school-b");
  const { session, ticket } = await drop.createDropSession(teacher, { label: "Marks sheet", accept: ["image/jpeg"], maxFiles: 2 });
  const phone = <T>(fn: (s: Parameters<Parameters<typeof drop.withPhoneSession>[1]>[0]) => Promise<T>) => drop.withPhoneSession(ticket, fn);

  await t.test("only the creator can see the session, from either school", async () => {
    assert.equal((await drop.getDropSession(teacher, session.id)).label, "Marks sheet");
    for (const other of [sameSchool, otherSchool]) await assert.rejects(drop.getDropSession(other, session.id), { status: 404 });
    await assert.rejects(drop.closeDropSession(otherSchool, session.id), { status: 404 });
  });

  await t.test("the platform operator cannot open one", async () => {
    await assert.rejects(drop.createDropSession(user("owner", "school-a", "APP_OWNER"), { label: "x", accept: ["image/jpeg"] }), { status: 403 });
  });

  await t.test("the phone sees only the label and limits", async () => {
    assert.deepEqual(Object.keys(await phone(async s => drop.phoneView(s))).sort(), ["accept", "expiresAt", "label", "maxFiles", "received"]);
  });

  await t.test("the phone adds an accepted file into private staging", async () => {
    const added = await phone(s => drop.addPhoneItem(s, { fileName: "page 1.jpeg", contentType: "image/jpeg", bytes: JPEG }));
    assert.equal(added.duplicate, false);
    const item = tables.dropItem[0];
    assert.match(String(item.storageKey), new RegExp(`^drop/school-a/${session.id}/[0-9a-f]{32}$`));
    assert.equal(item.fileName, "page 1.jpg");
    assert.equal((await drop.dropItemForCreator(teacher, session.id, added.id)).id, added.id);
    await assert.rejects(drop.dropItemForCreator(sameSchool, session.id, added.id), { status: 404 });
  });

  await t.test("the same photo twice is stored once", async () => {
    assert.equal((await phone(s => drop.addPhoneItem(s, { fileName: "again.jpg", contentType: "image/jpeg", bytes: JPEG }))).duplicate, true);
    assert.equal(tables.dropItem.length, 1);
  });

  await t.test("types, signatures and limits are enforced", async () => {
    await assert.rejects(phone(s => drop.addPhoneItem(s, { fileName: "a.pdf", contentType: "application/pdf", bytes: PDF })), { status: 415 });
    await assert.rejects(phone(s => drop.addPhoneItem(s, { fileName: "fake.jpg", contentType: "image/jpeg", bytes: PDF })), { status: 415 });
    await assert.rejects(phone(s => drop.addPhoneItem(s, { fileName: "big.jpg", contentType: "image/jpeg", bytes: new Uint8Array(drop.MAX_DROP_BYTES + 1).fill(0xff) })), { status: 413 });
    await phone(s => drop.addPhoneItem(s, { fileName: "two.jpg", contentType: "image/jpeg", bytes: new Uint8Array([...JPEG, 9]) }));
    await assert.rejects(phone(s => drop.addPhoneItem(s, { fileName: "three.jpg", contentType: "image/jpeg", bytes: new Uint8Array([...JPEG, 8]) })), { status: 409 });
  });

  await t.test("a forged or foreign link is refused", async () => {
    const forged = ticket.slice(0, -4) + (ticket.endsWith("AAAA") ? "BBBB" : "AAAA");
    await assert.rejects(drop.withPhoneSession(forged, async () => null), { status: 403 });
    const other = await drop.createDropSession(otherSchool, { label: "Other", accept: ["image/jpeg"] });
    await assert.rejects(drop.getDropSession(teacher, other.session.id), { status: 404 });
  });

  await t.test("discarding and closing remove staged files and stop the phone", async () => {
    const [first] = tables.dropItem;
    await drop.discardDropItem(teacher, session.id, first.id);
    assert.equal(stored.has(String(first.storageKey)), false);
    await drop.closeDropSession(teacher, session.id);
    assert.equal(tables.dropItem.filter(item => item.sessionId === session.id).length, 0);
    await assert.rejects(phone(async s => drop.phoneView(s)), { status: 403 });
  });

  await t.test("an expired session refuses the phone and is purged later", async () => {
    const fresh = await drop.createDropSession(teacher, { label: "Paper", accept: ["application/pdf"] });
    await drop.withPhoneSession(fresh.ticket, s => drop.addPhoneItem(s, { fileName: "paper.pdf", contentType: "application/pdf", bytes: PDF }));
    const row = tables.dropSession.find(s => s.id === fresh.session.id)!;
    row.expiresAt = new Date(Date.now() - 2 * 3600_000);
    await assert.rejects(drop.withPhoneSession(fresh.ticket, async () => null), { status: 403 });
    const result = await drop.purgeExpiredDrops();
    assert.equal(result.failed, 0);
    assert.equal(tables.dropSession.some(s => s.id === fresh.session.id), false);
    assert.equal([...stored.keys()].some(key => key.includes(fresh.session.id)), false);
  });

  await t.test("SKAI-1970: purge deletes in parallel and keeps a session whose objects could not all be removed", async () => {
    const make = async (label: string, files: number) => {
      const s = await drop.createDropSession(teacher, { label, accept: ["application/pdf"], maxFiles: Math.max(files, 1) });
      for (let i = 0; i < files; i++) await drop.withPhoneSession(s.ticket, p => drop.addPhoneItem(p, { fileName: `${i}.pdf`, contentType: "application/pdf", bytes: new TextEncoder().encode(`%PDF-1.7 ${label} ${i}`) }));
      tables.dropSession.find(r => r.id === s.session.id)!.expiresAt = new Date(Date.now() - 2 * 3600_000);
      return s.session.id;
    };
    const ok = await make("ok", 3), broken = await make("broken", 2), empty = await make("empty", 0);
    failingKeys.add(String(tables.dropItem.find(item => item.sessionId === broken)!.storageKey));
    deletes.length = 0;
    const result = await drop.purgeExpiredDrops();
    assert.deepEqual(result, { removed: 2, failed: 1 });
    assert.equal(deletes.length, 5, "every staged key is attempted once");
    assert.deepEqual(tables.dropSession.filter(r => [ok, broken, empty].includes(r.id)).map(r => r.id), [broken], "the failed session stays for the next run");
    failingKeys.clear();
    assert.deepEqual(await drop.purgeExpiredDrops(), { removed: 1, failed: 0 });
    // A spent time budget leaves the rest, row and objects, for the next run.
    const late = await make("late", 1);
    assert.deepEqual(await drop.purgeExpiredDrops(new Date(), 200, -1), { removed: 0, failed: 0 });
    assert.ok(tables.dropSession.some(r => r.id === late));
    assert.deepEqual(await drop.purgeExpiredDrops(), { removed: 1, failed: 0 });
  });
});
