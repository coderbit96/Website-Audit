import assert from "node:assert/strict";
import test from "node:test";

import { parsePageExplorerQuery } from "./validation.js";

test("parses bounded page explorer query values", () => {
  assert.deepEqual(parsePageExplorerQuery({ page: "4", search: "  docs  " }), {
    page: 4,
    search: "docs",
  });
});

test("falls back safely for malformed page explorer values", () => {
  assert.deepEqual(parsePageExplorerQuery({ page: "0" }), { page: 1 });
  assert.deepEqual(parsePageExplorerQuery({ page: "many" }), { page: 1 });
});
