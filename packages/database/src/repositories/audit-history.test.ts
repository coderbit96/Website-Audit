import assert from "node:assert/strict";
import test from "node:test";

import { calculateAuditScoreChange } from "./audit-history.js";

test("calculates deterministic audit score changes", () => {
  assert.equal(calculateAuditScoreChange(82, 77), 5);
  assert.equal(calculateAuditScoreChange(74, 77), -3);
  assert.equal(calculateAuditScoreChange(77, 77), 0);
});

test("does not claim a score change without two evaluated scores", () => {
  assert.equal(calculateAuditScoreChange(null, 77), null);
  assert.equal(calculateAuditScoreChange(77, null), null);
  assert.equal(calculateAuditScoreChange(null, null), null);
});
