import assert from "node:assert/strict";
import test from "node:test";

import { dateAtIndiaMidnight } from "./admin.js";

test("admin day boundary follows India time rather than UTC", () => {
  assert.equal(
    dateAtIndiaMidnight(new Date("2026-10-11T18:29:59.000Z")).toISOString(),
    "2026-10-10T18:30:00.000Z",
  );
  assert.equal(
    dateAtIndiaMidnight(new Date("2026-10-11T18:30:00.000Z")).toISOString(),
    "2026-10-11T18:30:00.000Z",
  );
});
