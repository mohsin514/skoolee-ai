import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://app.skooleeai.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/login",
          "/register",
          "/forgot-password",
          "/verify-success",
          "/accept-invite",
          "/first-login",
          "/onboarding",
          "/teacher-onboarding",
          "/dashboard",
          "/super",
          "/owner",
          "/principal",
          "/admin",
          "/teacher",
          "/student",
          "/parent",
          "/subscription-suspended",
          "/safepay",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}