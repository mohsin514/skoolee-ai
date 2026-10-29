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
      preview={isParent ? `${campusName} has set up a parent account for you` : `${campusName} has set up a ${role} account for you`}
      eyebrow={isParent ? "Parent account" : "Staff account"}
      title={`Welcome to ${campusName}`}
      action={{ label: "Set up your account", href: actionUrl }}
      logoUrl={logoUrl}
      footerText={isParent ? `This invitation was sent by ${campusName}. If you believe you received this email in error, please contact your school directly.` : undefined}
    >
      <Text style={paragraph}>
        {isParent ? (
          <>
            <strong>{campusName}</strong> has set up a parent account for you on Skoolee AI.
          </>
        ) : (
          <>
            <strong>{campusName}</strong> has set up a <strong>{role}</strong> account for you on Skoolee AI.
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
            Use the button below to choose your password and sign in to your dashboard.
          </>
        )}
      </Text>
      <Text style={mutedParagraph}>
        The link works for 48 hours. Please do not share it.
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
