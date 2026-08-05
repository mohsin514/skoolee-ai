import { GraduationCap } from "lucide-react";
import styles from "./SkooleeLogo.module.css";

/**
 * The Skoolee wordmark, where the two o's are eyes whose pupils look around.
 *
 * Ported from the marketing site so the product and the site show the same
 * mark. Everything is sized in `em`, so `size` alone scales the eyes, cap and
 * letters together.
 */
export default function SkooleeLogo({
  size = "1.5rem",
  className = "",
  /** Seconds for one full look-around cycle. The app uses 4s idle, 2s loading. */
  lookDuration = 4,
  /** "heavy" thickens the letters and eye rings — good for hero/auth headers. */
  weight = "regular",
}: {
  size?: string;
  className?: string;
  lookDuration?: number;
  weight?: "regular" | "heavy";
}) {
  return (
    <span
      role="img"
      aria-label="Skoolee AI"
      className={`${styles.logo} ${weight === "heavy" ? styles.logoHeavy : ""} ${className}`}
      style={{
        fontSize: size,
        ["--skoolee-look-duration" as string]: `${lookDuration}s`,
      }}
    >
      <span aria-hidden="true">S</span>
      <span aria-hidden="true">k</span>

      {/* First "o" — carries the graduation cap */}
      <span className={styles.capWrap} aria-hidden="true">
        <GraduationCap className={styles.cap} strokeWidth={2.5} />
        <span className={styles.eye}>
          <span className={styles.pupil} />
        </span>
      </span>

      {/* Second "o" */}
      <span className={styles.eye} aria-hidden="true">
        <span className={styles.pupil} />
      </span>

      <span aria-hidden="true">l</span>
      <span aria-hidden="true">e</span>
      <span aria-hidden="true">e</span>
      <span className={styles.ai} aria-hidden="true">
        AI
      </span>
    </span>
  );
}
