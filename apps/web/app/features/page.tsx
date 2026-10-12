import { FeaturesPage } from "../../components/marketing/marketing-site";
import { createMarketingMetadata } from "../../lib/seo/marketing-metadata";

export const metadata = createMarketingMetadata({
  title: "Website audit features",
  description:
    "Explore SiteSignal website audit coverage for SEO, performance, accessibility, security, and technical quality.",
  path: "/features",
});

export default function FeaturesRoute() {
  return <FeaturesPage />;
}
