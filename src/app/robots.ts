import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ravn.com.ar";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/landing", "/landing.html"],
        disallow: ["/", "/api/", "/o/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
