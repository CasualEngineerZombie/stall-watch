import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Only the public sign-in page belongs in search. Everything behind auth is
 * disallowed here and also marked noindex at the page level.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/login"],
      disallow: ["/projects", "/alerts", "/detector", "/auth/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
