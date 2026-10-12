import type { Metadata } from "next";

import { MarketingHome } from "../components/marketing/marketing-site";
import { createMarketingMetadata } from "../lib/seo/marketing-metadata";
import { getAbsoluteSiteUrl } from "../lib/seo/site-url";

export const metadata: Metadata = createMarketingMetadata({
  title: "Website audit software",
  description:
    "Run evidence-based SEO, performance, accessibility, security, and technical website audits with SiteSignal.",
  path: "/",
});

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "SiteSignal",
        url: getAbsoluteSiteUrl("/"),
        description:
          "Website audit software for SEO, performance, accessibility, security, and technical quality.",
      },
      {
        "@type": "SoftwareApplication",
        name: "SiteSignal",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: getAbsoluteSiteUrl("/"),
        description:
          "Evidence-based website audit software for SEO, performance, accessibility, security, and technical quality.",
      },
    ],
  };

  return (
    <>
      <MarketingHome />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
