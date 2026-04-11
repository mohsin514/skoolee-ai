'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import styles from './SplashScreen.module.css';

export default function SplashScreen() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Keep splash visible for 8 seconds, then redirect
    const timer = setTimeout(() => {
      setIsVisible(false);
      router.push('/login');
    }, 8000);

    return () => clearTimeout(timer);
  }, [router]);

  if (!isVisible) return null;

  return (
    <div className={styles.splashContainer}>
      <div className={styles.contentWrapper}>
        <div className={styles.logoContainer}>
          <h1 className={styles.logoText}>
            <span className={styles.letter}>S</span>
            <span className={styles.letter}>k</span>
            <div className={styles.capWrapper}>
              <GraduationCap className={styles.graduationCap} strokeWidth={2.5} />
              <div className={styles.eye}>
                <div className={styles.pupil} />
              </div>
            </div>
            <div className={styles.eye}>
              <div className={styles.pupil} />
            </div>
            <span className={styles.letter}>l</span>
            <span className={styles.letter}>e</span>
            <span className={styles.letter}>e</span>
            <span className={styles.ai}>AI</span>
          </h1>
          <p className={styles.tagline}>Igniting Potential...</p>
        </div>

        <div className={styles.loaderWrapper}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} />
          </div>
        </div>
      </div>
    </div>
  );
}
