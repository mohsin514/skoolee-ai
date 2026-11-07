"use client";

import type { RouteErrorProps } from "@/components/ui/route-error";
import { LazyRouteError } from "@/components/ui/lazy-boundaries";

export default function GlobalError(props: RouteErrorProps) {
  return <LazyRouteError {...props} fullPage />;
}
