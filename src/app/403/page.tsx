import Link from "next/link";
import { cookies } from "next/headers";
import { getDisplayLocale } from "@/lib/locale/display";
import { LANGUAGE_COOKIE, parseLanguage } from "@/lib/locale/language-cookie";
import { ShieldAlert } from "lucide-react";
import { getAuthUser } from "@/lib/auth";
import { dashboardPathForRole } from "@/lib/roles";
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
  const language = user ? (await getDisplayLocale(user)).language : parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value) ?? "en";
  const copy = language === "ar" ? {
    title: "الوصول مقيّد", description: "هذا الحساب لا يملك صلاحية الوصول إلى هذه الصفحة. يمكنك العودة إلى مساحة عملك أو التواصل مع مسؤول المدرسة.",
    home: "العودة إلى مساحة عملي", login: "العودة إلى تسجيل الدخول", signOut: "تسجيل الخروج",
  } : language === "ur" ? {
    title: "رسائی محدود ہے", description: "اس اکاؤنٹ کو اس صفحے تک رسائی کی اجازت نہیں۔ اپنی کام کی جگہ پر واپس جائیں یا اسکول کے منتظم سے رابطہ کریں۔",
    home: "اپنی کام کی جگہ پر واپس جائیں", login: "لاگ اِن پر واپس جائیں", signOut: "سائن آؤٹ",
  } : {
    title: "Access Restricted", description: "This account cannot access this page. Return to your workspace or contact your school administrator.",
    home: "Go to my dashboard", login: "Back to login", signOut: "Sign out",
  };

  return (
    <main lang={language} dir={language === "en" ? "ltr" : "rtl"} className="flex min-h-screen items-center justify-center bg-[#f3f4f9] p-6 text-[#1f1a23]">
      <section
        className="sk-panel sk-rise max-w-md p-10 text-center"
        style={{ animationDelay: "0ms" }}
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#fbf0fe] text-[#8127cf]">
          <ShieldAlert aria-hidden="true" className="h-8 w-8" />
        </div>
        <h1 className="mb-2 text-2xl font-black tracking-normal">{copy.title}</h1>
        <p className="mb-6 text-sm font-semibold leading-relaxed text-ink-muted">
          {copy.description}
        </p>

        {home ? (
          <div className="space-y-3">
            <Link
              href={home}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#8127cf] px-6 text-sm font-black text-white transition-colors hover:bg-[#6d1fae]"
            >
              {copy.home}
            </Link>
            <SignOutLink label={copy.signOut} />
          </div>
        ) : (
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#1f1a23] px-6 text-sm font-black text-white"
          >
            {copy.login}
          </Link>
        )}
      </section>
    </main>
  );
}
