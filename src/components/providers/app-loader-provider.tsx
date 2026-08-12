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
  // Start with true so it shows on app reload (hydration)
  const [isLoading, setIsLoading] = useState(true);
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
