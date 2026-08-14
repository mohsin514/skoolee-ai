import type { ReactElement } from "react";
import { render } from "@react-email/render";
import { InviteEmail } from "./email/templates/InviteEmail";
import { MessageEmail } from "./email/templates/MessageEmail";
import { PasswordResetEmail } from "./email/templates/PasswordResetEmail";
import { ReportCardEmail } from "./email/templates/ReportCardEmail";
import { VerifyEmail } from "./email/templates/VerifyEmail";
import { sendSmtpMail, type SmtpConfig } from "./email/smtp";
import { roleLabel } from "@/lib/roles";

const DEFAULT_FROM_EMAIL = "mohsin.ali14993@gmail.com";

const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
};

function normalizeBaseUrl(baseUrl?: string) {
  return (baseUrl || getBaseUrl()).replace(/\/$/, "");
}

function getLogoUrl(baseUrl?: string) {
  if (process.env.EMAIL_LOGO_URL) return process.env.EMAIL_LOGO_URL;
  return `${normalizeBaseUrl(baseUrl)}/favicon.svg`;
}

function getFromEmail() {
  return (
    process.env.SMTP_FROM_EMAIL ||
    process.env.EMAIL_FROM_ADDRESS ||
    process.env.SMTP_USER ||
    DEFAULT_FROM_EMAIL
  );
}

function getFromName(fallback = "Skoolee AI") {
  return process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || fallback;
}

function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || "465");
  const secure = (process.env.SMTP_SECURE || (port === 465 ? "true" : "false")) !== "false";

  return {
    host,
    port,
    secure,
    startTls: process.env.SMTP_STARTTLS !== "false",
    user: process.env.SMTP_USER || process.env.EMAIL_SERVER_USER || DEFAULT_FROM_EMAIL,
    pass: process.env.SMTP_PASS || process.env.EMAIL_SERVER_PASSWORD,
    rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
  };
}

function hasEmailProviderConfig() {
  if (process.env.EMAIL_DEV_MODE === "true") return true;
  if (process.env.SMTP_AUTH === "false") return Boolean(process.env.SMTP_HOST);

  const config = getSmtpConfig();
  return Boolean(config.host && config.user && config.pass);
}

async function renderTemplate(template: ReactElement) {
  return render(template);
}

async function deliverEmail({
  to,
  subject,
  html,
  text,
  fromName,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}) {
  if (process.env.EMAIL_DEV_MODE === "true") {
    console.log(`[EMAIL DEV MODE] ${subject}: ${to}`);
    return { success: true, bypass: true, messageId: undefined };
  }

  if (!hasEmailProviderConfig()) {
    return {
      success: false,
      error:
        "SMTP is not configured. Set SMTP_PASS to a Gmail app password, or set SMTP_HOST/SMTP_USER/SMTP_PASS for another SMTP provider.",
    };
  }

  const data = await sendSmtpMail(getSmtpConfig(), {
    from: {
      email: getFromEmail(),
      name: getFromName(fromName),
    },
    to,
    subject,
    html,
    text,
    replyTo: process.env.SMTP_REPLY_TO || process.env.EMAIL_REPLY_TO,
  });

  return { success: true, data, messageId: data.id };
}

export async function sendEmailMessage({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  try {
    const renderedHtml = await renderTemplate(
      MessageEmail({
        subject,
        text,
        html,
        logoUrl: getLogoUrl(),
      })
    );

    return deliverEmail({
      to,
      subject,
      html: renderedHtml,
      text,
      fromName: "SkooleeAI Notifications",
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Email dispatch failed",
    };
  }
}

export async function sendVerificationEmail(email: string, userId: string, token: string) {
  try {
    // The signed token is the whole credential; the user id is not in the URL.
    void userId;
    const actionUrl = `${getBaseUrl()}/api/auth/verify?token=${token}`;
    const html = await renderTemplate(VerifyEmail({ actionUrl, logoUrl: getLogoUrl() }));
    const result = await deliverEmail({
      to: email,
      subject: "Verify your SkooleeAI Account",
      html,
      text: `Verify your SkooleeAI account: ${actionUrl}`,
      fromName: "SkooleeAI Setup",
    });

    if (!result.success) {
      console.error("[EMAIL ERROR] Failed sending verification:", result.error);
      throw new Error("Email dispatch failed");
    }

    return result;
  } catch (err) {
    console.error("[EMAIL EXCEPTION]", err);
    if (process.env.EMAIL_DEV_MODE === "true") {
      console.log(`[EMAIL DEV MODE] Verification Link: ${getBaseUrl()}/api/auth/verify?token=${token}`);
      return { success: true };
    }
    throw err;
  }
}

export async function sendInviteEmail(email: string, role: string, campusName: string, token: string, baseUrl?: string) {
  try {
    const roleName = roleLabel(role);
    const inviteBaseUrl = normalizeBaseUrl(baseUrl);
    const actionUrl = `${inviteBaseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
    const html = await renderTemplate(InviteEmail({ role: roleName, campusName, actionUrl, logoUrl: getLogoUrl(inviteBaseUrl) }));
    const result = await deliverEmail({
      to: email,
      subject: `You've been invited to ${campusName}`,
      html,
      text: `You have been invited to join ${campusName} as ${roleName}. Accept your invitation: ${actionUrl}`,
      fromName: "Campus Admin",
    });

    if (!result.success) {
      console.error("[EMAIL ERROR] Failed sending invite:", result.error);
      throw new Error("Email dispatch failed");
    }

    return result;
  } catch (err) {
    console.error("[EMAIL EXCEPTION]", err);
    if (process.env.EMAIL_DEV_MODE === "true") {
      console.log(`[EMAIL DEV MODE] Invite Link: ${normalizeBaseUrl(baseUrl)}/accept-invite?token=${encodeURIComponent(token)}`);
      return { success: true };
    }
    throw err;
  }
}

export async function sendPasswordResetEmail(email: string, token: string) {
  try {
    const actionUrl = `${getBaseUrl()}/forgot-password?token=${token}`;
    const html = await renderTemplate(PasswordResetEmail({ actionUrl, logoUrl: getLogoUrl() }));
    const result = await deliverEmail({
      to: email,
      subject: "Reset your SkooleeAI Password",
      html,
      text: `Reset your SkooleeAI password: ${actionUrl}`,
      fromName: "SkooleeAI Support",
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result;
  } catch (err) {
    if (process.env.EMAIL_DEV_MODE === "true") {
      console.log(`[EMAIL DEV MODE] Reset Link: ${getBaseUrl()}/forgot-password?token=${token}`);
      return { success: true };
    }
    throw err;
  }
}

export async function sendReportCardEmail(
  email: string,
  studentName: string,
  examTitle: string,
  pdfUrl?: string
) {
  try {
    const absolutePdfUrl = pdfUrl?.startsWith("http")
      ? pdfUrl
      : pdfUrl
        ? `${getBaseUrl()}${pdfUrl}`
        : undefined;

    const html = await renderTemplate(
      ReportCardEmail({
        studentName,
        examTitle,
        pdfUrl: absolutePdfUrl,
        logoUrl: getLogoUrl(),
      })
    );
    const result = await deliverEmail({
      to: email,
      subject: `${studentName}'s report card is ready`,
      html,
      text: `Dear Parent,\n\nThe report card for ${studentName} for ${examTitle} is ready.${
        absolutePdfUrl ? `\n\nView PDF: ${absolutePdfUrl}` : "\n\nPlease log in to SkooleeAI to view the report card."
      }`,
      fromName: "SkooleeAI Reports",
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result;
  } catch (err) {
    if (process.env.EMAIL_DEV_MODE === "true") {
      console.log(`[EMAIL DEV MODE] Report card email for ${studentName}: ${pdfUrl || "portal only"}`);
      return { success: true };
    }
    throw err;
  }
}
