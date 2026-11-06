// SKAI-502: notification emails pass rendered HTML into MessageEmail. React Email's
// Section already renders table children, so dangerouslySetInnerHTML on it threw
// "Can only set one of `children` or `props.dangerouslySetInnerHTML`" and every
// such email was logged FAILED before it reached the provider.
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/components";
import { MessageEmail } from "../../src/lib/email/templates/MessageEmail";

test("an HTML notification body renders inside the email", async () => {
  const out = await render(MessageEmail({ subject: "Review pending", html: "<p>Synthetic <strong>review</strong> is waiting.</p>" }));
  assert.match(out, /Synthetic <strong>review<\/strong> is waiting\./);
});

test("unsafe markup in the HTML body is still sanitised", async () => {
  const out = await render(MessageEmail({ subject: "Review pending", html: "<p>Hello</p><script>alert(1)</script>" }));
  assert.match(out, /Hello/);
  assert.doesNotMatch(out, /<script>/);
});

test("a plain-text body still renders as paragraphs", async () => {
  const out = await render(MessageEmail({ subject: "Notice", text: "First block.\n\nSecond block." }));
  assert.match(out, /First block\./);
  assert.match(out, /Second block\./);
});
