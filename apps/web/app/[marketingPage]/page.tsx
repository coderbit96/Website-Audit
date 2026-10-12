import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getMarketingPage,
  isMarketingPageSlug,
  MarketingInfoPage,
} from "../../components/marketing/marketing-site";
import { createMarketingMetadata } from "../../lib/seo/marketing-metadata";

type MarketingRouteProps = { params: Promise<{ marketingPage: string }> };

const routes = [
  "agencies",
  "pricing",
  "about",
  "contact",
  "privacy",
  "terms",
] as const;

export function generateStaticParams() {
  return routes.map((marketingPage) => ({ marketingPage }));
}

export async function generateMetadata({
  params,
}: MarketingRouteProps): Promise<Metadata> {
  const { marketingPage } = await params;
  if (!isMarketingPageSlug(marketingPage)) return {};
  const page = getMarketingPage(marketingPage);
  return createMarketingMetadata({
    title: page.eyebrow,
    description: page.description,
    path: `/${marketingPage}`,
  });
}

export default async function MarketingRoute({ params }: MarketingRouteProps) {
  const { marketingPage } = await params;
  if (!isMarketingPageSlug(marketingPage)) notFound();
  return <MarketingInfoPage page={getMarketingPage(marketingPage)} />;
}
