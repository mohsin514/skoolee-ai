/**
 * Which webmail to offer after we send an email, chosen from the domain only.
 * The user's address never appears in any URL we build.
 */

export type InboxProvider = "gmail" | "outlook" | "microsoft365" | "yahoo" | "icloud";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function domainOf(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!EMAIL.test(value) || value.length > 254) return null;
  return value.slice(value.lastIndexOf("@") + 1);
}

export function inboxProvidersFor(email: string): InboxProvider[] {
  const domain = domainOf(email);
  if (!domain) return [];
  if (domain === "gmail.com" || domain === "googlemail.com") return ["gmail"];
  if (/^(?:outlook|hotmail|live)(?:\.[a-z]{2,})+$/.test(domain) || domain === "msn.com") return ["outlook"];
  if (/^yahoo(?:\.[a-z]{2,})+$/.test(domain) || domain === "ymail.com") return ["yahoo"];
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") return ["icloud"];
  // School and company domains: almost always hosted on Google Workspace or Microsoft 365.
  return ["gmail", "microsoft365"];
}

const INBOX_URLS: Record<InboxProvider, string> = {
  // Searches every folder, Spam included. Gmail matches whole words, hence "SkooleeAI".
  gmail: "https://mail.google.com/mail/u/0/#search/in%3Aanywhere+SkooleeAI",
  outlook: "https://outlook.live.com/mail/0/",
  microsoft365: "https://outlook.office.com/mail/",
  yahoo: "https://mail.yahoo.com/",
  icloud: "https://www.icloud.com/mail/",
};

export function inboxUrl(p: InboxProvider): string {
  return INBOX_URLS[p];
}
