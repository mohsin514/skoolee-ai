import { cookies } from "next/headers";
import { AuthLocaleProvider } from "@/components/locale/AuthLocaleProvider";
import { LANGUAGE_COOKIE, parseLanguage } from "@/lib/locale/language-cookie";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The pre-login language cookie makes every (auth) page render server-side in
  // the chosen language and direction. Reading it makes these routes dynamic,
  // which they already are per request.
  const initial = parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value) ?? "en";
  return (
    <AuthLocaleProvider initialLanguage={initial}>
      {/* `font-['Fredoka']` was here, but Fredoka is not loaded anywhere in the app
          — the only font is Plus Jakarta Sans, via next/font in the root layout. It
          declared a family that does not resolve, with no fallback, so anything
          under it that did not re-declare a font fell back to the browser default.
          Every page here happens to set `font-sans` itself, which is why it was
          invisible; `font-sans` on the wrapper is what it always meant. */}
      <div className="min-h-screen font-sans">
        {children}
      </div>
    </AuthLocaleProvider>
  );
}
