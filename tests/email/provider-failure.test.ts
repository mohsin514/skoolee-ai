// SKAI-745: an unreachable mail provider must return a failure, not crash the process.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { sendEmailMessage } from "../../src/lib/email";
import { sendSmtpMail } from "../../src/lib/email/smtp";

async function closedPort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test("sendSmtpMail rejects when the provider refuses the connection", async () => {
  const port = await closedPort();
  await assert.rejects(
    sendSmtpMail(
      { host: "127.0.0.1", port, secure: false, startTls: false, rejectUnauthorized: true },
      { from: { email: "noreply@example.test" }, to: "a@example.test", subject: "Hi", html: "<p>Hi</p>" },
    ),
    /ECONNREFUSED/,
  );
});

test("sendEmailMessage returns success:false with a reason when SMTP is unreachable", async () => {
  const port = await closedPort();
  const saved = { ...process.env };
  delete process.env.EMAIL_DEV_MODE;
  delete process.env.DISABLE_OUTBOUND_MESSAGES;
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_SECURE: "false", SMTP_STARTTLS: "false", SMTP_USER: "qa@example.test", SMTP_PASS: "qa-test" });
  try {
    const result = await sendEmailMessage({ to: "a@example.test", subject: "Hi", text: "Hi" });
    assert.equal(result.success, false);
    assert.match(String(result.error), /ECONNREFUSED/);
  } finally {
    process.env = saved;
  }
});
