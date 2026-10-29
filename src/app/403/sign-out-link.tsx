"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clearClientIdentity, endServerSession } from "@/lib/auth/sign-out";

/** Signing out is a POST, so it cannot be a plain link. */
export function SignOutLink({ label = "Sign out" }: { label?: string }) {
  // The button stays busy until the browser leaves for /login, so a second
  // press cannot fire another logout request.
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    setPending(true);
    clearClientIdentity();
    if (!(await endServerSession())) {
      // Network failure: stay on the page and let the person try again.
      setPending(false);
      return;
    }
    window.location.replace("/login");
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
