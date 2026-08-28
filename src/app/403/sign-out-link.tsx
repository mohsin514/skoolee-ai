"use client";

/** Signing out is a POST, so it cannot be a plain link. */
export function SignOutLink() {
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <button
      type="button"
      onClick={signOut}
      className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#cfc2d6]/50 px-6 text-sm font-black text-ink-muted transition-colors hover:bg-[#f3f4f9]"
    >
      Sign out
    </button>
  );
}
