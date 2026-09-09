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
  const isParent = role.toLowerCase().includes("parent") || role.toLowerCase().includes("guardian");
  
  return (
    <SkooleeEmail
      preview={`You have been invited to join ${campusName}`}
      eyebrow={isParent ? "Parent Portal Access" : "Campus Invitation"}
      title={isParent ? `Welcome to ${campusName}` : `Join ${campusName}`}
      action={{ label: isParent ? "Access Parent Portal" : "Accept Invitation", href: actionUrl }}
      logoUrl={logoUrl}
      footerText={isParent ? `This invitation was sent by ${campusName}. If you believe you received this email in error, please contact your school directly.` : undefined}
    >
      <Text style={paragraph}>
        {isParent ? (
          <>
            You have received an invitation to access the <strong>{campusName}</strong> Parent Portal.
          </>
        ) : (
          <>
            You have received an invitation to join the {campusName} portal as a <strong>{role}</strong>.
          </>
        )}
      </Text>
      <Text style={paragraph}>
        {isParent ? (
          <>
            The parent portal allows you to view your child's attendance, academic progress, exam results, 
            fee payments, and receive important school notifications directly.
          </>
        ) : (
          <>
            Accept the invitation to set up your profile and access your protected dashboard.
          </>
        )}
      </Text>
      <Text style={mutedParagraph}>
        This activation link will expire in 48 hours. For security, please do not share this link with anyone.
      </Text>
      {isParent && (
        <Text style={mutedParagraph}>
          If you have multiple children enrolled at {campusName}, you will be able to view all of them 
          from a single parent account after activating.
        </Text>
      )}
    </SkooleeEmail>
  );
};
