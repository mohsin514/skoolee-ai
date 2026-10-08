"use client";

import Image from "next/image";
import { useState } from "react";
import { resolveMediaUrl } from "@/lib/storage/s3";

interface AvatarImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  /**
   * Person's name. When there is no photo we draw their initials locally.
   * Previously these fell back to an api.dicebear.com URL, which sent student
   * names and staff emails to a third party on every render and left an empty
   * circle whenever that request was slow or blocked.
   */
  name?: string | null;
  /** Tailwind text size for the initials, matched to the avatar's box. */
  initialsClassName?: string;
}

/** First and last initial — "Ayesha Khan" becomes "AK". */
export function initialsOf(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AvatarImage({
  src,
  alt = "Profile photo",
  className = "h-full w-full object-cover",
  name,
  initialsClassName = "text-sm",
}: AvatarImageProps) {
  const [error, setError] = useState(false);
  const resolved = resolveMediaUrl(src);

  // No usable photo — show initials rather than nothing.
  if (error || !resolved) {
    if (!name) return null;
    return (
      <span
        className={`flex h-full w-full items-center justify-center bg-[#fbf0fe] font-black uppercase tracking-wide text-[#8127cf]/70 ${initialsClassName}`}
        aria-label={alt}
      >
        {initialsOf(name)}
      </span>
    );
  }

  const isExternal =
    resolved.startsWith("http") &&
    !resolved.includes("amazonaws.com") &&
    !resolved.includes("r2.cloudflarestorage.com");

  return (
    <Image
      src={resolved}
      alt={alt}
      width={96}
      height={96}
      className={className}
      onError={() => setError(true)}
      unoptimized={isExternal}
    />
  );
}
