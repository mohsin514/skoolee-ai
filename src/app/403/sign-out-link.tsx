"use client";

import { Button } from "@/components/ui/button";
import { clearDeviceDrafts } from "@/lib/drafts/store";

/** Signing out is a POST, so it cannot be a plain link. */
export function SignOutLink() {
  const signOut = async () => {
    clearDeviceDrafts();
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <Button variant="outline"
      type="button"
      onClick={signOut}
      className="w-full items-center justify-center"
    >
      Sign out
    </Button>
  );
}
