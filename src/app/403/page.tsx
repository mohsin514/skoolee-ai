import Link from "next/link";
import { cookies } from "next/headers";
import { getDisplayLocale } from "@/lib/locale/display";
import { LANGUAGE_COOKIE, parseLanguage } from "@/lib/locale/language-cookie";
import { translateUi } from "@/lib/locale/ui-messages";
import { Compass, ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth";
import { isInstitutionAuthority } from "@/lib/auth/institution";
import { dashboardPathForRole } from "@/lib/roles";
import { SignOutLink } from "./sign-out-link";

export const dynamic = "force-dynamic";

export default async function ForbiddenPage() {
  // Landing here almost always means a signed-in user opened a page that
  // belongs to another workspace — a link they were sent, or a stale bookmark.
  // Their own console is one click away, so offer that first. The copy never
  // tells the school's own administrator to "contact your school administrator".
  const user = await getAuthUser();
  const home = user ? dashboardPathForRole(user.role) : null;
  const language = user ? (await getDisplayLocale(user)).language : parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value) ?? "en";
  const t = (key: string) => translateUi(key, language);
  const authority = user ? isInstitutionAuthority(user) : false;

  const title = user ? t("This lives in another workspace") : t("Access restricted");
  const description = !user
    ? t("Sign in with an account that can open this page.")
    : authority || user.role === "APP_OWNER"
      ? t("Your account opens a different workspace. Your own dashboard has everything you manage.")
      : t("Your account cannot open this page. Your own dashboard has your work; ask your school's administrator if you need more access.");
  const Icon = user ? Compass : ShieldAlert;

  return (
    <main lang={language} dir={language === "en" ? "ltr" : "rtl"} className="sk-app-canvas flex min-h-screen items-center justify-center p-4 text-ink-strong sm:p-6">
      <section className="sk-panel sk-enter-scale sk-elevation-3 relative isolate w-full max-w-md overflow-hidden p-6 text-center sm:p-10">
        {/* The same backdrop and gradient tile as the 404 view, so every "you can't open this" screen reads as one family. */}
        <div aria-hidden="true" className="sk-grid-pattern pointer-events-none absolute inset-x-0 top-0 -z-10 h-48" />
        <p className="mb-4 flex justify-center"><span className="sk-eyebrow rounded-full border border-border-subtle bg-card px-3 py-1 tabular-nums text-ink-subtle">403</span></p>
        <div aria-hidden="true" className="sk-gradient-border mx-auto mb-6 grid size-16 place-items-center rounded-3xl text-primary shadow-md">
          <Icon className="size-7" />
        </div>
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-ink-strong">{title}</h1>
        <p className="mb-6 text-sm font-normal leading-relaxed text-ink-muted">{description}</p>

        {home ? (
          <div className="space-y-3">
            <Link href={home} className={buttonVariants({ className: "w-full" })}>
              {t("Go to my dashboard")}
            </Link>
            <SignOutLink label={t("Sign out")} />
          </div>
        ) : (
          <Link href="/login" className={buttonVariants({ variant: "dark", className: "w-full sm:w-auto sm:px-6" })}>
            {t("Back to login")}
          </Link>
        )}
      </section>
    </main>
  );
}
