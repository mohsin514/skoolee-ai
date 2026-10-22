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
      <section className="sk-panel sk-enter-scale sk-elevation-3 w-full max-w-md p-6 text-center sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-50 text-primary ring-1 ring-brand-100">
          <Icon aria-hidden="true" className="h-8 w-8" />
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
