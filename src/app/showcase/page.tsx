import type { Metadata } from "next";
import { PublicShowcase } from "@/components/onboarding/PublicShowcase";
import { resolveShowcaseEntry } from "@/lib/onboarding/showcase-entry";

export const metadata: Metadata = {
  title: "Meet Skoolee AI",
  description: "A guided beginning for your school, your campus and every role. Explore the Skoolee AI showcase.",
};

export default async function ShowcasePage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  const entry = await resolveShowcaseEntry();
  return <PublicShowcase language={lang === "ar" || lang === "ur" ? lang : "en"} entry={entry} />;
}
