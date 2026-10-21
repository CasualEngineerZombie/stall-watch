import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * The login page is the only stable public URL. It is also the canonical entry
 * point for the app, because "/" redirects into protected territory.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/login`,
      lastModified: new Date("2026-10-21T00:00:00.000Z"),
      changeFrequency: "monthly",
      priority: 1,
      images: [`${SITE_URL}/og.png`],
    },
  ];
}
