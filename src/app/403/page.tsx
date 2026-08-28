import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getAuthUser } from "@/lib/auth";
import { dashboardPathForRole, roleLabel } from "@/lib/roles";
import { SignOutLink } from "./sign-out-link";

export const dynamic = "force-dynamic";

export default async function ForbiddenPage() {
  // Landing here almost always means a signed-in user opened a console that
  // belongs to another role — a link they were sent, or a stale bookmark. The
  // page used to offer one action, "Back to login", which reads as "your
  // session is the problem" and leaves them to work out that it isn't. Their
  // own console is one click away, so offer that first.
  const user = await getAuthUser();
  const home = user ? dashboardPathForRole(user.role) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f4f9] p-6 text-[#1f1a23]">
      <section
        className="sk-rise max-w-md rounded-[32px] border border-[#cfc2d6]/20 bg-white p-10 text-center shadow-2xl"
        style={{ animationDelay: "0ms" }}
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#fbf0fe] text-[#8127cf]">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="mb-2 text-2xl font-black tracking-normal">Access Restricted</h1>
        <p className="mb-6 text-sm font-semibold leading-relaxed text-ink-muted">
          {home
            ? `This area belongs to another role. Your ${roleLabel(user!.role)} workspace has everything you have access to.`
            : "This dashboard belongs to another role."}
        </p>

        {home ? (
          <div className="space-y-3">
            <Link
              href={home}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#8127cf] px-6 text-sm font-black text-white transition-colors hover:bg-[#6d1fae]"
            >
              Go to my dashboard
            </Link>
            <SignOutLink />
          </div>
        ) : (
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#1f1a23] px-6 text-sm font-black text-white"
          >
            Back to login
          </Link>
        )}
      </section>
    </main>
  );
}
