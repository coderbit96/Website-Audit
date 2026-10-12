import type { Metadata } from "next";

type MarketingMetadataInput = {
  title: string;
  description: string;
  path: string;
};

/** Builds consistent metadata for indexable public marketing pages. */
export function createMarketingMetadata({
  title,
  description,
  path,
}: MarketingMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      title,
      description,
      siteName: "SiteSignal",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
