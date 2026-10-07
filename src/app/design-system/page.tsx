import { notFound } from "next/navigation";
import { DesignSystemReference } from "@/components/design-system/DesignSystemReference";

export default async function DesignSystemPage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { access } = await searchParams;
  return <DesignSystemReference liveAccess={access === "remote"} />;
}
