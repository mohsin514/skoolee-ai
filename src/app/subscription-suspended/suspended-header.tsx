"use client";

import type { ReactNode } from "react";
import { CirclePause } from "lucide-react";
import { PageHeader, type PageAction } from "@/components/ui/page-header";

/**
 * The suspended screen's header. PageHeader takes its icon as a component, which a server page cannot hand to a
 * client component, so this client wrapper names the icon and passes everything else through unchanged.
 */
export function SuspendedHeader(props: { title: string; description?: string; primaryAction?: PageAction; status: ReactNode }) {
  return <PageHeader icon={CirclePause} {...props} />;
}
