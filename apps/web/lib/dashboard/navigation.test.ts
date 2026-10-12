import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardItems,
  getDashboardItemByPath,
  getDashboardItemBySection,
} from "./navigation.js";

test("defines every required dashboard destination exactly once", () => {
  const expectedLabels = [
    "Overview",
    "Websites",
    "Audits",
    "Issues",
    "Reports",
    "Compare",
    "Scheduled Audits",
    "Clients",
    "Team",
    "Billing",
    "Leads",
    "Notifications",
    "Settings",
    "Support",
  ];

  assert.deepEqual(
    dashboardItems.map((item) => item.label),
    expectedLabels,
  );
  assert.equal(
    new Set(dashboardItems.map((item) => item.href)).size,
    expectedLabels.length,
  );
});

test("marks the private lead destination as Super Admin only", () => {
  const leads = dashboardItems.find((item) => item.label === "Leads");
  assert.equal(leads?.href, "/dashboard/leads");
  assert.equal(leads?.adminOnly, true);
});

test("resolves paths and placeholder sections safely", () => {
  assert.equal(getDashboardItemByPath("/dashboard")?.label, "Overview");
  assert.equal(
    getDashboardItemByPath("/dashboard/websites/507f1f77bcf86cd799439011")
      ?.label,
    "Websites",
  );
  assert.equal(
    getDashboardItemBySection("scheduled-audits")?.label,
    "Scheduled Audits",
  );
  assert.equal(getDashboardItemBySection("not-a-route"), undefined);
});
