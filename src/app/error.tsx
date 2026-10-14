'use client';

import { Button } from "@/components/ui/button";
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
      <section className="sk-panel p-10 max-w-md text-center">
        <div className="h-16 w-16 rounded-[24px] bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black tracking-normal mb-2">Something went wrong</h1>
        <p className="text-sm font-semibold text-ink-muted leading-relaxed mb-6">
          An unexpected error occurred. Please try again.
        </p>
        <Button variant="dark"
          onClick={reset}
          className="items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
      </section>
    </main>
  );
}
