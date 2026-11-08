import type { Metadata } from "next";
import { BarChart3, Brain, School } from "lucide-react";
import { ProductPage, productMetadata } from "../product-page";
import type { LangSearchParams } from "../public-lang";

const SEO: Metadata = {
  alternates: { canonical: "https://skooleeai.com/" },
  keywords: ["AI school management software", "school ERP", "AI report cards", "SkooleeAI"],
};

export const generateMetadata = ({ searchParams }: { searchParams: LangSearchParams }) => productMetadata("ai-school-management-software", searchParams, SEO);

export default function Page({ searchParams }: { searchParams: LangSearchParams }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Skoolee AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "AI school management software for students, staff, fees, campuses, Urdu and English report cards, WhatsApp updates, and performance analytics.",
    url: "https://skooleeai.com/",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "PKR",
      description: "Free Basic plan for small schools; paid plans billed monthly or annually with 20% off.",
    },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductPage id="ai-school-management-software" icons={[School, Brain, BarChart3]} searchParams={searchParams} />
    </div>
  );
}
