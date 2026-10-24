"use client";

import { RouteError, type RouteErrorProps } from "@/components/ui/route-error";

export default function GlobalError(props: RouteErrorProps) {
  return <RouteError {...props} fullPage />;
}
