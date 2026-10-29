// SKAI-1061 [D8-01]: Skoolee-owned WhatsApp Business Account (WABA) authentication
// templates. Meta authentication templates use fixed, Meta-localized body text
// ("<code> is your verification code."), an optional security line and expiry footer,
// and an OTP button. We use COPY_CODE only: one-tap/zero-tap need an Android app
// (D8 evidence), and Skoolee is a web app.
//
// Reference: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
// Submitted with scripts/otp/submit-auth-templates.ts (see docs/delivery/SKAI-1061-auth-waba-templates.md).

import type { OtpLanguage } from "./copy";

export const OTP_CODE_TTL_MINUTES = 5;

export type AuthTemplateDefinition = {
  name: string;
  language: string;
  category: "AUTHENTICATION";
  components: Array<
    | { type: "BODY"; add_security_recommendation: boolean }
    | { type: "FOOTER"; code_expiration_minutes: number }
    | { type: "BUTTONS"; buttons: Array<{ type: "OTP"; otp_type: "COPY_CODE"; text: string }> }
  >;
};

export const AUTH_TEMPLATE_NAME = "skoolee_signin_code";

/** Meta language code and localized copy-button label per Skoolee language. */
const LOCALES: Record<OtpLanguage, { meta: string; copyButton: string }> = {
  en: { meta: "en", copyButton: "Copy code" },
  ur: { meta: "ur", copyButton: "کوڈ کاپی کریں" },
  ar: { meta: "ar", copyButton: "نسخ الرمز" },
};

export function authTemplateDefinitions(name = AUTH_TEMPLATE_NAME): AuthTemplateDefinition[] {
  return (Object.keys(LOCALES) as OtpLanguage[]).map((lang) => ({
    name,
    language: LOCALES[lang].meta,
    category: "AUTHENTICATION",
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: OTP_CODE_TTL_MINUTES },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: LOCALES[lang].copyButton }] },
    ],
  }));
}

export function metaLanguage(lang: OtpLanguage) {
  return LOCALES[lang].meta;
}

/** Cloud API send payload for a copy-code authentication template. */
export function authTemplateMessage(to: string, code: string, lang: OtpLanguage, name = AUTH_TEMPLATE_NAME) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/^\+/, ""),
    type: "template",
    template: {
      name,
      language: { code: metaLanguage(lang) },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  };
}
