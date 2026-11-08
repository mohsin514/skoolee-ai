import type { Metadata } from "next";
import { CheckCircle2, MessageCircle, Send } from "lucide-react";
import { ProductPage, productMetadata } from "../product-page";
import type { LangSearchParams } from "../public-lang";

const SEO: Metadata = {
  alternates: { canonical: "https://skooleeai.com/" },
  keywords: ["WhatsApp report card software", "send report cards on WhatsApp", "parent communication software", "school WhatsApp notifications"],
};

export const generateMetadata = ({ searchParams }: { searchParams: LangSearchParams }) => productMetadata("whatsapp-report-card-software", searchParams, SEO);

export default function Page({ searchParams }: { searchParams: LangSearchParams }) {
  return <ProductPage id="whatsapp-report-card-software" icons={[MessageCircle, CheckCircle2, Send]} searchParams={searchParams} />;
}
