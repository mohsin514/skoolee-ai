'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { AppLoaderUI } from '@/components/ui/app-loader';

type AppLoaderContextType = {
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
};

const AppLoaderContext = createContext<AppLoaderContextType | undefined>(undefined);

export const useAppLoader = () => {
  const context = useContext(AppLoaderContext);
  if (!context) {
    throw new Error('useAppLoader must be used within an AppLoaderProvider');
  }
  return context;
};

export function AppLoaderProvider({ children }: { children: React.ReactNode }) {
  // Starts FALSE on purpose.
  //
  // This was `true`, which meant the full-screen splash was part of the
  // server-rendered HTML and covered content the server had already produced
  // until React finished hydrating — measured at 8-14s on a dev build, and a
  // blank-looking app on any slow connection. The page was never actually
  // waiting on data; it was waiting on JavaScript to arrive and un-hide it.
  //
  // Route transitions are covered by the 11 loading.tsx Suspense boundaries,
  // which render inside the shell and keep the nav and header on screen (CP-6:
  // "skeletons matching final layout", not a full-page splash that discards
  // context). setLoading() remains available for genuinely long client-side
  // operations that have nothing to render yet.
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // On initial mount, dismiss loader after a short delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 100);

    // Prevent loader getting stuck on back-forward cache (BFCache restorations)
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setIsLoading(false); // Force hide if restored from cache natively
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // Automatically hide loader when route changes complete
  useEffect(() => {
    // Unconditionally ensure loader is dismissed after route transition
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 150);
    
    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  // Handle setting loading state with a slight delay when hiding to prevent flashing
  const handleSetLoading = (loading: boolean) => {
    if (loading) {
      setIsLoading(true);
    } else {
      setTimeout(() => setIsLoading(false), 50);
    }
  };

  // We wrap AppLoaderUI so that only the UI changes fade and we only render once
  return (
    <AppLoaderContext.Provider value={{ isLoading, setLoading: handleSetLoading }}>
      {children}
      {isLoading && <AppLoaderUI />}
    </AppLoaderContext.Provider>
  );
}
