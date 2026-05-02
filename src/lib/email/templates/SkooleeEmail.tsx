import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface EmailAction {
  label: string;
  href: string;
}

interface SkooleeEmailProps {
  preview: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  action?: EmailAction;
  logoUrl?: string;
  footerText?: string;
}

export function SkooleeEmail({
  preview,
  eyebrow,
  title,
  children,
  action,
  logoUrl,
  footerText = "SkooleeAI Campus Management System",
}: SkooleeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandSection}>
            <Section style={brandRow}>
              {logoUrl ? (
                <Img src={logoUrl} width="56" height="56" alt="SkooleeAI" style={logoImage} />
              ) : (
                <Text style={logoFallback}>S</Text>
              )}
              <Section style={brandTextWrap}>
                <Text style={brandName}>Skoolee AI</Text>
                <Text style={brandTagline}>The next-gen school operating system</Text>
              </Section>
            </Section>
          </Section>

          <Section style={content}>
            {eyebrow && <Text style={eyebrowStyle}>{eyebrow}</Text>}
            <Heading style={heading}>{title}</Heading>
            {children}

            {action && (
              <Section style={buttonWrap}>
                <Button href={action.href} style={button}>
                  {action.label}
                </Button>
              </Section>
            )}
          </Section>

          <Hr style={hr} />
          <Text style={footer}>{footerText}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export const paragraph = {
  color: "#4d4354",
  fontSize: "15px",
  fontWeight: "500",
  lineHeight: "24px",
  margin: "0 0 16px",
};

export const mutedParagraph = {
  ...paragraph,
  color: "#7a7180",
  fontSize: "13px",
  lineHeight: "21px",
};

export const detailBox = {
  backgroundColor: "#fbf0fe",
  border: "1px solid #eadfed",
  borderRadius: "18px",
  padding: "18px 20px",
  margin: "22px 0",
};

const main = {
  backgroundColor: "#fff7fe",
  fontFamily:
    '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: "32px 12px",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #eadfed",
  borderRadius: "24px",
  margin: "0 auto",
  maxWidth: "600px",
  overflow: "hidden",
};

const brandSection = {
  backgroundColor: "#fbf0fe",
  borderBottom: "1px solid #eadfed",
  padding: "28px 32px",
};

const brandRow = {
  display: "flex",
  alignItems: "center",
};

const logoImage = {
  borderRadius: "18px",
  display: "block",
  marginRight: "14px",
};

const logoFallback = {
  backgroundColor: "#8127cf",
  borderRadius: "18px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "28px",
  fontWeight: "800",
  height: "56px",
  lineHeight: "56px",
  margin: "0 14px 0 0",
  textAlign: "center" as const,
  width: "56px",
};

const brandTextWrap = {
  display: "inline-block",
  verticalAlign: "middle",
};

const brandName = {
  color: "#1f1a23",
  fontSize: "24px",
  fontWeight: "800",
  letterSpacing: "0",
  lineHeight: "30px",
  margin: "0",
};

const brandTagline = {
  color: "#8127cf",
  fontSize: "12px",
  fontWeight: "700",
  lineHeight: "18px",
  margin: "2px 0 0",
  textTransform: "uppercase" as const,
};

const content = {
  padding: "34px 32px 24px",
};

const eyebrowStyle = {
  color: "#9c48ea",
  fontSize: "12px",
  fontWeight: "800",
  letterSpacing: "0",
  lineHeight: "18px",
  margin: "0 0 8px",
  textTransform: "uppercase" as const,
};

const heading = {
  color: "#1f1a23",
  fontSize: "28px",
  fontWeight: "800",
  letterSpacing: "0",
  lineHeight: "34px",
  margin: "0 0 18px",
};

const buttonWrap = {
  margin: "30px 0 8px",
};

const button = {
  backgroundColor: "#8127cf",
  borderRadius: "12px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "800",
  lineHeight: "20px",
  padding: "14px 24px",
  textDecoration: "none",
};

const hr = {
  borderColor: "#eadfed",
  margin: "0 32px",
};

const footer = {
  color: "#7a7180",
  fontSize: "12px",
  fontWeight: "600",
  lineHeight: "18px",
  margin: "0",
  padding: "22px 32px 28px",
  textAlign: "center" as const,
};
