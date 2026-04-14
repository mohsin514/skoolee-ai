import { Resend } from 'resend';
import { VerifyEmail } from './email/templates/VerifyEmail';
import { InviteEmail } from './email/templates/InviteEmail';

// Ensure RESEND_API_KEY is in your .env file
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_fallback');

const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
};

const APP_URL = getBaseUrl();
const FROM_EMAIL = 'onboarding@resend.dev'; // Use Resend's default testing domain so it works out of the box on free tier

export async function sendVerificationEmail(email: string, userId: string, token: string) {
  try {
    const actionUrl = `${APP_URL}/api/auth/verify?id=${userId}&token=${token}`;
    
    // Uses the custom React Email template
    const { data, error } = await resend.emails.send({
      from: `SkooleeAI Setup <${FROM_EMAIL}>`,
      to: [email],
      subject: 'Verify your SkooleeAI Account',
      react: VerifyEmail({ actionUrl }),
    });

    if (error) {
      // Handle Resend Free Tier / Sandbox restrictions (403/Validation error)
      if (error.name === 'validation_error' || (error as any).statusCode === 403) {
        console.warn("\n [RESEND RESTRICTION] You are on a free tier or sandbox. Email was not sent to recipient.");
        console.warn(` [FALLBACK] Manual Verification Link: ${actionUrl}\n`);
        return { success: true, bypass: true };
      }
      
      console.error("[EMAIL ERROR] Failed sending verification:", error);
      throw new Error("Email dispatch failed");
    }

    return { success: true, data };
  } catch (err) {
    console.error("[EMAIL EXCEPTION]", err);
    // Silent fail in dev if no API key is provided so it doesn't crash the UI
    if (!process.env.RESEND_API_KEY) {
       console.log(`[DEV MODE] Verification Link: ${APP_URL}/api/auth/verify?token=${token}`);
       return { success: true };
    }
    throw err;
  }
}

export async function sendInviteEmail(email: string, role: string, campusName: string, token: string) {
  try {
    const actionUrl = `${APP_URL}/accept-invite?token=${token}`;

    const { data, error } = await resend.emails.send({
      from: `Campus Admin <${FROM_EMAIL}>`,
      to: [email],
      subject: `You've been invited to ${campusName}`,
      react: InviteEmail({ role, campusName, actionUrl }),
    });

    if (error) {
       if (error.name === 'validation_error' || (error as any).statusCode === 403) {
        console.warn("\n [RESEND RESTRICTION] Sandbox mode. Invite link generated in log.");
        console.warn(` [FALLBACK] Manual Invite Link: ${actionUrl}\n`);
        return { success: true, bypass: true };
      }
      console.error("[EMAIL ERROR] Failed sending invite:", error);
      throw new Error("Email dispatch failed");
    }

    return { success: true, data };
  } catch (err) {
    console.error("[EMAIL EXCEPTION]", err);
    if (!process.env.RESEND_API_KEY) {
      console.log(`[DEV MODE] Invite Link: ${APP_URL}/accept-invite?token=${token}`);
      return { success: true };
    }
    throw err;
  }
}

export async function sendPasswordResetEmail(email: string, token: string) {
  try {
    const actionUrl = `${APP_URL}/forgot-password?token=${token}`;

    const { data, error } = await resend.emails.send({
      from: `SkooleeAI Support <${FROM_EMAIL}>`,
      to: [email],
      subject: `Reset your SkooleeAI Password`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; rounded: 8px;">
          <h2 style="color: #8127cf;">Password Reset Request</h2>
          <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
          <a href="${actionUrl}" style="display: inline-block; background-color: #8127cf; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0;">Reset Password</a>
          <p style="color: #666; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (error) {
       if (error.name === 'validation_error' || (error as any).statusCode === 403) {
        console.warn("\n [RESEND RESTRICTION] Sandbox mode. Reset link generated in log.");
        console.warn(` [FALLBACK] Manual Reset Link: ${actionUrl}\n`);
        return { success: true, bypass: true };
      }
      throw new Error(error.message);
    }
    return { success: true };
  } catch (err) {
    if (!process.env.RESEND_API_KEY) {
      console.log(`[DEV MODE] Reset Link: ${APP_URL}/forgot-password?token=${token}`);
      return { success: true };
    }
    throw err;
  }
}
