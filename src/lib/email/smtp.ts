import { randomUUID } from "node:crypto";
import net from "node:net";
import tls from "node:tls";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  startTls: boolean;
  user?: string;
  pass?: string;
  rejectUnauthorized: boolean;
}

export interface SmtpMailAddress {
  email: string;
  name?: string;
}

export interface SmtpMailInput {
  from: SmtpMailAddress;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

interface SmtpResponse {
  code: number;
  message: string;
}

function onceSocketEvent(socket: net.Socket | tls.TLSSocket, eventName: "connect" | "secureConnect") {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off(eventName, onConnect);
      socket.off("error", onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    socket.once(eventName, onConnect);
    socket.once("error", onError);
  });
}

function readResponse(socket: net.Socket | tls.TLSSocket) {
  return new Promise<SmtpResponse>((resolve, reject) => {
    let buffer = "";
    const lines: string[] = [];

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("end", onEnd);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error("SMTP connection closed unexpectedly"));
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() || "";

      for (const part of parts) {
        if (!part) continue;
        lines.push(part);

        if (/^\d{3} /.test(part)) {
          cleanup();
          resolve({
            code: Number(part.slice(0, 3)),
            message: lines.join("\n"),
          });
          return;
        }
      }
    };

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", onEnd);
  });
}

function writeLine(socket: net.Socket | tls.TLSSocket, line: string) {
  return new Promise<void>((resolve, reject) => {
    socket.write(`${line}\r\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function command(
  socket: net.Socket | tls.TLSSocket,
  line: string,
  expectedCodes: number[]
) {
  await writeLine(socket, line);
  const response = await readResponse(socket);

  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed (${response.code}): ${response.message}`);
  }

  return response;
}

function b64(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}

function encodeHeader(value: string) {
  const safe = value.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(safe)) return safe;
  return `=?UTF-8?B?${b64(safe)}?=`;
}

function extractEmail(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function formatAddress(address: SmtpMailAddress) {
  const email = extractEmail(address.email);
  return address.name ? `${encodeHeader(address.name)} <${email}>` : email;
}

function normalizeRecipients(to: string | string[]) {
  return (Array.isArray(to) ? to : [to])
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function dotStuff(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function plainTextFromHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildMimeMessage(input: SmtpMailInput, recipients: string[]) {
  const messageId = `<${randomUUID()}@skoolee-ai.local>`;
  const boundary = `skoolee_${randomUUID().replace(/-/g, "")}`;
  const text = input.text?.trim() || plainTextFromHtml(input.html);
  const headers = [
    `From: ${formatAddress(input.from)}`,
    `To: ${recipients.map((email) => extractEmail(email)).join(", ")}`,
    input.replyTo ? `Reply-To: ${extractEmail(input.replyTo)}` : undefined,
    `Subject: ${encodeHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(b64(text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(b64(input.html)),
    `--${boundary}--`,
    "",
  ];

  return {
    messageId,
    raw: `${headers.join("\r\n")}\r\n\r\n${body.join("\r\n")}`,
  };
}

async function connect(config: SmtpConfig) {
  let socket: net.Socket | tls.TLSSocket;
  if (config.secure) {
    socket = tls.connect({
      host: config.host,
      port: config.port,
      servername: config.host,
      rejectUnauthorized: config.rejectUnauthorized,
    });
    await onceSocketEvent(socket, "secureConnect");
  } else {
    socket = net.connect({
      host: config.host,
      port: config.port,
    });
    await onceSocketEvent(socket, "connect");
  }
  const greeting = await readResponse(socket);
  if (greeting.code !== 220) {
    throw new Error(`SMTP greeting failed (${greeting.code}): ${greeting.message}`);
  }

  await command(socket, "EHLO skoolee-ai.local", [250]);

  if (!config.secure && config.startTls) {
    await command(socket, "STARTTLS", [220]);
    socket = tls.connect({
      socket,
      servername: config.host,
      rejectUnauthorized: config.rejectUnauthorized,
    });
    await onceSocketEvent(socket, "secureConnect");
    await command(socket, "EHLO skoolee-ai.local", [250]);
  }

  if (config.user && config.pass) {
    await command(socket, "AUTH LOGIN", [334]);
    await command(socket, b64(config.user), [334]);
    await command(socket, b64(config.pass), [235]);
  }

  return socket;
}

export async function sendSmtpMail(config: SmtpConfig, input: SmtpMailInput) {
  const recipients = normalizeRecipients(input.to);
  if (!recipients.length) throw new Error("At least one email recipient is required");

  const fromEmail = extractEmail(input.from.email);
  const { messageId, raw } = buildMimeMessage(input, recipients);
  const socket = await connect(config);

  try {
    await command(socket, `MAIL FROM:<${fromEmail}>`, [250]);

    for (const recipient of recipients) {
      await command(socket, `RCPT TO:<${extractEmail(recipient)}>`, [250, 251]);
    }

    await command(socket, "DATA", [354]);
    await command(socket, `${dotStuff(raw)}\r\n.`, [250]);
    await command(socket, "QUIT", [221]);

    return { id: messageId };
  } finally {
    socket.end();
  }
}
