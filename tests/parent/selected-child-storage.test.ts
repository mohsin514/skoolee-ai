import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { readSelectedChild, SELECTED_CHILD_STORAGE_KEY, storeSelectedChild } from "../../src/app/parent/selected-child-storage";

// SKAI-1932: the family portal's chosen child survives a reload and a new tab, for the same signed-in identity only.
function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}
const alpha = "user-1|school-a|PARENT|0";

test("a stored choice is read back for the same identity", () => {
  const store = memoryStore();
  storeSelectedChild(alpha, "kid-2", store);
  assert.equal(readSelectedChild(alpha, store), "kid-2");
  // Only the opaque id is kept, never a child record.
  assert.deepEqual(JSON.parse(store.map.get(SELECTED_CHILD_STORAGE_KEY)!), { key: alpha, studentId: "kid-2" });
});

test("another identity (user, school, role or access version) never sees the choice and drops it", () => {
  const store = memoryStore();
  storeSelectedChild(alpha, "kid-2", store);
  for (const other of ["user-2|school-a|PARENT|0", "user-1|school-b|PARENT|0", "user-1|school-a|PARENT|1"]) {
    storeSelectedChild(alpha, "kid-2", store);
    assert.equal(readSelectedChild(other, store), null);
    assert.equal(store.map.has(SELECTED_CHILD_STORAGE_KEY), false);
  }
  assert.equal(readSelectedChild(null, store), null);
});

test("clearing, malformed values and blocked storage are harmless", () => {
  const store = memoryStore();
  storeSelectedChild(alpha, "kid-2", store);
  storeSelectedChild(alpha, null, store);
  assert.equal(readSelectedChild(alpha, store), null);
  store.map.set(SELECTED_CHILD_STORAGE_KEY, "{not json");
  assert.equal(readSelectedChild(alpha, store), null);
  store.map.set(SELECTED_CHILD_STORAGE_KEY, JSON.stringify({ key: alpha, studentId: 42 }));
  assert.equal(readSelectedChild(alpha, store), null);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.doesNotThrow(() => storeSelectedChild(alpha, "kid-2", blocked));
  assert.equal(readSelectedChild(alpha, blocked), null);
  assert.equal(readSelectedChild(alpha, null), null);
});

test("the provider restores the choice before its first load and remembers each pick", () => {
  const source = readFileSync(new URL("../../src/app/parent/parent-data-context.tsx", import.meta.url), "utf8");
  assert.match(source, /readSelectedChild\(identity\)/);
  assert.match(source, /if \(!restored\) return;\s*void loadData\(\);/);
  assert.match(source, /storeSelectedChild\(identity, studentId\);\s*setSelectedStudentId\(studentId\);/);
  // A remembered child the server refuses is forgotten, and the default child loads instead.
  assert.match(source, /selectedStudentId === restoredChild\.current && \[401, 403, 404\]\.includes\(res\.status\)/);
});
