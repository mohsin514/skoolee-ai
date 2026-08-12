'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import styles from './SplashScreen.module.css';

export default function SplashScreen() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 2800;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);
      if (pct >= 100) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress === 100) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        router.push('/login');
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [progress, router]);

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
        </div>

        <div className={styles.loaderWrapper}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} />
          </div>
          <span className={styles.progressText}>{progress}%</span>
        </div>
      </div>
    </div>
  );
}
