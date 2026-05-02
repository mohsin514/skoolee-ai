import * as React from "react";
import { Section, Text } from "@react-email/components";
import { detailBox, mutedParagraph, paragraph, SkooleeEmail } from "./SkooleeEmail";

interface ReportCardEmailProps {
  studentName: string;
  examTitle: string;
  pdfUrl?: string;
  logoUrl?: string;
}

export function ReportCardEmail({ studentName, examTitle, pdfUrl, logoUrl }: ReportCardEmailProps) {
  return (
    <SkooleeEmail
      preview={`${studentName}'s report card is ready`}
      eyebrow="Academic Office"
      title="Report card ready"
      action={pdfUrl ? { label: "View PDF", href: pdfUrl } : undefined}
      logoUrl={logoUrl}
      footerText="SkooleeAI Academic Office"
    >
      <Text style={paragraph}>Dear Parent,</Text>
      <Text style={paragraph}>
        The report card for <strong>{studentName}</strong> for <strong>{examTitle}</strong> is ready.
      </Text>
      <Section style={detailBox}>
        <Text style={mutedParagraph}>
          {pdfUrl
            ? "Use the secure link below to view the PDF report card."
            : "Please log in to SkooleeAI to view the report card."}
        </Text>
      </Section>
    </SkooleeEmail>
  );
}
