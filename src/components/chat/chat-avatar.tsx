"use client";

import { AvatarImage, initialsOf } from "@/components/ui/avatar-image";
import { cn } from "@/lib/utils";

/**
 * Six brand-adjacent gradients, picked deterministically from the person's id.
 *
 * A single flat colour made a list of twenty guardians read as one grey block;
 * a stable tint per person gives each row something to recognise before the
 * name is read. Deterministic so the same person keeps the same colour across
 * the list, the thread header and the member chips.
 */
const TINTS = [
  "from-[#8127cf] to-[#b10e6b]",
  "from-[#6a1fb0] to-[#9c48ea]",
  "from-[#b10e6b] to-[#e0559a]",
  "from-[#5b21b6] to-[#8127cf]",
  "from-[#9c48ea] to-[#c86dd7]",
  "from-[#7c3aed] to-[#db2777]",
] as const;

export function tintFor(seed: string | null | undefined) {
  if (!seed) return TINTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

const SIZES = {
  sm: { box: "h-8 w-8 rounded-xl", text: "text-[10px]", dot: "h-2.5 w-2.5" },
  md: { box: "h-10 w-10 rounded-2xl", text: "text-[11px]", dot: "h-3 w-3" },
  lg: { box: "h-11 w-11 rounded-2xl", text: "text-xs", dot: "h-3 w-3" },
  xl: { box: "h-14 w-14 rounded-[20px]", text: "text-sm", dot: "h-3.5 w-3.5" },
} as const;

interface ChatAvatarProps {
  name: string;
  /** Stable colour seed — the user id, so a rename does not change the tint. */
  seed?: string | null;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  /** undefined hides the indicator entirely (groups, where it means nothing). */
  online?: boolean;
  className?: string;
  ring?: boolean;
}

export function ChatAvatar({
  name,
  seed,
  imageUrl,
  size = "md",
  online,
  className,
  ring = false,
}: ChatAvatarProps) {
  const s = SIZES[size];

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "grid place-items-center overflow-hidden bg-gradient-to-br font-black text-white",
          "shadow-[0_6px_16px_-6px_rgba(129,39,207,0.55)]",
          tintFor(seed ?? name),
          s.box,
          s.text,
          ring && "ring-2 ring-white"
        )}
      >
        {imageUrl ? (
          <AvatarImage src={imageUrl} name={name} alt="" />
        ) : (
          <span aria-hidden>{initialsOf(name)}</span>
        )}
      </span>

      {online !== undefined && (
        <span className={cn("absolute -bottom-0.5 -right-0.5 grid place-items-center", s.dot)}>
          {online && (
            <span
              className="sk-ping absolute inset-0 rounded-full bg-emerald-400"
              aria-hidden
            />
          )}
          <span
            className={cn(
              "relative h-full w-full rounded-full border-2 border-white",
              online ? "bg-emerald-500" : "bg-[#cfc2d6]"
            )}
          />
        </span>
      )}
    </span>
  );
}
