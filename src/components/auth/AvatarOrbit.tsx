import { GraduationCap } from "lucide-react";
import styles from "./AvatarOrbit.module.css";
import AvatarBubble from "./AvatarBubble";

const RING = [265, 205, 330, 28, 160, 300];

/**
 * A ring of avatars orbiting a Skoolee medallion — a visual shorthand for
 * "every role, always connected". Purely decorative (aria-hidden); sits
 * behind panel copy on the auth brand panels.
 */
export default function AvatarOrbit({
  size = 300,
  duration = 46,
  className = "",
}: {
  size?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`${styles.wrap} pointer-events-none select-none ${className}`}
      style={{
        width: size,
        height: size,
        ["--sk-orbit-r" as string]: `${size * 0.42}px`,
        ["--sk-orbit-duration" as string]: `${duration}s`,
      }}
    >
      <div className={styles.ring}>
        {RING.map((hue, i) => {
          const angle = (i / RING.length) * 360;
          return (
            <div
              key={i}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(-1 * var(--sk-orbit-r))) rotate(${-angle}deg)`,
              }}
            >
              <div className={styles.counter}>
                <div className={styles.bob} style={{ ["--sk-orbit-bob-duration" as string]: `${3 + i * 0.35}s` }}>
                  <AvatarBubble hue={hue} className="h-9 w-9 sm:h-11 sm:w-11" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={`${styles.medallion} flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-white/15 backdrop-blur-md sm:h-[4.5rem] sm:w-[4.5rem]`}
        >
          <GraduationCap className="h-7 w-7 text-white" strokeWidth={2.2} />
        </div>
      </div>
    </div>
  );
}
