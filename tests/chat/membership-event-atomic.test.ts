import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1581: a membership change and its system event commit or fail together.
const src = readFileSync("src/lib/chat/service.ts", "utf8");
const body = (name: string) => src.slice(src.indexOf(`export async function ${name}(`), src.indexOf("\nexport async function", src.indexOf(`export async function ${name}(`) + 10));

test("systemMessage writes through the caller's transaction", () => {
  assert.match(src, /async function systemMessage\(db: TxClient, user: AuthUser, conversationId: string, body: string\)/);
  assert.match(src, /await db\.chatMessage\.create\(/);
  assert.match(src, /await db\.conversation\.update\(/);
  assert.equal(/systemMessage\(\s*user,/.test(src), false, "no caller passes the global client");
});

for (const [fn, write] of [["addMembers", "tx.conversationMember.createMany"], ["removeMember", "tx.conversationMember.updateMany"]] as const) {
  test(`${fn} writes membership and the event inside one inTenant transaction`, () => {
    const b = body(fn);
    const open = b.indexOf("await inTenant(user, async (tx) => {");
    const w = b.indexOf(write);
    const evt = b.indexOf("await systemMessage(\n");
    const close = b.indexOf("\n  });", evt);
    assert.ok(open > 0 && open < w && w < evt && evt < close, fn);
  });
}

test("group creation records its event inside the creating transaction", () => {
  assert.match(src, /await systemMessage\(tx, user, conversation\.id, `\$\{user\.fullName \?\? "A member"\} created this conversation`\);\n    return conversation;/);
});
