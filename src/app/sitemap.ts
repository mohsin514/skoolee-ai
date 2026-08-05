import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://app.skooleeai.com";

// Only self-canonical, publicly indexable routes belong in the sitemap. The
// feature landing pages carry canonical links to the marketing site and the
// root is a noindex login redirect, so both are excluded here.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const publicPages = [
    "/privacy",
    "/security",
    "/ai-governance",
    "/human-review-policy",
  ];

  return publicPages.map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));
}