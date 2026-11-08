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
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";

interface EmailAction {
  label: string;
  href: string;
}

interface SkooleeEmailProps {
  language?: "en" | "ar" | "ur";
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
  language = "en",
  eyebrow,
  title,
  children,
  action,
  logoUrl,
  footerText,
}: SkooleeEmailProps) {
  return (
    <Html lang={language} dir={language !== "en" ? "rtl" : "ltr"}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ ...main, textAlign: language !== "en" ? "right" : "left" }}>
        <Container style={container}>
          {/* Front Desk header: the deep plum "cover" band with a seal emblem and the wordmark. */}
          <Section style={brandSection}>
            <Row>
              <Column style={{ width: "66px", verticalAlign: "middle" }}>
                {logoUrl ? (
                  <Img src={logoUrl} width="52" height="52" alt="SkooleeAI" style={logoImage} />
                ) : (
                  <Text style={logoFallback}>S</Text>
                )}
              </Column>
              <Column style={brandTextWrap}>
                <Text style={brandName}>Skoolee AI</Text>
                <Text style={brandTagline}>{language === "ur" ? "اگلی نسل کا اسکول انتظامی نظام" : language === "ar" ? "نظام إدارة المدارس للجيل القادم" : "The next-gen school operating system"}</Text>
              </Column>
            </Row>
          </Section>
          <Section style={inkRule} />

          <Section style={content}>
            {eyebrow && <Text style={eyebrowStyle}>{eyebrow}</Text>}
            <Heading style={heading}>{title}</Heading>
            {children}

            {action && (
              <Section style={buttonWrap}>
                <Button href={action.href} style={button}>
                  {action.label}
                </Button>
                <Text style={fallbackLink}>
                  {language === "ur" ? "بٹن کام نہ کرے تو یہ لنک کھولیں:" : language === "ar" ? "إذا لم يعمل الزر، افتح هذا الرابط:" : "Button not working? Open this link:"}{" "}
                  <a href={action.href} dir="ltr" style={{ ...fallbackAnchor, display: "block" }}>{action.href}</a>
                </Text>
              </Section>
            )}
          </Section>

          <Hr style={hr} />
          <Text style={trustLine}>{language === "ur" ? "محفوظ اور خفیہ کردہ · انسانوں کا جائزہ لیا ہوا اے آئی" : language === "ar" ? "مشفّر أثناء التخزين والنقل · ذكاء اصطناعي يراجعه البشر" : "Encrypted at rest & in transit · Human-reviewed AI"}</Text>
          <Text style={footer}>{footerText || (language === "ur" ? "SkooleeAI کیمپس انتظامی نظام" : language === "ar" ? "نظام SkooleeAI لإدارة الحرم المدرسي" : "SkooleeAI Campus Management System")}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export const paragraph = {
  color: "#4d4354",
  fontSize: "15px",
  fontWeight: "400",
  lineHeight: "25px",
  margin: "0 0 16px",
};

export const mutedParagraph = {
  ...paragraph,
  color: "#746c7a",
  fontSize: "13px",
  lineHeight: "21px",
};

/** The "address plate": a dashed lilac panel for the key facts of an email. */
export const detailBox = {
  backgroundColor: "#faf5ff",
  border: "1px dashed #d8cfe5",
  borderRadius: "16px",
  padding: "16px 20px",
  margin: "22px 0",
};

const main = {
  backgroundColor: "#f6f2fa",
  fontFamily:
    '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: "36px 12px",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #e9d5ff",
  borderRadius: "28px",
  margin: "0 auto",
  maxWidth: "600px",
  overflow: "hidden",
  boxShadow: "0 24px 54px -28px rgba(129,39,207,0.38)",
};

const brandSection = {
  backgroundColor: "#3d0f6b",
  backgroundImage: "linear-gradient(165deg, #4f1487 0%, #3d0f6b 48%, #26073f 100%)",
  padding: "30px 32px",
};

const inkRule = {
  backgroundImage: "linear-gradient(90deg, #8127cf, #9c48ea 60%, #b10e6b)",
  backgroundColor: "#8127cf",
  height: "4px",
  lineHeight: "4px",
  fontSize: "0",
};

const logoImage = {
  borderRadius: "50%",
  border: "2px solid #e9d5ff",
  display: "block",
  marginRight: "14px",
};

const logoFallback = {
  backgroundColor: "#8c36d5",
  border: "3px solid #b876f0",
  borderRadius: "50%",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "24px",
  fontWeight: "800",
  height: "46px",
  lineHeight: "46px",
  margin: "0 14px 0 0",
  textAlign: "center" as const,
  width: "46px",
};

const brandTextWrap = {
  verticalAlign: "middle",
};

const brandName = {
  color: "#ffffff",
  fontSize: "24px",
  fontWeight: "800",
  letterSpacing: "-0.02em",
  lineHeight: "30px",
  margin: "0",
};

const brandTagline = {
  color: "#e9d5ff",
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.12em",
  lineHeight: "16px",
  margin: "4px 0 0",
  textTransform: "uppercase" as const,
};

const content = {
  padding: "36px 36px 26px",
};

const eyebrowStyle = {
  backgroundColor: "#faf5ff",
  border: "1px solid #e4cdf8",
  borderRadius: "999px",
  color: "#6a1fb0",
  display: "inline-block",
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.08em",
  lineHeight: "16px",
  margin: "0 0 14px",
  padding: "4px 12px",
  textTransform: "uppercase" as const,
};

const heading = {
  color: "#1f1a23",
  fontSize: "28px",
  fontWeight: "800",
  letterSpacing: "-0.02em",
  lineHeight: "34px",
  margin: "0 0 18px",
};

const buttonWrap = {
  margin: "30px 0 8px",
};

const button = {
  backgroundColor: "#3d0f6b",
  backgroundImage: "linear-gradient(180deg, #4f1487, #3d0f6b)",
  border: "1px solid #9c48ea",
  borderRadius: "16px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "700",
  lineHeight: "20px",
  padding: "15px 28px",
  textDecoration: "none",
};

const fallbackLink = {
  color: "#746c7a",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "16px 0 0",
  wordBreak: "break-all" as const,
};

const fallbackAnchor = {
  color: "#8127cf",
  textDecoration: "underline",
};

const hr = {
  borderColor: "#f3eafa",
  margin: "0 36px",
};

const trustLine = {
  color: "#6a1fb0",
  fontSize: "12px",
  fontWeight: "600",
  lineHeight: "18px",
  margin: "0",
  padding: "20px 32px 0",
  textAlign: "center" as const,
};

const footer = {
  color: "#746c7a",
  fontSize: "12px",
  fontWeight: "500",
  lineHeight: "18px",
  margin: "0",
  padding: "6px 32px 28px",
  textAlign: "center" as const,
};
