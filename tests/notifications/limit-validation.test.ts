import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1319: a non-positive or fractional limit must be a 400, never a silent empty inbox.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
const listed: number[] = [];

mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: {} } });
mock.module(src("lib/auth.ts"), { namedExports: { getAuthUser: async () => ({ userId: "u1", schoolId: "s1" }) } });
mock.module(src("lib/notifications/actions.ts"), {
  namedExports: {
    VIEWS: ["all", "mentions", "actions"],
    listInbox: async (_user: unknown, options: { limit: number }) => { listed.push(options.limit); return { items: [], nextCursor: null }; },
    inboxCounts: async () => ({ unread: 0 }),
  },
});

test("notification limits must be positive integers", async () => {
  const { GET } = await import(src("app/api/notifications/route.ts"));
  const get = (query: string) => GET(new Request(`http://localhost/api/notifications${query}`) as never);
  for (const query of ["?limit=-1", "?limit=0", "?limit=1.5", "?limit=abc"]) {
    assert.equal((await get(query)).status, 400, query);
  }
  assert.equal((await get("")).status, 200);
  assert.equal((await get("?limit=500")).status, 200);
  assert.deepEqual(listed, [20, 50]);
});
