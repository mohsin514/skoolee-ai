import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1700: a template edit carries the draft version the admin saw; a stale save gets 409 and keeps the newer draft.
type Row = { id: string; schoolId: string; campusId: string; name: string; draftVersion: number; layoutJson: { title: string } };
let rows: Row[] = [];
const scoped = (r: Row, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v);
const prisma = {
  certificateTemplate: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => { const r = rows.find(x => scoped(x, where)); return r ? { ...r } : null; },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> & { layoutJson: { title: string } } }) => {
      const hit = rows.filter(r => scoped(r, where));
      for (const r of hit) { r.name = String(data.name); r.layoutJson = data.layoutJson; r.draftVersion += 1; }
      return { count: hit.length };
    },
    create: async ({ data }: { data: Omit<Row, "id" | "draftVersion"> }) => { const r = { id: `t${rows.length + 1}`, draftVersion: 1, ...data }; rows.push(r); return r; },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });

const admin = (school: "a" | "b", role = "CAMPUS_ADMIN") => ({ userId: `adm-${school}`, schoolId: `school-${school}`, campusId: `campus-${school}1`, role }) as never;
const form = (title: string, extra: Record<string, unknown> = {}) => ({ kind: "STUDENT_CERTIFICATE", name: `Template ${title}`, language: "en", title, body: "Certified: {{studentName}} studies here.", ...extra });
const reset = () => { rows = [{ id: "t-a", schoolId: "school-a", campusId: "campus-a1", name: "A", draftVersion: 1, layoutJson: { title: "Original" } }, { id: "t-b", schoolId: "school-b", campusId: "campus-b1", name: "B", draftVersion: 1, layoutJson: { title: "Other school" } }]; };
const conflict = (e: { status?: number }) => e.status === 409;

test("a new template and an edit on the current draft version both save", async () => {
  const { saveTemplate } = await import("../../src/lib/certificates/service");
  reset();
  const created = await saveTemplate(admin("a"), "campus-a1", form("Fresh"));
  assert.equal(created.draftVersion, 1);
  const edited = await saveTemplate(admin("a"), "campus-a1", form("Edited", { id: "t-a", expectedDraftVersion: 1 }));
  assert.equal(edited.draftVersion, 2);
  assert.equal(rows[0].layoutJson.title, "Edited");
});

test("a stale second session gets 409 and the first edit is kept", async () => {
  const { saveTemplate } = await import("../../src/lib/certificates/service");
  reset();
  await saveTemplate(admin("a"), "campus-a1", form("Tab A", { id: "t-a", expectedDraftVersion: 1 }));
  await assert.rejects(saveTemplate(admin("a"), "campus-a1", form("Tab B", { id: "t-a", expectedDraftVersion: 1 })), conflict);
  await assert.rejects(saveTemplate(admin("a"), "campus-a1", form("Tab B", { id: "t-a" })), conflict);
  assert.equal(rows[0].layoutJson.title, "Tab A");
  assert.equal(rows[0].draftVersion, 2);
});

test("another school or campus cannot reach the template", async () => {
  const { saveTemplate } = await import("../../src/lib/certificates/service");
  reset();
  await assert.rejects(saveTemplate(admin("b"), "campus-b1", form("Intruder", { id: "t-a", expectedDraftVersion: 1 })), (e: { status?: number }) => e.status === 404);
  await assert.rejects(saveTemplate(admin("a"), "campus-a2", form("Intruder", { id: "t-a", expectedDraftVersion: 1 })), (e: { status?: number }) => e.status === 404);
  assert.deepEqual(rows.map(r => r.layoutJson.title), ["Original", "Other school"]);
});

test("a role without the front desk is refused with 403", async () => {
  const { saveTemplate } = await import("../../src/lib/certificates/service");
  reset();
  await assert.rejects(saveTemplate(admin("a", "TEACHER"), "campus-a1", form("Intruder", { id: "t-a", expectedDraftVersion: 1 })), (e: { status?: number }) => e.status === 403);
  assert.equal(rows[0].draftVersion, 1);
});
