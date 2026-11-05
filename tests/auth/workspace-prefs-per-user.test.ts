// SKAI-1780: workspace preferences are keyed per signed-in user and cleared on sign-out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { workspacePrefKey, clearWorkspacePrefs } from "@/lib/ui/workspace-pref-storage";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

test("two users on one browser never read each other's preferences", () => {
  const storage = memoryStorage();
  const a = workspacePrefKey("students", "qa01-user-a")!;
  const b = workspacePrefKey("students", "qa01-user-b")!;
  storage.setItem(a, JSON.stringify({ view: "table", density: "compact", perPage: 50 }));
  assert.notEqual(a, b);
  assert.equal(storage.getItem(b), null);
});

test("same user keeps their preferences across reloads", () => {
  const storage = memoryStorage();
  storage.setItem(workspacePrefKey("faculty", "qa01-user-a")!, "{\"view\":\"table\"}");
  assert.equal(storage.getItem(workspacePrefKey("faculty", "qa01-user-a")!), "{\"view\":\"table\"}");
});

test("an unknown user (signed out / session loading) gets no key, so nothing is read or written", () => {
  assert.equal(workspacePrefKey("students", null), null);
  assert.equal(workspacePrefKey("students", ""), null);
});

test("sign-out clears every workspace key, including legacy unkeyed ones, and leaves other storage alone", () => {
  const storage = memoryStorage();
  storage.setItem("skoolee.workspace.students", "{}");
  storage.setItem(workspacePrefKey("students", "qa01-user-a")!, "{}");
  storage.setItem(workspacePrefKey("focus", "qa02-user-c")!, "1");
  storage.setItem("skoolee:offline:v1:qa01-user-a", "[]");
  storage.setItem("skoolee.locale", "ar");
  clearWorkspacePrefs(storage);
  assert.equal(storage.length, 2);
  assert.equal(storage.getItem("skoolee:offline:v1:qa01-user-a"), "[]");
  assert.equal(storage.getItem("skoolee.locale"), "ar");
});

test("blocked storage does not throw on sign-out", () => {
  const broken = { get length(): number { throw new Error("blocked"); } } as unknown as Storage;
  assert.doesNotThrow(() => clearWorkspacePrefs(broken));
});
