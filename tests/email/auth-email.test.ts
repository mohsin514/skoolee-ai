import assert from "node:assert/strict";
import test from "node:test";
import { render } from "@react-email/render";
import { authEmailCopy, authEmailLanguage } from "../../src/lib/auth/email-copy";
import { VerifyEmail } from "../../src/lib/email/templates/VerifyEmail";
import { PasswordResetEmail } from "../../src/lib/email/templates/PasswordResetEmail";

for (const language of ["en", "ar", "ur"] as const) {
  for (const [kind, template] of [["verify", VerifyEmail], ["reset", PasswordResetEmail]] as const) {
    test(`${kind} email has ${language} copy, direction and a working action/fallback`, async () => {
      const actionUrl = "https://example.invalid/auth?token=synthetic";
      const html = await render(template({ actionUrl, language }));
      const copy = authEmailCopy[language][kind];
      assert.ok(html.includes(`lang="${language}"`));
      assert.ok(html.includes(`dir="${language === "en" ? "ltr" : "rtl"}"`));
      for (const text of [copy.subject, copy.title, copy.action, copy.body, copy.note]) assert.ok(html.includes(text), text);
      assert.equal(html.split(`href="${actionUrl}"`).length - 1, 2);
      assert.ok(!html.includes("→") && !html.includes("&rarr;"), "no orphan decorative arrow");
    });
  }
}
test("stored locale variants normalize and unsupported locales fall back to English", () => {
  assert.equal(authEmailLanguage("AR-SA"), "ar");
  assert.equal(authEmailLanguage("ur-PK"), "ur");
  assert.equal(authEmailLanguage(null), "en");
  assert.equal(authEmailLanguage("de"), "en");
});
