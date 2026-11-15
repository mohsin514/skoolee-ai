import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2049: a REVOKED relationship cannot be moved back to ACTIVE (or any other status) through the API.
const events: unknown[] = [];
const rel = { id: "rel-1", schoolId: "school-a", studentId: "kid-a", email: "qa.guardian@example.test", status: "REVOKED", verifiedAt: new Date(), fullName: "QA Guardian One", accessVersions: [] as never[] };
const current = { userId: "reg-1", schoolId: "school-a", campusId: "campus-a1", role: "CAMPUS_ADMIN" };
const prisma = {
  student: { findFirst: async () => ({ id: "kid-a", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Pupil A" }) },
  guardianRelationship: { findFirst: async () => rel },
  guardianAccessEvent: { create: async ({ data }: { data: { id: string } }) => { events.push(data); return { id: data.id }; } },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
    canManageAcademics: () => true,
    canManageCampusOps: () => true,
    errorResponse: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    requireAuthUser: async () => current,
  },
});
mock.module("@/lib/auth/policy", { namedExports: { studentScope: (u: { schoolId: string }) => ({ schoolId: u.schoolId }) } });
mock.module("@/lib/permissions", { namedExports: { assertPermission: async () => {} } });
mock.module("@/lib/api/validate", { namedExports: { readJsonBody: async (r: { body: unknown }) => r.body } });

const perms = { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false, consents: { medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false } };
const post = async (status: string) => {
  const { POST } = await import("../../src/app/api/students/[id]/guardians/route");
  const body = { action: "preview", relationshipId: "rel-1", fullName: "QA Guardian One", email: rel.email, relationship: "mother", permissions: perms, status, reason: "Synthetic reactivation probe" };
  const res = await POST({ body } as never, { params: Promise.resolve({ id: "kid-a" }) });
  return { status: res.status, json: await res.json() as { error?: string } };
};

for (const status of ["ACTIVE", "SUSPENDED"]) {
  test(`REVOKED -> ${status} is refused with 409 before anything is written`, async () => {
    events.length = 0;
    const res = await post(status);
    assert.equal(res.status, 409);
    assert.match(res.json.error ?? "", /revoked/i);
    assert.equal(events.length, 0);
  });
}
