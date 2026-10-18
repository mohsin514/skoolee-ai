"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clearDeviceDrafts } from "@/lib/drafts/store";

/** Signing out is a POST, so it cannot be a plain link. */
export function SignOutLink({ label = "Sign out" }: { label?: string }) {
  // The button stays busy until the browser leaves for /login, so a second
  // press cannot fire another logout request.
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    setPending(true);
    clearDeviceDrafts();
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Network failure: stay on the page and let the person try again.
      setPending(false);
      return;
    }
    window.location.href = "/login";
  };

  return (
    <Button variant="outline"
      type="button"
      onClick={signOut}
      loading={pending}
      className="w-full"
    >
      {label}
    </Button>
  );
}
