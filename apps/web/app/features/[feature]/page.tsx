import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  FeatureDetailPage,
  getFeaturePage,
  isFeatureSlug,
} from "../../../components/marketing/marketing-site";
import { createMarketingMetadata } from "../../../lib/seo/marketing-metadata";

type FeatureRouteProps = { params: Promise<{ feature: string }> };

export function generateStaticParams() {
  return ["seo-audit", "performance", "accessibility", "security"].map(
    (feature) => ({ feature }),
  );
}

export async function generateMetadata({
  params,
}: FeatureRouteProps): Promise<Metadata> {
  const { feature } = await params;
  if (!isFeatureSlug(feature)) return {};
  const page = getFeaturePage(feature);
  return createMarketingMetadata({
    title: page.eyebrow,
    description: page.description,
    path: `/features/${feature}`,
  });
}

export default async function FeatureRoute({ params }: FeatureRouteProps) {
  const { feature } = await params;
  if (!isFeatureSlug(feature)) notFound();
  return <FeatureDetailPage feature={getFeaturePage(feature)} />;
}
