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
      eyebrow="Account Security"
      title="Reset your password"
      action={{ label: "Reset Password", href: actionUrl }}
      logoUrl={logoUrl}
      footerText="If you did not request this, you can safely ignore this email."
    >
      <Text style={paragraph}>
        We received a request to reset your SkooleeAI password. Use the button below to choose a new password.
      </Text>
      <Text style={mutedParagraph}>This secure reset link expires in 1 hour.</Text>
    </SkooleeEmail>
  );
}
