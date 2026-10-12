export const AuditPipelineStep = {
  URL_VALIDATION: "URL_VALIDATION",
  ROBOTS_AND_SITEMAPS: "ROBOTS_AND_SITEMAPS",
  CRAWLING: "CRAWLING",
  SEO: "SEO",
  TECHNICAL: "TECHNICAL",
  ACCESSIBILITY: "ACCESSIBILITY",
  SECURITY: "SECURITY",
  PERFORMANCE: "PERFORMANCE",
  MOBILE: "MOBILE",
  SCORING: "SCORING",
  PERSISTING: "PERSISTING",
  FINALIZING: "FINALIZING",
} as const;

export type AuditPipelineStep =
  (typeof AuditPipelineStep)[keyof typeof AuditPipelineStep];

export const AUDIT_PIPELINE_PROGRESS = Object.freeze({
  URL_VALIDATION: 3,
  ROBOTS_AND_SITEMAPS: 7,
  CRAWLING_START: 12,
  CRAWLING_END: 55,
  SEO: 60,
  TECHNICAL: 65,
  ACCESSIBILITY: 70,
  SECURITY: 75,
  PERFORMANCE: 80,
  MOBILE: 85,
  SCORING: 91,
  PERSISTING: 96,
  FINALIZING: 99,
});

export const AuditPipelineEngine = {
  ACCESSIBILITY: "ACCESSIBILITY",
  SECURITY: "SECURITY",
  PERFORMANCE: "PERFORMANCE",
  MOBILE: "MOBILE",
} as const;

export type AuditPipelineEngine =
  (typeof AuditPipelineEngine)[keyof typeof AuditPipelineEngine];

export const AuditPipelineDiagnosticOutcome = {
  UNAVAILABLE: "UNAVAILABLE",
  PARTIAL: "PARTIAL",
} as const;

export type AuditPipelineDiagnosticOutcome =
  (typeof AuditPipelineDiagnosticOutcome)[keyof typeof AuditPipelineDiagnosticOutcome];

export type AuditPipelineDiagnostic = {
  engine: AuditPipelineEngine;
  step: AuditPipelineStep;
  outcome: AuditPipelineDiagnosticOutcome;
  code: string;
  message: string;
};

export function calculateCrawlProgress(
  pagesCrawled: number,
  maximumPages: number,
): number {
  const boundedMaximum = Math.max(1, Math.floor(maximumPages));
  const ratio = Math.min(
    1,
    Math.max(0, Math.floor(pagesCrawled)) / boundedMaximum,
  );
  const range =
    AUDIT_PIPELINE_PROGRESS.CRAWLING_END -
    AUDIT_PIPELINE_PROGRESS.CRAWLING_START;
  return AUDIT_PIPELINE_PROGRESS.CRAWLING_START + Math.floor(ratio * range);
}

export class AuditProgressOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditProgressOrderError";
  }
}

/** Prevents stale callbacks from moving an active audit backwards. */
export class AuditProgressGuard<TStage extends string> {
  private progress: number;
  private readonly stageOrder: ReadonlyMap<TStage, number>;
  private stage: TStage;

  constructor(input: {
    initialProgress: number;
    initialStage: TStage;
    orderedStages: readonly TStage[];
  }) {
    this.progress = input.initialProgress;
    this.stage = input.initialStage;
    this.stageOrder = new Map(
      input.orderedStages.map((stage, index) => [stage, index]),
    );
  }

  accept(input: { progress: number; stage: TStage }): void {
    const currentStageOrder = this.stageOrder.get(this.stage);
    const nextStageOrder = this.stageOrder.get(input.stage);
    if (currentStageOrder === undefined || nextStageOrder === undefined) {
      throw new AuditProgressOrderError("Unknown audit lifecycle stage.");
    }
    if (input.progress < this.progress || nextStageOrder < currentStageOrder) {
      throw new AuditProgressOrderError(
        "Audit lifecycle progress cannot move backwards.",
      );
    }
    this.progress = input.progress;
    this.stage = input.stage;
  }
}
