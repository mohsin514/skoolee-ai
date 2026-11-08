import type { Metadata } from "next";
import { PricingPage } from "@/components/marketing/PricingPage";
import { readPublicLanguage, type LangSearchParams } from "../public-lang";

export const metadata: Metadata = {
  title: "Plans and pricing | SkooleeAI",
  description: "Compare SkooleeAI plan limits, monthly AI credits, and billing terms.",
};

export default async function Page({ searchParams }: { searchParams: LangSearchParams }) {
  const { lang } = await readPublicLanguage(searchParams);
  return <PricingPage initialLanguage={lang} />;
}
