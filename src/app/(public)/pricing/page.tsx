import type { Metadata } from "next";
import { PricingPage } from "@/components/marketing/PricingPage";

export const metadata: Metadata = {
  title: "Plans and pricing | SkooleeAI",
  description: "Compare SkooleeAI plan limits, monthly AI credits, and billing terms.",
};

export default function Page() {
  return <PricingPage />;
}
