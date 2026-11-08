import { test } from "node:test";
import assert from "node:assert/strict";
import { deletionVersion } from "../../src/lib/destructive/version";
test("snapshot version ignores retrieval ordering but includes edits, scope and dependencies", () => {
  const record = { id: "a", campusId: "north", name: "Library", createdAt: new Date("2024-02-29"), stock: [{ id: "b", quantity: 0 }, { id: "a", quantity: 1 }] };
  assert.equal(deletionVersion(record), deletionVersion({ ...record, stock: [...record.stock].reverse() }));
  for (const change of [{ name: "Renamed" }, { campusId: "south" }, { stock: [{ id: "b", quantity: 2 }] }]) assert.notEqual(deletionVersion(record), deletionVersion({ ...record, ...change }));
});
