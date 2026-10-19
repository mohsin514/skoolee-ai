import type { ReactElement } from "react";
import { render } from "@react-email/render";
import { InviteEmail } from "./email/templates/InviteEmail";
import { MessageEmail } from "./email/templates/MessageEmail";
import { PasswordResetEmail } from "./email/templates/PasswordResetEmail";
import { VerifyEmail } from "./email/templates/VerifyEmail";
import { sendSmtpMail, verifySmtpConnection, type SmtpConfig } from "./email/smtp";
import { roleLabel } from "@/lib/roles";
import { emailProviderReadiness } from "./email/readiness";
export { emailProviderReadiness } from "./email/readiness";

const DEFAULT_FROM_EMAIL = "mohsin@skooleeai.com";

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

/** SKO-457: handshake-only provider check; sends nothing. */
export async function checkEmailProviderConnection() {
  return verifySmtpConnection(getSmtpConfig());
}

export function hasEmailProviderConfig() {
  return emailProviderReadiness().configured;
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
  if (process.env.DISABLE_OUTBOUND_MESSAGES === "true") {
    return { success: false, error: "Outbound email is disabled for this environment." };
  }
  if (process.env.EMAIL_DEV_MODE === "true") {
    console.log("[EMAIL DEV MODE] Delivery bypassed; no provider message was sent.");
    return { success: false, bypass: true, messageId: undefined, error: "Email delivery is bypassed in development; no provider message was sent." };
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
  language = "en",
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  language?: "en" | "ar" | "ur";
}) {
  try {
    const renderedHtml = await renderTemplate(
      MessageEmail({
        subject,
        language,
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
    if (emailProviderReadiness().mode === "development" && process.env.NODE_ENV !== "production") {
      console.log("[EMAIL DEV MODE] Verification delivery bypassed; no provider message was sent.");
      return { success: true, bypass: true };
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
    
    // Customize messaging based on role
    const isParent = role === "PARENT";
    
    // Use the campus name in the from name to make it more legitimate and recognizable
    const fromName = isParent 
      ? `${campusName}` 
      : `${campusName} via Skoolee AI`;
    
    // Make subject line more specific and less spammy
    const subject = isParent
      ? `Parent Portal Access for ${campusName}`
      : `You've been invited to ${campusName}`;
    
    // Enhance text version for better spam score
    const textContent = isParent
      ? `Welcome to ${campusName} Parent Portal\n\nYou have been invited to access the parent portal for ${campusName}.\n\nThe parent portal allows you to:\n- View your child's attendance and academic progress\n- Check exam results and report cards\n- Monitor fee payments and invoices\n- Receive important school notifications\n\nActivate your account: ${actionUrl}\n\nThis activation link will expire in 48 hours.\n\nFor security, please do not share this link with anyone.\n\n---\n${campusName}\nPowered by Skoolee AI Campus Management System`
      : `You have been invited to join ${campusName} as ${roleName}. Accept your invitation: ${actionUrl}`;
    
    const result = await deliverEmail({
      to: email,
      subject,
      html,
      text: textContent,
      fromName,
    });

    if (!result.success) {
      console.error("[EMAIL ERROR] Failed sending invite:", result.error);
      throw new Error("Email dispatch failed");
    }

    return result;
  } catch (err) {
    console.error("[EMAIL EXCEPTION]", err);
    throw err;
  }
}

/**
 * SKO-457: someone tried to register a new school with an address that already owns one. The
 * signup screen answers exactly as for a new address; only the owner of the address learns
 * this, here, with the way back in.
 */
export async function sendExistingAccountNotice(email: string) {
  const base = getBaseUrl();
  const text = [
    "Someone tried to register a new school on SkooleeAI with this email address, which already has a school account.",
    `If it was you, sign in: ${base}/login`,
    `Forgot your password? Reset it here: ${base}/forgot-password`,
    "If it was not you, you can ignore this email. No new account was created.",
  ].join("\n\n");
  const result = await sendEmailMessage({ to: email, subject: "You already have a SkooleeAI account", text });
  if (!result.success) throw new Error("error" in result && result.error ? String(result.error) : "Email dispatch failed");
  return result;
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
    if (emailProviderReadiness().mode === "development") {
      console.log("[EMAIL DEV MODE] Password-reset delivery bypassed; no provider message was sent.");
      return { success: false, bypass: true, error: "Email delivery is bypassed in development; no provider message was sent." };
    }
    throw err;
  }
}
