"use client";

import Image from "next/image";
import { useState } from "react";

interface AvatarImageProps {
  src: string;
  alt?: string;
  className?: string;
}

export function AvatarImage({
  src,
  alt = "Profile photo",
  className = "h-full w-full object-cover",
}: AvatarImageProps) {
  const [error, setError] = useState(false);

  if (error || !src) return null;

  const isExternal =
    src.startsWith("http") &&
    !src.includes("amazonaws.com") &&
    !src.includes("r2.cloudflarestorage.com");

  return (
    <Image
      src={src}
      alt={alt}
      width={96}
      height={96}
      className={className}
      onError={() => setError(true)}
      unoptimized={isExternal}
    />
  );
}
