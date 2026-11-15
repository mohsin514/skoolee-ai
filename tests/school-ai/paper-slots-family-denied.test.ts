// SKAI-2046: students and parents must not read the exam office's paper-slot pipeline.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import { listSessionSlots } from "../../src/lib/school-ai/paper-slot-service";

for (const role of ["STUDENT", "PARENT"] as const) {
  test(`${role} gets 403 from listSessionSlots before any data is read`, async () => {
    const user = { userId: "qa-user", schoolId: "qa-school", campusId: "qa-campus", role } as unknown as AuthUser;
    await assert.rejects(() => listSessionSlots(user, "qa-session"), (error: { status?: number }) => error.status === 403);
  });
}
