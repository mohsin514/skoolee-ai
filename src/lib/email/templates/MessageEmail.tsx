import * as React from "react";
import { Section, Text } from "@react-email/components";
import { detailBox, mutedParagraph, paragraph, SkooleeEmail } from "./SkooleeEmail";

interface MessageEmailProps {
  subject: string;
  text?: string;
  html?: string;
  actionUrl?: string;
  actionLabel?: string;
  logoUrl?: string;
}

function textBlocks(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function MessageEmail({
  subject,
  text,
  html,
  actionUrl,
  actionLabel = "View in Skoolee AI",
  logoUrl,
}: MessageEmailProps) {
  return (
    <SkooleeEmail
      preview={subject}
      eyebrow="Campus Notification"
      title={subject}
      action={actionUrl ? { label: actionLabel, href: actionUrl } : undefined}
      logoUrl={logoUrl}
    >
      {html ? (
        <Section style={detailBox} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        textBlocks(text || "").map((block, index) => (
          <Text key={index} style={index === 0 ? paragraph : mutedParagraph}>
            {block}
          </Text>
        ))
      )}
    </SkooleeEmail>
  );
}
