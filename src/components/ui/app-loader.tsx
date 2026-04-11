import { GraduationCap } from 'lucide-react';
import styles from '@/components/SplashScreen.module.css';

export function AppLoaderUI() {
  return (
    <div 
      className={styles.splashContainer} 
      style={{ animation: 'none' }}
    >
      <div className={styles.contentWrapper} style={{ animation: 'none' }}>
        <div className={styles.logoContainer}>
          <h1 className={styles.logoText}>
            <span className={styles.letter}>S</span>
            <span className={styles.letter}>k</span>
            <div className={styles.capWrapper}>
              <GraduationCap className={styles.graduationCap} strokeWidth={2.5} />
              <div className={styles.eye}>
                <div className={styles.pupil} style={{ animationDuration: '2s' }} />
              </div>
            </div>
            <div className={styles.eye}>
              <div className={styles.pupil} style={{ animationDuration: '2s' }} />
            </div>
            <span className={styles.letter}>l</span>
            <span className={styles.letter}>e</span>
            <span className={styles.letter}>e</span>
            <span className={styles.ai}>AI</span>
          </h1>
          <p className={styles.tagline}>Processing...</p>
        </div>

        <div className={styles.loaderWrapper}>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill} 
              style={{ 
                animation: 'none', 
                width: '100%', 
                background: 'linear-gradient(90deg, transparent, #8127CF, transparent)',
                backgroundSize: '200% 100%',
                animationName: 'shimmer',
                animationDuration: '1.5s',
                animationIterationCount: 'infinite',
                animationTimingFunction: 'linear'
              }} 
            />
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}} />
    </div>
  );
}
