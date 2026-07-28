import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Behind Clerk auth with no content to offer an anonymous crawler — kept out of the
        // crawl budget. Ephemeral personal URLs (/share/*, /invitations/*) are deliberately
        // NOT disallowed here: they rely on a page-level `noindex` meta tag instead, since a
        // robots.txt disallow would stop Googlebot from ever seeing that tag.
        disallow: ["/dashboard", "/drive", "/admin"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
