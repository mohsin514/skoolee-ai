import type { Metadata } from "next";
import { BarChart3, BrainCircuit, TrendingUp } from "lucide-react";
import { ProductPage, productMetadata } from "../product-page";
import type { LangSearchParams } from "../public-lang";

const SEO: Metadata = {
  alternates: { canonical: "https://skooleeai.com/" },
  keywords: ["AI student performance analytics", "school analytics software", "at-risk student insights", "AI education analytics"],
};

export const generateMetadata = ({ searchParams }: { searchParams: LangSearchParams }) => productMetadata("ai-student-performance-analytics", searchParams, SEO);

export default function Page({ searchParams }: { searchParams: LangSearchParams }) {
  return <ProductPage id="ai-student-performance-analytics" icons={[TrendingUp, BrainCircuit, BarChart3]} searchParams={searchParams} />;
}
