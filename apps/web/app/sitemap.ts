import type { MetadataRoute } from "next";

import { getAbsoluteSiteUrl } from "../lib/seo/site-url";

const publicRoutes: ReadonlyArray<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/audit", priority: 0.9, changeFrequency: "weekly" },
  { path: "/features", priority: 0.9, changeFrequency: "monthly" },
  { path: "/features/seo-audit", priority: 0.8, changeFrequency: "monthly" },
  { path: "/features/performance", priority: 0.8, changeFrequency: "monthly" },
  {
    path: "/features/accessibility",
    priority: 0.8,
    changeFrequency: "monthly",
  },
  { path: "/features/security", priority: 0.8, changeFrequency: "monthly" },
  { path: "/agencies", priority: 0.8, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/about", priority: 0.6, changeFrequency: "yearly" },
  { path: "/contact", priority: 0.6, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map(({ path, priority, changeFrequency }) => ({
    url: getAbsoluteSiteUrl(path),
    priority,
    changeFrequency,
  }));
}
