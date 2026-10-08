import * as React from "react";
import { Section, Text } from "@react-email/components";
import { detailBox, mutedParagraph, paragraph, SkooleeEmail } from "./SkooleeEmail";
import { sanitizeHtml } from "@/lib/sanitize-html";

interface MessageEmailProps {
  language?: "en" | "ar";
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
  language = "en",
  text,
  html,
  actionUrl,
  actionLabel,
  logoUrl,
}: MessageEmailProps) {
  return (
    <SkooleeEmail
      preview={subject}
      language={language}
      eyebrow={language === "ar" ? "إشعار الحرم المدرسي" : "Campus Notification"}
      title={subject}
      action={actionUrl ? { label: actionLabel || (language === "ar" ? "عرض في Skoolee AI" : "View in Skoolee AI"), href: actionUrl } : undefined}
      logoUrl={logoUrl}
    >
      {html ? (
        <Section style={detailBox} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
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
