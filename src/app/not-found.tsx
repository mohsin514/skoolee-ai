import Link from "next/link";
import { Search } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#f3f4f9] flex items-center justify-center p-6 text-[#1f1a23] font-sans">
      <section className="bg-white rounded-[32px] border border-[#cfc2d6]/20 shadow-2xl p-10 max-w-md text-center">
        <div className="h-16 w-16 rounded-[24px] bg-[#fbf0fe] text-[#8127cf] flex items-center justify-center mx-auto mb-6">
          <Search className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black tracking-normal mb-2">Page not found</h1>
        <p className="text-sm font-semibold text-ink-muted leading-relaxed mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/login"
          className="inline-flex h-11 px-6 items-center justify-center rounded-2xl bg-[#1f1a23] text-white font-black text-sm"
        >
          Go to dashboard
        </Link>
      </section>
    </main>
  );
}
