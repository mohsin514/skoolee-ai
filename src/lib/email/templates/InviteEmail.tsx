import * as React from "react";
import { Text } from "@react-email/components";
import { mutedParagraph, paragraph, SkooleeEmail } from "./SkooleeEmail";

interface InviteEmailProps {
  role: string;
  campusName: string;
  actionUrl: string;
  logoUrl?: string;
}

export const InviteEmail = ({ role, campusName, actionUrl, logoUrl }: InviteEmailProps) => {
  return (
    <SkooleeEmail
      preview={`You have been invited to join ${campusName}`}
      eyebrow="Campus Invitation"
      title={`Join ${campusName}`}
      action={{ label: "Accept Invitation", href: actionUrl }}
      logoUrl={logoUrl}
    >
      <Text style={paragraph}>
        You have received an invitation to join the {campusName} portal as a <strong>{role}</strong>.
      </Text>
      <Text style={paragraph}>
        Accept the invitation to set up your profile and access your protected dashboard.
      </Text>
      <Text style={mutedParagraph}>This activation link will expire in 48 hours.</Text>
    </SkooleeEmail>
  );
};
