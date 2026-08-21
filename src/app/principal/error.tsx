'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[DashboardError]', error);
    }
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="bg-white rounded-[32px] border border-[#cfc2d6]/20 shadow-xl p-10 max-w-md text-center">
        <div className="h-14 w-14 rounded-[20px] bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black text-[#1f1a23] mb-2">Page Error</h2>
        <p className="text-sm font-semibold text-ink-muted leading-relaxed mb-6">
          This page encountered an error. Your data is safe.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex h-10 px-5 items-center justify-center gap-2 rounded-xl bg-[#8127cf] text-white font-bold text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
          <Link
            href="/login"
            className="inline-flex h-10 px-5 items-center justify-center gap-2 rounded-xl border border-[#cfc2d6]/30 text-ink font-bold text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
