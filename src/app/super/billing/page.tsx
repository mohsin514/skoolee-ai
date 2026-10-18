"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CommandCentreSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";

export default function SuperBillingPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/super?view=billing");
  }, [router]);
  // The console's own standby while the redirect lands, instead of a blank page.
  return (
    <RoleShellSkeleton navRows={7} label="Loading the network command centre">
      <CommandCentreSkeleton />
    </RoleShellSkeleton>
  );
}
