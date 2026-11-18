// SKAI-2267: once the server answers 250 to DATA the message is accepted. A dropped or refused
// QUIT afterwards must not turn a delivered email into a "could not send" warning.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { sendSmtpMail } from "../../src/lib/email/smtp";

/** A minimal fake SMTP server. `onQuit` decides how it treats QUIT. */
async function fakeSmtp(onQuit: (socket: net.Socket) => void) {
  const server = net.createServer((socket) => {
    let inData = false;
    let buffer = "";
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index: number;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 2.0.0 OK queued\r\n");
          }
          continue;
        }
        if (line.startsWith("EHLO")) socket.write("250 fake\r\n");
        else if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO")) socket.write("250 OK\r\n");
        else if (line === "DATA") {
          inData = true;
          socket.write("354 go ahead\r\n");
        } else if (line === "QUIT") onQuit(socket);
      }
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as net.AddressInfo).port };
}

const mail = { from: { email: "noreply@example.test" }, to: "owner@example.test", subject: "Verify", html: "<p>Verify</p>" };

for (const [name, onQuit] of [
  ["drops the connection on QUIT", (socket: net.Socket) => socket.destroy()],
  ["answers QUIT with an error code", (socket: net.Socket) => socket.end("421 closing\r\n")],
] as const) {
  test(`sendSmtpMail resolves when the server accepted DATA and then ${name}`, async () => {
    const { server, port } = await fakeSmtp(onQuit);
    try {
      const result = await sendSmtpMail({ host: "127.0.0.1", port, secure: false, startTls: false, rejectUnauthorized: true }, mail);
      assert.match(result.id, /^<.+@.+>$/);
    } finally {
      server.close();
    }
  });
}

test("sendSmtpMail still rejects when the server refuses the message itself", async () => {
  const server = net.createServer((socket) => {
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      const line = chunk.toString("utf8");
      if (line.startsWith("EHLO")) socket.write("250 fake\r\n");
      else if (line.startsWith("MAIL FROM")) socket.write("550 sender rejected\r\n");
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  try {
    await assert.rejects(
      sendSmtpMail({ host: "127.0.0.1", port, secure: false, startTls: false, rejectUnauthorized: true }, mail),
      /550/,
    );
  } finally {
    server.close();
  }
});
