import type { Metadata } from "next";
import { TrustPage } from "../trust-page";

export const metadata: Metadata = {
  title: "Security | SkooleeAI",
  description: "SkooleeAI security overview for authentication, tenant scoping, billing controls, and operational safeguards.",
  alternates: { canonical: "https://app.skooleeai.com/security" },
};

export default function Page() {
  return (
    <TrustPage
      copy={{
        title: "Security",
        description:
          "SkooleeAI combines role-based access, school and campus scoping, subscription gates, and provider isolation for a safer school management workflow.",
        sections: [
          { title: "Authentication", body: "Authenticated sessions carry user, role, school, campus, onboarding, and school status context so protected routes can make access decisions." },
          { title: "Tenant scoping", body: "API routes check that classes, students, invoices, staff, exams, reports, and communications belong to the authenticated school and campus." },
          { title: "Billing safeguards", body: "Suspended subscriptions block operational access while preserving the billing route so administrators can restore payment or plan status." },
          { title: "Provider boundaries", body: "Stripe, WhatsApp, email, storage, and AI providers are configured through server-side environment variables rather than browser-exposed secrets." },
        ],
      }}
    />
  );
}
