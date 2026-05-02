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
      eyebrow="Account Setup"
      title="Welcome to SkooleeAI"
      action={{ label: "Verify Email Address", href: actionUrl }}
      logoUrl={logoUrl}
      footerText="SkooleeAI - The next-gen school operating system"
    >
      <Text style={paragraph}>
        Please verify your email address to complete registration and access your school dashboard.
      </Text>
      <Text style={mutedParagraph}>If you did not request this email, you can safely ignore it.</Text>
    </SkooleeEmail>
  );
};
