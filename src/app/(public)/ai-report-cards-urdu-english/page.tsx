import type { Metadata } from "next";
import { FileText, Languages, ShieldCheck } from "lucide-react";
import { ProductPage, productMetadata } from "../product-page";
import type { LangSearchParams } from "../public-lang";

const SEO: Metadata = {
  alternates: { canonical: "https://skooleeai.com/" },
  keywords: ["AI report cards Urdu English", "bilingual report cards", "Urdu report card remarks", "school report card software"],
};

export const generateMetadata = ({ searchParams }: { searchParams: LangSearchParams }) => productMetadata("ai-report-cards-urdu-english", searchParams, SEO);

export default function Page({ searchParams }: { searchParams: LangSearchParams }) {
  return <ProductPage id="ai-report-cards-urdu-english" icons={[Languages, ShieldCheck, FileText]} searchParams={searchParams} />;
}
