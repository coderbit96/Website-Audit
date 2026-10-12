import assert from "node:assert/strict";
import test from "node:test";

import { getPlanDisplay, PlanTier } from "./index.js";

test("displayed plans use the same central audit limits", () => {
  assert.deepEqual(
    [PlanTier.FREE, PlanTier.PRO, PlanTier.AGENCY].map(
      (tier) => getPlanDisplay(tier).entitlements.limits.monthlyAudits,
    ),
    [3, 50, 250],
  );
  assert.deepEqual(
    [PlanTier.FREE, PlanTier.PRO, PlanTier.AGENCY].map(
      (tier) => getPlanDisplay(tier).monthlyPriceCents,
    ),
    [0, 99_900, 299_900],
  );
});
