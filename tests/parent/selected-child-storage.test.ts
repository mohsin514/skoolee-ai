import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { readSelectedChild, SELECTED_CHILD_STORAGE_KEY, shouldFallBackToDefaultChild, storeSelectedChild } from "../../src/app/parent/selected-child-storage";

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
  // A remembered child, or a ?student= link, the server refuses loads the default child instead (SKAI-1933).
  assert.match(source, /shouldFallBackToDefaultChild\(\{ selected: selectedStudentId, restored: restoredChild\.current, requested: requestedRef\.current, status: res\.status \}\)/);
  assert.match(source, /if \(selectedStudentId === restoredChild\.current\) \{\s*restoredChild\.current = null;\s*storeSelectedChild\(identity, null\);\s*\}\s*setSelectedStudentId\(null\);/);
});

// SKAI-1933: a stale or foreign ?student= link no longer dead-ends at "Couldn't load your portal".
test("a refused ?student= link or remembered child falls back to the default child", () => {
  for (const status of [401, 403, 404]) {
    assert.equal(shouldFallBackToDefaultChild({ selected: "foreign", restored: null, requested: "foreign", status }), true);
    assert.equal(shouldFallBackToDefaultChild({ selected: "kid-2", restored: "kid-2", requested: null, status }), true);
  }
});

test("a child the guardian picked, a default load or a server failure keeps the error and Try again", () => {
  // A child picked from the switcher (neither restored nor in the link) is reported, not silently swapped.
  assert.equal(shouldFallBackToDefaultChild({ selected: "kid-3", restored: "kid-2", requested: "kid-1", status: 403 }), false);
  // The default load (no student id) has nothing to fall back to.
  assert.equal(shouldFallBackToDefaultChild({ selected: null, restored: null, requested: null, status: 403 }), false);
  // Outages are not refusals: the same child is retried.
  for (const status of [500, 502, 503, 429]) {
    assert.equal(shouldFallBackToDefaultChild({ selected: "foreign", restored: null, requested: "foreign", status }), false);
  }
});
