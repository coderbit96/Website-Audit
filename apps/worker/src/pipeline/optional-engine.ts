import {
  AuditPipelineDiagnosticOutcome,
  type AuditPipelineDiagnostic,
} from "@website-audit/audit-core";

import type { AuditProcessorTools } from "../audit-worker.js";

export async function runOptionalAuditEngine<T>(input: {
  engine: AuditPipelineDiagnostic["engine"];
  step: AuditPipelineDiagnostic["step"];
  code: string;
  unavailableMessage: string;
  fallback: T;
  signal: AbortSignal;
  tools: AuditProcessorTools;
  diagnostics: AuditPipelineDiagnostic[];
  run: () => Promise<T> | T;
}): Promise<T> {
  try {
    input.signal.throwIfAborted();
    return await input.run();
  } catch (error) {
    if (input.signal.aborted) throw error;
    const diagnostic: AuditPipelineDiagnostic = {
      engine: input.engine,
      step: input.step,
      outcome: AuditPipelineDiagnosticOutcome.UNAVAILABLE,
      code: input.code,
      message: input.unavailableMessage,
    };
    input.diagnostics.push(diagnostic);
    input.tools.log("warn", "audit.optional_engine_unavailable", {
      engine: diagnostic.engine,
      step: diagnostic.step,
      code: diagnostic.code,
      error,
    });
    return input.fallback;
  }
}

export function addPartialAuditDiagnostic(
  diagnostics: AuditPipelineDiagnostic[],
  tools: AuditProcessorTools,
  diagnostic: AuditPipelineDiagnostic,
): void {
  diagnostics.push(diagnostic);
  tools.log("warn", "audit.optional_engine_partial", {
    engine: diagnostic.engine,
    step: diagnostic.step,
    code: diagnostic.code,
  });
}
