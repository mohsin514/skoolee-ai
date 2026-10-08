import { ApplicationPatternsReference } from "@/components/design-system/ApplicationPatternsReference";
import { notFound } from "next/navigation";
import { DesignSystemReference } from "@/components/design-system/DesignSystemReference";

export default async function DesignSystemPage({ searchParams }: { searchParams: Promise<{ access?: string; patterns?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { access, patterns } = await searchParams;
  if (patterns === "application") return <ApplicationPatternsReference />;
  return <DesignSystemReference liveAccess={access === "remote"} />;
}
