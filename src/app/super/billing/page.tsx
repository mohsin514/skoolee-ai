"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SuperBillingPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/super?view=billing");
  }, [router]);
  return null;
}
