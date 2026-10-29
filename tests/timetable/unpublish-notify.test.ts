import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1129: publish fires TIMETABLE_PUBLISHED with classId; unpublish fires no publish notice.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const sent: { event: string; payload: Record<string, unknown> }[] = [];
const data = { class: { id: "class-1", name: "Grade 5" } };

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    requireAuthUser: async () => ({ userId: "u1", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a", fullName: "P" }),
    canManageOperations: () => true,
    canLeadAcademics: async () => true,
    errorResponse: (error: unknown) => Response.json({ error: String(error) }, { status: 500 }),
  },
});
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: {} } });
mock.module(src("lib/notifications/in-app.ts"), {
  namedExports: { notify: (event: string, payload: Record<string, unknown>) => { sent.push({ event, payload }); } },
});
mock.module(src("lib/timetable/notify.ts"), { namedExports: { notifyTimetableVersion: async () => ({ sent: true }) } });
mock.module(src("lib/timetable/manual.ts"), {
  namedExports: {
    resolveTimetableCampus: async () => "campus-a",
    changeManualTimetableStatus: async () => ({ changed: true, data }),
    publishTimetableVersion: async () => ({ data, version: { id: "v1", version: 1, effectiveFrom: new Date("2026-11-01") }, changes: [] }),
    saveManualTimetable: async () => ({}),
    deleteManualTimetable: async () => data,
    previewTimetablePublish: async () => ({}),
    TimetableValidationError: class extends Error {},
  },
});

const put = async (body: unknown) => {
  const { PUT } = await import("../../src/app/api/timetable/[id]/route");
  return PUT(new Request("http://local/api/timetable/t1", { method: "PUT", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: "t1" }) });
};

beforeEach(() => { sent.length = 0; });

test("publish notifies TIMETABLE_PUBLISHED with classId", async () => {
  const res = await put({ action: "publish" });
  assert.equal(res.status, 200);
  assert.deepEqual(sent.map(item => item.event), ["TIMETABLE_PUBLISHED"]);
  assert.equal(sent[0].payload.classId, "class-1");
});

test("unpublish sends no publish notice", async () => {
  const res = await put({ action: "unpublish" });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});
