import assert from "node:assert/strict";
import test from "node:test";

import { parseAuditComparisonSelection } from "./comparison-validation.js";

test("parses valid audit comparison selections", () => {
  assert.deepEqual(
    parseAuditComparisonSelection({
      website: "507f1f77bcf86cd799439011",
      auditA: "507f1f77bcf86cd799439012",
      auditB: "507f1f77bcf86cd799439013",
    }),
    {
      website: "507f1f77bcf86cd799439011",
      auditA: "507f1f77bcf86cd799439012",
      auditB: "507f1f77bcf86cd799439013",
    },
  );
});

test("drops malformed IDs without discarding safe selections", () => {
  assert.deepEqual(
    parseAuditComparisonSelection({
      website: "507f1f77bcf86cd799439011",
      auditA: "unsafe",
      auditB: ["507f1f77bcf86cd799439013", "507f1f77bcf86cd799439014"],
    }),
    {
      website: "507f1f77bcf86cd799439011",
      auditB: "507f1f77bcf86cd799439013",
    },
  );
});
