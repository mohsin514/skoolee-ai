import * as React from "react";
import { Text } from "@react-email/components";
import { mutedParagraph, paragraph, SkooleeEmail } from "./SkooleeEmail";

interface PasswordResetEmailProps {
  actionUrl: string;
  logoUrl?: string;
}

export function PasswordResetEmail({ actionUrl, logoUrl }: PasswordResetEmailProps) {
  return (
    <SkooleeEmail
      preview="Reset your SkooleeAI password"
      eyebrow="Account security"
      title="Reset your password"
      action={{ label: "Choose a new password", href: actionUrl }}
      logoUrl={logoUrl}
      footerText="If you did not request this, you can safely ignore this email."
    >
      <Text style={paragraph}>
        We received a request to reset your SkooleeAI password. Use the button below to choose a new password.
      </Text>
      <Text style={mutedParagraph}>This single-use link expires in 1 hour. If you did not ask to reset your password, your account is still safe and you can ignore this email.</Text>
    </SkooleeEmail>
  );
}
