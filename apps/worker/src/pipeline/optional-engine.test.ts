import assert from "node:assert/strict";
import test from "node:test";

import {
  AuditPipelineEngine,
  AuditPipelineStep,
  type AuditPipelineDiagnostic,
} from "@website-audit/audit-core";

import type { AuditProcessorTools } from "../audit-worker.js";
import { runOptionalAuditEngine } from "./optional-engine.js";

function tools(signal: AbortSignal, events: string[]): AuditProcessorTools {
  return {
    signal,
    log(_level, event) {
      events.push(event);
    },
    updateProgress() {
      return Promise.resolve();
    },
  };
}

test("returns a safe fallback and diagnostic when an optional engine fails", async () => {
  const diagnostics: AuditPipelineDiagnostic[] = [];
  const events: string[] = [];
  const signal = new AbortController().signal;

  const result = await runOptionalAuditEngine({
    engine: AuditPipelineEngine.PERFORMANCE,
    step: AuditPipelineStep.PERFORMANCE,
    code: "PAGESPEED_ENGINE_FAILED",
    unavailableMessage: "PageSpeed was unavailable.",
    fallback: { score: null },
    signal,
    tools: tools(signal, events),
    diagnostics,
    run: () => Promise.reject(new Error("upstream secret response")),
  });

  assert.deepEqual(result, { score: null });
  assert.deepEqual(diagnostics, [
    {
      engine: "PERFORMANCE",
      step: "PERFORMANCE",
      outcome: "UNAVAILABLE",
      code: "PAGESPEED_ENGINE_FAILED",
      message: "PageSpeed was unavailable.",
    },
  ]);
  assert.deepEqual(events, ["audit.optional_engine_unavailable"]);
});

test("propagates cancellation instead of treating it as optional failure", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  const diagnostics: AuditPipelineDiagnostic[] = [];

  await assert.rejects(
    runOptionalAuditEngine({
      engine: AuditPipelineEngine.ACCESSIBILITY,
      step: AuditPipelineStep.ACCESSIBILITY,
      code: "ACCESSIBILITY_ENGINE_FAILED",
      unavailableMessage: "Accessibility was unavailable.",
      fallback: [],
      signal: controller.signal,
      tools: tools(controller.signal, []),
      diagnostics,
      run: () => [],
    }),
    /cancelled/,
  );
  assert.deepEqual(diagnostics, []);
});
