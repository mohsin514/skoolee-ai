import { ApplicationPatternsReference } from "@/components/design-system/ApplicationPatternsReference";
import { notFound } from "next/navigation";
import { DesignSystemReference } from "@/components/design-system/DesignSystemReference";
import { FoundationReference } from "@/components/design-system/FoundationReference";

export default async function DesignSystemPage({ searchParams }: { searchParams: Promise<{ access?: string; patterns?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { access, patterns } = await searchParams;
  if (patterns === "application") return <ApplicationPatternsReference />;
  if (patterns === "foundation") return <FoundationReference />;
  return <DesignSystemReference liveAccess={access === "remote"} />;
}
