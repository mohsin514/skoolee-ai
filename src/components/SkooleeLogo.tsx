import type { Ref } from "react";
import { GraduationCap } from "lucide-react";
import type { MascotMood } from "@/lib/auth/mascot-mood";
import styles from "./SkooleeLogo.module.css";

/**
 * The Skoolee wordmark, where the two o's are eyes whose pupils look around.
 *
 * Ported from the marketing site so the product and the site show the same
 * mark. Everything is sized in `em`, so `size` alone scales the eyes, cap and
 * letters together.
 *
 * `expressive` (auth screens only, via AuthMascot) adds named parts — lids, a
 * smile, the cap — and a `data-mood` hook. The poses themselves live in the
 * unlayered "Auth · Front Desk" block of globals.css. The default (non
 * expressive) markup below is unchanged, so dashboards and snapshots never move.
 */
export default function SkooleeLogo({
  size = "1.5rem",
  className = "",
  /** Seconds for one full look-around cycle. The app uses 4s idle, 2s loading. */
  lookDuration = 4,
  /** "heavy" thickens the letters and eye rings — good for hero/auth headers. */
  weight = "regular",
  /** Opt-in living face for the auth front door. */
  expressive = false,
  /** The pose shown in expressive mode (sets `data-mood`). */
  mood = "idle",
  ref,
}: {
  size?: string;
  className?: string;
  lookDuration?: number;
  weight?: "regular" | "heavy";
  expressive?: boolean;
  mood?: MascotMood;
  ref?: Ref<HTMLSpanElement>;
}) {
  if (expressive) {
    return <ExpressiveMark size={size} className={className} lookDuration={lookDuration} weight={weight} mood={mood} markRef={ref} />;
  }

  return (
    <span
      dir="ltr"
      role="img"
      aria-label="Skoolee AI"
      className={`${styles.logo}  ${weight === "heavy" ? styles.logoHeavy : ""}  ${className}`}
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

/** The same mark with named anatomy. Still one `role="img"`, every child hidden. */
function ExpressiveMark({ size, className, lookDuration, weight, mood, markRef }: {
  size: string;
  className: string;
  lookDuration: number;
  weight: "regular" | "heavy";
  mood: MascotMood;
  markRef?: Ref<HTMLSpanElement>;
}) {
  const classes = [styles.logo, weight === "heavy" ? styles.logoHeavy : "", className, "sk-mascot"].filter(Boolean).join(" ");
  return (
    <span
      ref={markRef}
      dir="ltr"
      role="img"
      aria-label="Skoolee AI"
      data-sk-mascot=""
      data-mood={mood}
      className={classes}
      style={{
        fontSize: size,
        ["--skoolee-look-duration" as string]: `${lookDuration}s`,
      }}
    >
      <span aria-hidden="true">S</span>
      <span aria-hidden="true">k</span>

      {/* First "o" — carries the graduation cap */}
      <span className={styles.capWrap} aria-hidden="true">
        <GraduationCap className={styles.cap} strokeWidth={2.5} data-part="cap" />
        <span className={styles.eye} data-part="eye" data-eye="1">
          <span className={styles.pupil} data-part="pupil" />
          <span data-part="lid" />
          <span data-part="smile" />
        </span>
      </span>

      {/* Second "o" */}
      <span className={styles.eye} aria-hidden="true" data-part="eye" data-eye="2">
        <span className={styles.pupil} data-part="pupil" />
        <span data-part="lid" />
        <span data-part="smile" />
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
