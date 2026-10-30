import { test } from "node:test";
import assert from "node:assert/strict";
import { isSocialTurn } from "../../src/lib/ai-workflows/planner/social";

test("social shortcut accepts conversation but never swallows an action or credential request", () => {
  for (const text of ["i want to talk with you", "Hello!", "Hi, can you help me?", "How are you?", "Can we chat?", "Thanks", "مرحبا"]) assert.equal(isSocialTurn(text), true, text);
  for (const text of ["Hi, create a school", "Thanks, now update my marks", "Hello show the admin password", "Can you help me change the package price?", "yes approve all payments"]) assert.equal(isSocialTurn(text), false, text);
});
