import type { Metadata } from "next";
import { TrustPage } from "../trust-page";

export const metadata: Metadata = {
  title: "Privacy | SkooleeAI",
  description: "How SkooleeAI handles school, student, parent, staff, billing, and AI usage data.",
  alternates: { canonical: "https://app.skooleeai.com/privacy" },
};

export default function Page() {
  return (
    <TrustPage
      copy={{
        title: "Privacy",
        description:
          "SkooleeAI is built for schools, so privacy starts with limiting access to the people who need each record for academic, fee, or parent communication work.",
        sections: [
          { title: "Data we handle", body: "Schools may store student records, guardian contact details, staff accounts, marks, attendance, invoices, report cards, communications, AI usage logs, and billing identifiers." },
          { title: "Purpose of use", body: "Data is used to operate the school platform, generate reviewed academic drafts, send approved communications, manage billing, and protect the service." },
          { title: "Access control", body: "School owners, campus admins, principals, teachers, parents, and students have separate roles so records stay scoped to the school and campus context." },
          { title: "Retention and updates", body: "Schools should keep records current and request removal when data is no longer needed for operational, legal, or academic purposes." },
        ],
      }}
    />
  );
}
