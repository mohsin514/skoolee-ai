import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1259: stage templates and bulk family messages stay inside one school and campus, skip closed
// applications, fill merge fields per application, and are refused to non-staff roles.

type App = { id: string; schoolId: string; campusId: string; status: string; reference: string; childName: string };
type Event = { schoolId: string; applicationId: string; kind: string; familyMessage: string; actorId: string };
const apps: App[] = [
  { id: "a1", schoolId: "school-a", campusId: "campus-a", status: "OFFERED", reference: "ADM-1", childName: "Sara Example" },
  { id: "a2", schoolId: "school-a", campusId: "campus-a", status: "WAITLISTED", reference: "ADM-2", childName: "" },
  { id: "a3", schoolId: "school-a", campusId: "campus-a", status: "WITHDRAWN", reference: "ADM-3", childName: "Closed Child" },
  { id: "b1", schoolId: "school-a", campusId: "campus-b", status: "OFFERED", reference: "ADM-4", childName: "Other Campus" },
  { id: "s2", schoolId: "school-b", campusId: "campus-a", status: "OFFERED", reference: "ADM-5", childName: "Other School" },
];
let events: Event[] = [];

const fakeDb = {
  admissionApplication: {
    findMany: async ({ where }: { where: { id: { in: string[] }; schoolId: string; campusId: string; status: { in: string[] } } }) =>
      apps.filter(a => where.id.in.includes(a.id) && a.schoolId === where.schoolId && a.campusId === where.campusId && where.status.in.includes(a.status)),
  },
  admissionApplicationEvent: { create: async ({ data }: { data: Event }) => { events.push(data); return data; } },
};

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
mock.module("@/lib/api/scope", { namedExports: {
  ApiError,
  assertStaffRole: (user: { role: string }) => { if (["PARENT", "STUDENT"].includes(user.role)) throw new ApiError("Forbidden", 403); },
  assertPermission: async (user: { role: string }) => { if (user.role === "TEACHER") throw new ApiError("Forbidden", 403); },
} });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_user: unknown, work: (db: unknown) => Promise<unknown>) => work(fakeDb) } });

const load = () => import("@/lib/admissions/family-messages");
const user = (role: string, schoolId = "school-a") => ({ userId: "staff-1", role, schoolId }) as never;

test("templates fit the stage and fill merge fields", async () => {
  const { templatesFor, renderFamilyMessage, STAGE_TEMPLATES } = await load();
  assert.ok(templatesFor("WAITLISTED").some(t => t.key === "waitlist"));
  assert.ok(!templatesFor("ENROLLED").length);
  assert.equal(templatesFor(null).length, STAGE_TEMPLATES.length);
  assert.equal(renderFamilyMessage("Hi {child}, ref {reference} {other}", { childName: "Sara", reference: "ADM-1" }), "Hi Sara, ref ADM-1 {other}");
  assert.equal(renderFamilyMessage("{child}", { childName: " ", reference: "R" }), "your child");
});

test("a bulk message reaches only open applications in this school and campus", async () => {
  events = [];
  const { sendFamilyMessages } = await load();
  const result = await sendFamilyMessages(user("RECEPTIONIST"), "campus-a", { ids: ["a1", "a2", "a3", "b1", "s2", "a1"], message: "Dear family of {child} ({reference})" });
  assert.deepEqual(result, { sent: 2, skipped: 3 });
  assert.deepEqual(events.map(e => [e.applicationId, e.kind, e.familyMessage, e.schoolId]), [
    ["a1", "MESSAGE", "Dear family of Sara Example (ADM-1)", "school-a"],
    ["a2", "MESSAGE", "Dear family of your child (ADM-2)", "school-a"],
  ]);
});

test("the other school sends nothing to school A's applications", async () => {
  events = [];
  const { sendFamilyMessages } = await load();
  const result = await sendFamilyMessages(user("CAMPUS_ADMIN", "school-b"), "campus-a", { ids: ["a1", "a2", "s2"], message: "Hello {child}" });
  assert.deepEqual(result, { sent: 1, skipped: 2 });
  assert.deepEqual(events.map(e => e.applicationId), ["s2"]);
});

test("denied roles and invalid input are refused before anything is written", async () => {
  events = [];
  const { sendFamilyMessages } = await load();
  await assert.rejects(sendFamilyMessages(user("PARENT"), "campus-a", { ids: ["a1"], message: "Hello" }), /Forbidden/);
  await assert.rejects(sendFamilyMessages(user("TEACHER"), "campus-a", { ids: ["a1"], message: "Hello" }), /Forbidden/);
  await assert.rejects(sendFamilyMessages(user("RECEPTIONIST"), "campus-a", { ids: [], message: "Hello" }), /at least one/);
  await assert.rejects(sendFamilyMessages(user("RECEPTIONIST"), "campus-a", { ids: ["a1"], message: " " }), /Write the message/);
  await assert.rejects(sendFamilyMessages(user("RECEPTIONIST"), "campus-a", { ids: Array.from({ length: 201 }, (_, i) => `x${i}`), message: "Hello" }), /at most 200/);
  assert.equal(events.length, 0);
});
