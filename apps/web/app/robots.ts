import type { MetadataRoute } from "next";

import { getAbsoluteSiteUrl } from "../lib/seo/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/dashboard/",
        "/login",
        "/register",
        "/forgot-password",
        "/audit/",
      ],
    },
    sitemap: getAbsoluteSiteUrl("/sitemap.xml"),
  };
}
