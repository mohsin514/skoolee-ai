import * as React from "react";
import { Text } from "@react-email/components";
import { authEmailCopy, type AuthEmailLanguage } from "@/lib/auth/email-copy";
import { mutedParagraph, paragraph, SkooleeEmail } from "./SkooleeEmail";

interface Props {
  actionUrl: string;
  logoUrl?: string;
  language?: AuthEmailLanguage;
  /** SKAI-1801: "setup" is the first-password email for owner-created accounts; same single-use link. */
  kind?: "reset" | "setup";
}

export function PasswordResetEmail({ actionUrl, logoUrl, language = "en", kind = "reset" }: Props) {
  const copy = authEmailCopy[language][kind];
  return (
    <SkooleeEmail language={language} preview={copy.subject} eyebrow={copy.eyebrow}
      title={copy.title} action={{ label: copy.action, href: actionUrl }} logoUrl={logoUrl}>
      <Text style={paragraph}>{copy.body}</Text>
      <Text style={mutedParagraph}>{copy.note}</Text>
    </SkooleeEmail>
  );
}
