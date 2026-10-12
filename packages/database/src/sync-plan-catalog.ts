import { getPlanDisplay, PlanTier } from "@website-audit/shared";

import { connectToDatabase, disconnectFromDatabase } from "./connection.js";
import { PlanModel } from "./models.js";

const tiers = [PlanTier.FREE, PlanTier.PRO, PlanTier.AGENCY] as const;

try {
  await connectToDatabase();
  for (const tier of tiers) {
    const display = getPlanDisplay(tier);
    const result = await PlanModel.updateOne(
      { slug: tier.toLowerCase() },
      {
        $setOnInsert: {
          slug: tier.toLowerCase(),
          name: display.name,
          description: `${display.name} SiteSignal plan`,
          monthlyPriceCents: display.monthlyPriceCents,
          yearlyPriceCents: 0,
          monthlyAuditLimit: display.entitlements.limits.monthlyAudits,
          pagesPerAuditLimit: display.entitlements.limits.crawlPagesPerAudit,
          workspaceMemberLimit: display.entitlements.limits.workspaceMembers,
          isActive: true,
        },
      },
      { upsert: true },
    );
    console.info(
      `[ok] ${tier} plan ${result.upsertedCount ? "created" : "already present; preserved"}.`,
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] Plan catalog sync failed: ${message}`);
  process.exitCode = 1;
} finally {
  await disconnectFromDatabase();
}
