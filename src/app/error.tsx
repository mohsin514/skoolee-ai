'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary]', error);
    }
  }, [error]);

  return (
    <main className="min-h-screen bg-[#f3f4f9] flex items-center justify-center p-6 text-[#1f1a23]">
      <section className="bg-white rounded-[32px] border border-[#cfc2d6]/20 shadow-2xl p-10 max-w-md text-center">
        <div className="h-16 w-16 rounded-[24px] bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black tracking-normal mb-2">Something went wrong</h1>
        <p className="text-sm font-semibold text-[#4d4354]/60 leading-relaxed mb-6">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="inline-flex h-11 px-6 items-center justify-center gap-2 rounded-2xl bg-[#1f1a23] text-white font-black text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </section>
    </main>
  );
}
