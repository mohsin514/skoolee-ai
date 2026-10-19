import * as React from "react";
import { Text } from "@react-email/components";
import { mutedParagraph, paragraph, SkooleeEmail } from "./SkooleeEmail";

interface VerifyEmailProps {
  actionUrl: string;
  logoUrl?: string;
}

export const VerifyEmail = ({ actionUrl, logoUrl }: VerifyEmailProps) => {
  return (
    <SkooleeEmail
      preview="Verify your SkooleeAI account"
      eyebrow="Account setup"
      title="Welcome to SkooleeAI"
      action={{ label: "Verify email address", href: actionUrl }}
      logoUrl={logoUrl}
      footerText="SkooleeAI - The next-gen school operating system"
    >
      <Text style={paragraph}>
        Please verify your email address to complete registration and access your school dashboard.
      </Text>
      <Text style={mutedParagraph}>This link works for 24 hours. If you did not create a SkooleeAI account, you can safely ignore this email.</Text>
    </SkooleeEmail>
  );
};
