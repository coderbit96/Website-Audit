import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardIcon } from "../../../components/dashboard/dashboard-icon";
import {
  getDashboardItemBySection,
  type DashboardNavigationItem,
} from "../../../lib/dashboard/navigation";

type SectionPageProps = {
  params: Promise<{ section: string }>;
};

async function getSection(
  params: SectionPageProps["params"],
): Promise<DashboardNavigationItem> {
  const { section } = await params;
  const item = getDashboardItemBySection(section);

  if (!item) {
    notFound();
  }

  return item;
}

export async function generateMetadata({
  params,
}: SectionPageProps): Promise<Metadata> {
  const item = await getSection(params);
  return { title: `${item.label} | SiteSignal` };
}

export default async function DashboardSectionPage({
  params,
}: SectionPageProps) {
  const item = await getSection(params);

  return (
    <div className="placeholder-page">
      <section className="placeholder-heading">
        <p className="page-eyebrow">Workspace</p>
        <h1>{item.label}</h1>
        <p>{item.description}.</p>
      </section>

      <section
        className="feature-foundation-state"
        aria-label="Feature unavailable"
      >
        <div className="empty-state-icon">
          <DashboardIcon name={item.icon} />
        </div>
        <div>
          <span className="foundation-badge">Unavailable</span>
          <h2>{item.label} is not available yet</h2>
          <p>
            This workspace capability is reserved for a future release. There
            are no inactive controls or sample records to manage here.
          </p>
          <Link href="/dashboard">Return to overview</Link>
        </div>
      </section>
    </div>
  );
}
