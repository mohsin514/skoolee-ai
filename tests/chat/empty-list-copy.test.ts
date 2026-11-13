import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyListCopy } from "../../src/components/chat/empty-list-copy";
import { arabicWorkflowUi, urduWorkflowUi } from "../../src/lib/locale/workflow-ui-messages";

// SKAI-1939: a search with no results says "no matches", not the first-run empty inbox.
const ui = (key: string) => key;

test("an active search with no results shows no-matches copy and no New message button", () => {
  for (const filter of ["all", "unread", "archived"] as const) {
    const copy = emptyListCopy(filter, "zzznomatch", ui);
    assert.equal(copy.title, "No matching conversations");
    assert.equal(copy.body, "Try a different name or word.");
    assert.equal(copy.showNewMessage, false);
  }
});

test("a whitespace-only search is not a search, matching the provider's trimmed query", () => {
  assert.deepEqual(emptyListCopy("all", "   ", ui), emptyListCopy("all", "", ui));
});

test("without a search the filter empty states are unchanged", () => {
  assert.deepEqual(emptyListCopy("all", "", ui), {
    title: "No conversations yet",
    body: "Start one with a colleague, a teacher, or the office.",
    showNewMessage: true,
  });
  assert.equal(emptyListCopy("unread", "", ui).title, "Nothing unread");
  assert.equal(emptyListCopy("unread", "", ui).showNewMessage, false);
  assert.equal(emptyListCopy("archived", "", ui).title, "No archived chats");
  assert.equal(emptyListCopy("archived", "", ui).showNewMessage, false);
});

test("the no-matches copy is translated for Arabic and Urdu", () => {
  for (const key of ["No matching conversations", "Try a different name or word."]) {
    assert.ok(arabicWorkflowUi[key], `missing Arabic for ${key}`);
    assert.ok(urduWorkflowUi[key], `missing Urdu for ${key}`);
  }
});
