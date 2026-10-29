// SKAI-937 / SKAI-944: invitation emails must not carry spam signals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMimeMessage } from "../../src/lib/email/smtp";
import { buildInviteEmailCopy } from "../../src/lib/email";

const URL = "https://dev.skooleeai.com/accept-invite?token=t";

function headersOf(raw: string) {
  return raw.split("\r\n\r\n")[0];
}

function message(extra: Record<string, string> = {}) {
  return buildMimeMessage(
    { from: { email: "noreply@skooleeai.com", name: "QA-01 Campus via Skoolee AI" }, to: "a@example.test", subject: "Hi", html: "<p>Hi</p>", text: "Hi", ...extra },
    ["a@example.test"],
  );
}

test("multipart/alternative with plain-text and HTML parts", () => {
  const { raw } = message();
  assert.match(raw, /Content-Type: multipart\/alternative; boundary="([^"]+)"/);
  const boundary = raw.match(/boundary="([^"]+)"/)![1];
  assert.equal(raw.split(`--${boundary}\r\n`).length - 1, 2);
  assert.ok(raw.indexOf("text/plain") < raw.indexOf("text/html"), "plain text first, HTML last");
  assert.ok(raw.trimEnd().endsWith(`--${boundary}--`));
});

test("Message-ID uses the sender domain and Reply-To defaults to a monitored inbox", () => {
  const { raw, messageId } = message();
  assert.match(messageId, /^<[0-9a-f-]+@skooleeai\.com>$/);
  assert.match(headersOf(raw), /\r\nReply-To: support@skooleeai\.com\r\n/);
  assert.match(headersOf(raw), /\r\nDate: /);
});

test("no bulk-mail or fake opt-out headers on transactional mail", () => {
  const head = headersOf(message().raw);
  assert.doesNotMatch(head, /Precedence:/i);
  assert.doesNotMatch(head, /List-Unsubscribe:/i);
  assert.doesNotMatch(head, /X-Priority|Importance/i);
});

test("List-Unsubscribe only when the caller supplies one", () => {
  const head = headersOf(message({ listUnsubscribe: "<https://dev.skooleeai.com/u/x>" }).raw);
  assert.match(head, /List-Unsubscribe: <https:\/\/dev\.skooleeai\.com\/u\/x>/);
});

for (const role of ["CAMPUS_ADMIN", "PRINCIPAL", "PARENT"]) {
  test(`${role} invite copy names the platform and has a full text part`, () => {
    const copy = buildInviteEmailCopy(role, "QA-01 Campus", URL);
    assert.equal(copy.fromName, "QA-01 Campus via Skoolee AI");
    assert.match(copy.subject, /account for QA-01 Campus$/);
    assert.doesNotMatch(copy.subject, /invited|access|free|urgent|!/i);
    assert.ok(copy.text.includes(URL));
    assert.ok(copy.text.length > 250, "text part carries the same message as the HTML");
  });
}
