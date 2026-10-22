"use client";

import { RouteError, type RouteErrorProps } from "@/components/ui/route-error";

/** A failed screen inside the teacher console: inline in the shell's page card, and "Back" returns to this console's home. */
export default function SegmentError(props: RouteErrorProps) {
  return <RouteError {...props} homeHref="/teacher" />;
}
