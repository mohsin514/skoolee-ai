export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `font-['Fredoka']` was here, but Fredoka is not loaded anywhere in the app
    // — the only font is Plus Jakarta Sans, via next/font in the root layout. It
    // declared a family that does not resolve, with no fallback, so anything
    // under it that did not re-declare a font fell back to the browser default.
    // Every page here happens to set `font-sans` itself, which is why it was
    // invisible; `font-sans` on the wrapper is what it always meant.
    <div className="min-h-screen bg-[#FFF7FE] font-sans">
      {children}
    </div>
  );
}
