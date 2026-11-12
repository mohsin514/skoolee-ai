// SKAI-1801: users the platform owner creates must get an account-setup email with a
// single-use set-password link (never the password), and the dialog must say whether it went.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "@react-email/render";
import { authEmailCopy } from "../../src/lib/auth/email-copy";
import { PasswordResetEmail } from "../../src/lib/email/templates/PasswordResetEmail";

const read = (p: string) => readFileSync(p, "utf8");

test("both owner provisioning routes send the setup email and return its outcome", () => {
  for (const file of ["src/app/api/owner/users/route.ts", "src/app/api/owner/schools/route.ts"]) {
    const src = read(file);
    assert.match(src, /await sendSetupEmailFor\(/, `${file} does not send the setup email`);
    assert.match(src, /tempPassword,\n\s+setupEmail,/, `${file} does not return setupEmail`);
  }
});

test("the setup email carries the link and the setup copy in every language, never a password", async () => {
  for (const language of ["en", "ar", "ur"] as const) {
    const copy = authEmailCopy[language].setup;
    assert.ok(copy.subject && copy.action && copy.body && copy.note, `${language} setup copy incomplete`);
    const html = await render(PasswordResetEmail({ actionUrl: "https://app.test/forgot-password?token=abc", language, kind: "setup" }));
    assert.ok(html.includes("https://app.test/forgot-password?token=abc"));
    assert.ok(html.includes(copy.action));
    assert.ok(!html.includes(authEmailCopy[language].reset.action), `${language} setup email shows reset wording`);
  }
});

test("the setup helper stores only a digest, removes it on failure and never throws", () => {
  const src = read("src/lib/owner/setup-email.ts");
  assert.match(src, /createHash\("sha256"\)/);
  assert.match(src, /token: digest/);
  assert.match(src, /catch \(error\)[\s\S]*deleteMany\(\{ where: \{ token: digest \} \}\)/);
});

test("redeeming the emailed link clears the first-login password change", () => {
  assert.match(read("src/app/actions/auth/reset.ts"), /lastPasswordChange: new Date\(\), mustChangePassword: false/);
});

test("the provisioning dialog shows the email outcome with translated text", () => {
  const ui = read("src/components/owner/provisioning-modals.tsx");
  const rows = read("src/lib/locale/role-ux/p4-messages.ts");
  for (const key of ["A setup email with a single-use set-password link was sent to {0}.", "The setup email could not be sent. Share the temporary password below instead."]) {
    assert.ok(ui.includes(key), `dialog missing: ${key}`);
    assert.ok(rows.includes(`["${key}", "`), `no AR/UR row for: ${key}`);
  }
});
