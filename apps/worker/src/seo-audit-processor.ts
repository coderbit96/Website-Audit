import {
  AUDIT_PIPELINE_PROGRESS,
  AUDIT_PRESET_DEFINITIONS,
  AuditPipelineDiagnosticOutcome,
  AuditPipelineEngine,
  AuditPipelineStep,
  AuditPreset,
  PUBLIC_AUDIT_MAXIMUM_DEPTH,
  PUBLIC_AUDIT_MAXIMUM_PAGES,
  AuditProcessingError,
  ScoringCategory,
  SecureHttpError,
  UrlSecurityError,
  calculateAuditScores,
  calculateCrawlProgress,
  getAccessibilityBrowserPageLimit,
  getMobileBrowserPageLimit,
  prepareScoringFindings,
  sortAuditRuleResults,
  validatePublicHttpUrl,
  type AuditPipelineDiagnostic,
  type AuditSettings,
} from "@website-audit/audit-core";
import {
  analyzeSeoPage,
  analyzeSeoSite,
  analyzeMobileSite,
  analyzePageSpeedResults,
  analyzeSecuritySite,
  extractSecurityHtmlObservations,
  analyzeTechnicalSite,
  ACCESSIBILITY_RULE_DEFINITIONS,
  calculateMobileCompositeScore,
  MOBILE_RULE_DEFINITIONS,
  PageSpeedStrategy,
  PERFORMANCE_RULE_DEFINITIONS,
  SECURITY_RULE_DEFINITIONS,
  SEO_RULE_DEFINITIONS,
  TECHNICAL_RULE_DEFINITIONS,
  type SecurityPageInput,
  type SecuritySiteReport,
  type MobileSiteReport,
  type PerformanceSiteReport,
  type SeoPageReport,
} from "@website-audit/audit-rules";
import {
  AuditCategory,
  AuditStatus,
  replaceAuditResults,
  type AuditStatus as AuditLifecycleState,
} from "@website-audit/database";

import type { AuditProcessor } from "./audit-worker.js";
import {
  runAccessibilityBrowserAudit,
  type AccessibilityBrowserReport,
} from "./accessibility/browser-audit.js";
import { crawlWebsite, type CrawledPage } from "./crawler/index.js";
import {
  runMobileBrowserAudit,
  type MobileBrowserReport,
} from "./mobile/browser-audit.js";
import {
  runPageSpeedAnalysis,
  type PageSpeedRunResult,
} from "./performance/pagespeed.js";
import {
  addPartialAuditDiagnostic,
  runOptionalAuditEngine,
} from "./pipeline/optional-engine.js";
import { observePassiveTransport } from "./security/transport-probe.js";
import { getWorkerEnvironment } from "./environment.js";

export type SafeAuditConfiguration = AuditSettings & {
  preset: (typeof AuditPreset)[keyof typeof AuditPreset];
  publicAudit: boolean;
};

function boundedInteger(value: unknown, fallback: number, maximum: number) {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(0, Math.min(value, maximum))
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readSafeAuditConfiguration(
  configuration: Record<string, unknown> | null,
  auditType: string,
): SafeAuditConfiguration {
  const requestedPreset = configuration?.preset;
  const preset =
    typeof requestedPreset === "string" &&
    Object.hasOwn(AUDIT_PRESET_DEFINITIONS, requestedPreset)
      ? (requestedPreset as SafeAuditConfiguration["preset"])
      : auditType === "QUICK"
        ? AuditPreset.QUICK
        : auditType === "FULL"
          ? AuditPreset.FULL
          : AuditPreset.STANDARD;
  const definition = AUDIT_PRESET_DEFINITIONS[preset];
  const defaults = definition.defaults;
  const publicAudit = configuration?.publicAudit === true;
  const planMaximumPages = Math.max(
    1,
    boundedInteger(
      configuration?.entitlementMaximumPages,
      definition.maximumPagesLimit,
      definition.maximumPagesLimit,
    ),
  );
  const maximumPagesLimit = publicAudit
    ? Math.min(definition.maximumPagesLimit, PUBLIC_AUDIT_MAXIMUM_PAGES)
    : Math.min(definition.maximumPagesLimit, planMaximumPages);
  const maximumDepthLimit = publicAudit
    ? Math.min(definition.maximumDepthLimit, PUBLIC_AUDIT_MAXIMUM_DEPTH)
    : definition.maximumDepthLimit;

  return {
    preset,
    publicAudit,
    maximumPages: Math.max(
      1,
      boundedInteger(
        configuration?.maximumPages,
        defaults.maximumPages,
        maximumPagesLimit,
      ),
    ),
    maximumDepth: boundedInteger(
      configuration?.maximumDepth,
      defaults.maximumDepth,
      maximumDepthLimit,
    ),
    respectRobotsTxt: booleanValue(
      configuration?.respectRobotsTxt,
      defaults.respectRobotsTxt,
    ),
    checkExternalLinks: publicAudit
      ? false
      : booleanValue(
          configuration?.checkExternalLinks,
          defaults.checkExternalLinks,
        ),
    // Browser rendering is not part of the crawler pipeline. Ignore legacy
    // stored requests instead of presenting an unperformed capability.
    javascriptRendering: false,
    performanceAnalysis: booleanValue(
      configuration?.performanceAnalysis,
      defaults.performanceAnalysis,
    ),
    accessibilityAnalysis: booleanValue(
      configuration?.accessibilityAnalysis,
      defaults.accessibilityAnalysis,
    ),
    securityAnalysis: booleanValue(
      configuration?.securityAnalysis,
      defaults.securityAnalysis,
    ),
    mobileAnalysis: publicAudit
      ? false
      : booleanValue(configuration?.mobileAnalysis, defaults.mobileAnalysis),
  };
}

function safePipelineError(
  error: unknown,
  context: {
    code: string;
    message: string;
    stage: string;
    step: AuditPipelineStep;
    retryable: boolean;
  },
): AuditProcessingError {
  if (error instanceof AuditProcessingError) return error;
  if (error instanceof SecureHttpError) {
    return new AuditProcessingError(
      `Website request failed (${error.code.toLowerCase().replaceAll("_", " ")}).`,
      {
        retryable: error.retryable,
        code: `HTTP_${error.code}`,
        stage: context.stage,
        step: context.step,
      },
    );
  }
  if (error instanceof UrlSecurityError) {
    return new AuditProcessingError(
      `Website URL validation failed (${error.code.toLowerCase().replaceAll("_", " ")}).`,
      {
        retryable: error.code === "DNS_RESOLUTION_FAILED",
        code: `URL_${error.code}`,
        stage: context.stage,
        step: context.step,
      },
    );
  }
  return new AuditProcessingError(context.message, {
    retryable: context.retryable,
    code: context.code,
    stage: context.stage,
    step: context.step,
  });
}

function assertUsableRoot(
  pages: readonly CrawledPage[],
  reports: readonly SeoPageReport[],
): CrawledPage {
  const root = pages.find((page) => page.discoveredVia === "ROOT");
  if (!root) {
    throw new AuditProcessingError("The website root could not be crawled.", {
      retryable: true,
      code: "CRAWL_ROOT_MISSING",
      stage: AuditStatus.CRAWLING,
      step: AuditPipelineStep.CRAWLING,
    });
  }
  if (root.statusCode === null) {
    throw new AuditProcessingError(
      root.errorMessage ?? "The website root could not be fetched.",
      {
        retryable: true,
        code: root.fetchErrorCode ?? "CRAWL_ROOT_FETCH_FAILED",
        stage: AuditStatus.CRAWLING,
        step: AuditPipelineStep.CRAWLING,
      },
    );
  }
  if (root.statusCode < 200 || root.statusCode >= 300) {
    throw new AuditProcessingError(
      `The website root returned HTTP ${root.statusCode}.`,
      {
        retryable: root.statusCode >= 500,
        code: `CRAWL_ROOT_HTTP_${root.statusCode}`,
        stage: AuditStatus.CRAWLING,
        step: AuditPipelineStep.CRAWLING,
      },
    );
  }
  if (!reports.some((report) => report.discoveredVia === "ROOT")) {
    throw new AuditProcessingError(
      "The website root did not return an HTML document.",
      {
        retryable: false,
        code: "CRAWL_ROOT_NOT_HTML",
        stage: AuditStatus.CRAWLING,
        step: AuditPipelineStep.CRAWLING,
      },
    );
  }
  return root;
}

export const runSeoAudit: AuditProcessor = async (context, tools) => {
  const environment = getWorkerEnvironment();
  const settings = readSafeAuditConfiguration(
    context.configuration,
    context.auditType,
  );
  const reports: SeoPageReport[] = [];
  const securityPages: SecurityPageInput[] = [];
  const diagnostics: AuditPipelineDiagnostic[] = [];
  let failureContext: {
    code: string;
    message: string;
    stage: AuditLifecycleState;
    step: AuditPipelineStep;
    retryable: boolean;
  } = {
    code: "URL_VALIDATION_FAILED",
    message: "The website URL could not be validated safely.",
    stage: AuditStatus.INITIALIZING,
    step: AuditPipelineStep.URL_VALIDATION,
    retryable: false,
  };

  await tools.updateProgress({
    progress: AUDIT_PIPELINE_PROGRESS.URL_VALIDATION,
    currentStage: AuditStatus.INITIALIZING,
    pagesDiscovered: 1,
    pagesCrawled: 0,
    message: "Validating the website URL and public network destination.",
  });

  try {
    tools.log("info", "audit.pipeline_step_started", {
      step: AuditPipelineStep.URL_VALIDATION,
    });
    const validatedWebsite = await validatePublicHttpUrl(context.websiteUrl);
    tools.log("info", "audit.pipeline_step_completed", {
      step: AuditPipelineStep.URL_VALIDATION,
    });

    failureContext = {
      code: "DISCOVERY_FAILED",
      message: "Robots.txt and sitemap discovery could not be completed.",
      stage: AuditStatus.INITIALIZING,
      step: AuditPipelineStep.ROBOTS_AND_SITEMAPS,
      retryable: true,
    };
    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.ROBOTS_AND_SITEMAPS,
      currentStage: AuditStatus.INITIALIZING,
      pagesDiscovered: 1,
      pagesCrawled: 0,
      message: "Discovering robots.txt and sitemap sources.",
    });
    tools.log("info", "audit.pipeline_step_started", {
      step: AuditPipelineStep.ROBOTS_AND_SITEMAPS,
    });

    failureContext = {
      code: "CRAWL_FAILED",
      message: "The website could not be crawled.",
      stage: AuditStatus.CRAWLING,
      step: AuditPipelineStep.CRAWLING,
      retryable: true,
    };
    const crawl = await crawlWebsite({
      startUrl: validatedWebsite.url,
      settings: {
        maximumPages: settings.maximumPages,
        maximumDepth: settings.maximumDepth,
        concurrency: 4,
        respectRobotsTxt: settings.respectRobotsTxt,
        checkExternalLinks: settings.checkExternalLinks,
        requestTimeoutMs: 15_000,
        maximumBodyBytes: 2 * 1024 * 1024,
      },
      signal: tools.signal,
      callbacks: {
        onPage(page, document) {
          if (page.fetchErrorCode) {
            tools.log("warn", "crawler.page_fetch_failed", {
              requestedUrl: page.requestedUrl,
              depth: page.depth,
              code: page.fetchErrorCode,
            });
          }
          securityPages.push({
            url: page.url,
            statusCode: page.statusCode,
            contentType: page.contentType,
            headers: document?.headers ?? null,
            setCookieHeaders: document?.setCookieHeaders ?? [],
            htmlObservations: document
              ? extractSecurityHtmlObservations(document.html)
              : null,
            mixedContentResources: page.metadata?.mixedContentResources ?? [],
            mixedContentResourceCount:
              page.metadata?.counts.mixedContentResources ?? 0,
          });
          if (
            !document ||
            page.statusCode === null ||
            page.statusCode < 200 ||
            page.statusCode >= 300
          ) {
            return;
          }
          reports.push(
            analyzeSeoPage({
              requestedUrl: page.requestedUrl,
              finalUrl: page.url,
              siteOrigin: document.siteOrigin,
              statusCode: page.statusCode,
              headers: document.headers,
              html: document.html,
              depth: page.depth,
              loadTimeMs: page.responseTimeMs ?? 0,
              discoveredVia: page.discoveredVia,
            }),
          );
        },
        async onDiscovery(discovery) {
          await tools.updateProgress({
            progress: AUDIT_PIPELINE_PROGRESS.ROBOTS_AND_SITEMAPS,
            currentStage: AuditStatus.INITIALIZING,
            pagesDiscovered: Math.max(1, discovery.sitemap.pageUrlsDiscovered),
            pagesCrawled: 0,
            message: `Discovery complete: robots.txt ${discovery.robots.status.toLowerCase()}, ${discovery.sitemap.pageUrlsDiscovered} sitemap URLs found.`,
          });
          tools.log("info", "audit.pipeline_step_completed", {
            step: AuditPipelineStep.ROBOTS_AND_SITEMAPS,
            robotsStatus: discovery.robots.status,
            sitemapUrls: discovery.sitemap.pageUrlsDiscovered,
          });
        },
        async onProgress(progress) {
          await tools.updateProgress({
            progress: calculateCrawlProgress(
              progress.pagesCrawled,
              settings.maximumPages,
            ),
            currentStage: AuditStatus.CRAWLING,
            pagesDiscovered: progress.pagesDiscovered,
            pagesCrawled: progress.pagesCrawled,
            message: `Crawled ${progress.pagesCrawled} of up to ${settings.maximumPages} pages.`,
          });
        },
      },
    });

    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.CRAWLING_END,
      currentStage: AuditStatus.CRAWLING,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
      message: `Crawl completed with ${crawl.pages.length} page(s) processed.`,
    });
    const rootPage = assertUsableRoot(crawl.pages, reports);
    tools.log("info", "audit.pipeline_step_completed", {
      step: AuditPipelineStep.CRAWLING,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
    });
    failureContext = {
      code: "SEO_ANALYSIS_FAILED",
      message: "SEO analysis could not be completed.",
      stage: AuditStatus.ANALYZING,
      step: AuditPipelineStep.SEO,
      retryable: false,
    };
    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.SEO,
      currentStage: AuditStatus.ANALYZING,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
      message: "Analyzing deterministic SEO signals.",
    });
    tools.log("info", "audit.pipeline_step_started", {
      step: AuditPipelineStep.SEO,
    });
    const siteReport = analyzeSeoSite(
      reports,
      crawl.discovery.sitemap.pageUrls,
    );
    tools.log("info", "audit.pipeline_step_completed", {
      step: AuditPipelineStep.SEO,
      findings: siteReport.findings.length,
    });
    failureContext = {
      code: "TECHNICAL_ANALYSIS_FAILED",
      message: "Technical analysis could not be completed.",
      stage: AuditStatus.ANALYZING,
      step: AuditPipelineStep.TECHNICAL,
      retryable: false,
    };
    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.TECHNICAL,
      currentStage: AuditStatus.ANALYZING,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
      message: "Analyzing deterministic technical SEO signals.",
    });
    tools.log("info", "audit.pipeline_step_started", {
      step: AuditPipelineStep.TECHNICAL,
    });
    const technicalReport = analyzeTechnicalSite({
      pages: crawl.pages.map((page) => ({
        requestedUrl: page.requestedUrl,
        url: page.url,
        normalizedUrl: page.normalizedUrl,
        statusCode: page.statusCode,
        redirectCount: page.redirectCount,
        redirectChain: page.redirectChain,
        fetchErrorCode: page.fetchErrorCode,
        depth: page.depth,
        responseTimeMs: page.responseTimeMs,
        pageSizeBytes: page.pageSizeBytes,
        contentType: page.contentType,
        indexable: page.indexable,
        robotsDirectives: page.metadata?.robotsDirectives ?? [],
        canonical: page.canonical,
        canonicalDeclarations:
          page.metadata?.canonicalDeclarations ??
          (page.canonical ? [page.canonical] : []),
        internalLinks: page.internalLinks.map((link) => ({
          url: link.normalizedUrl,
        })),
        mixedContentResources: page.metadata?.mixedContentResources ?? [],
        mixedContentResourceCount:
          page.metadata?.counts.mixedContentResources ?? 0,
      })),
      sitemap: crawl.discovery.sitemap,
      externalLinkChecks: crawl.externalLinkChecks,
    });
    tools.log("info", "audit.pipeline_step_completed", {
      step: AuditPipelineStep.TECHNICAL,
      findings: technicalReport.findings.length,
    });
    const emptyAccessibilityReport: AccessibilityBrowserReport = {
      findings: [],
      candidatePageCount: 0,
      selectedPageCount: 0,
      analyzedPageCount: 0,
      failedPageCount: 0,
      truncated: false,
    };
    const accessibilityPageLimit = getAccessibilityBrowserPageLimit(
      settings.preset,
      settings.maximumPages,
    );
    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.ACCESSIBILITY,
      currentStage: AuditStatus.ANALYZING,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
      message: settings.accessibilityAnalysis
        ? `Running bounded accessibility analysis on up to ${accessibilityPageLimit} pages.`
        : "Accessibility analysis was not requested.",
    });
    tools.log("info", "audit.pipeline_step_started", {
      step: AuditPipelineStep.ACCESSIBILITY,
      enabled: settings.accessibilityAnalysis,
    });
    const accessibilityReport = settings.accessibilityAnalysis
      ? await runOptionalAuditEngine({
          engine: AuditPipelineEngine.ACCESSIBILITY,
          step: AuditPipelineStep.ACCESSIBILITY,
          code: "ACCESSIBILITY_ENGINE_FAILED",
          unavailableMessage:
            "Browser accessibility analysis was unavailable; the rest of the audit continued.",
          fallback: emptyAccessibilityReport,
          signal: tools.signal,
          tools,
          diagnostics,
          run: () =>
            runAccessibilityBrowserAudit({
              pages: crawl.pages.map((page) => ({
                url: page.url,
                normalizedUrl: page.normalizedUrl,
                statusCode: page.statusCode,
                contentType: page.contentType,
              })),
              pageLimit: accessibilityPageLimit,
              signal: tools.signal,
            }),
        })
      : emptyAccessibilityReport;
    if (
      settings.accessibilityAnalysis &&
      accessibilityReport.failedPageCount > 0
    ) {
      addPartialAuditDiagnostic(diagnostics, tools, {
        engine: AuditPipelineEngine.ACCESSIBILITY,
        step: AuditPipelineStep.ACCESSIBILITY,
        outcome:
          accessibilityReport.analyzedPageCount === 0
            ? AuditPipelineDiagnosticOutcome.UNAVAILABLE
            : AuditPipelineDiagnosticOutcome.PARTIAL,
        code: "ACCESSIBILITY_BROWSER_PAGES_FAILED",
        message: `${accessibilityReport.failedPageCount} selected accessibility page(s) could not be analyzed.`,
      });
    }
    tools.log("info", "audit.pipeline_step_completed", {
      step: AuditPipelineStep.ACCESSIBILITY,
      analyzedPages: accessibilityReport.analyzedPageCount,
      failedPages: accessibilityReport.failedPageCount,
    });

    const emptySecurityReport: SecuritySiteReport = {
      findings: [],
      checks: [],
      evaluatedPageCount: 0,
      metrics: [],
    };
    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.SECURITY,
      currentStage: AuditStatus.ANALYZING,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
      message: settings.securityAnalysis
        ? "Checking passive transport, headers, mixed content, and cookies."
        : "Security analysis was not requested.",
    });
    tools.log("info", "audit.pipeline_step_started", {
      step: AuditPipelineStep.SECURITY,
      enabled: settings.securityAnalysis,
    });
    const securityReport = settings.securityAnalysis
      ? await runOptionalAuditEngine({
          engine: AuditPipelineEngine.SECURITY,
          step: AuditPipelineStep.SECURITY,
          code: "SECURITY_ENGINE_FAILED",
          unavailableMessage:
            "Passive security analysis was unavailable; the rest of the audit continued.",
          fallback: emptySecurityReport,
          signal: tools.signal,
          tools,
          diagnostics,
          async run() {
            const transport = await observePassiveTransport(
              rootPage,
              tools.signal,
            );
            return analyzeSecuritySite({ pages: securityPages, transport });
          },
        })
      : emptySecurityReport;
    tools.log("info", "audit.pipeline_step_completed", {
      step: AuditPipelineStep.SECURITY,
      evaluatedPages: securityReport.evaluatedPageCount,
    });

    const pageSpeedStrategies = [
      ...(settings.mobileAnalysis ? [PageSpeedStrategy.MOBILE] : []),
      ...(settings.performanceAnalysis ? [PageSpeedStrategy.DESKTOP] : []),
    ];
    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.PERFORMANCE,
      currentStage: AuditStatus.ANALYZING,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
      message:
        pageSpeedStrategies.length > 0
          ? "Requesting bounded PageSpeed performance measurements."
          : "Performance analysis was not requested.",
    });
    tools.log("info", "audit.pipeline_step_started", {
      step: AuditPipelineStep.PERFORMANCE,
      enabled: pageSpeedStrategies.length > 0,
    });
    const pageSpeedRuns: PageSpeedRunResult[] =
      pageSpeedStrategies.length > 0
        ? await runOptionalAuditEngine({
            engine: AuditPipelineEngine.PERFORMANCE,
            step: AuditPipelineStep.PERFORMANCE,
            code: "PAGESPEED_ENGINE_FAILED",
            unavailableMessage:
              "PageSpeed analysis was unavailable; the rest of the audit continued.",
            fallback: [],
            signal: tools.signal,
            tools,
            diagnostics,
            run: () =>
              runPageSpeedAnalysis({
                url: rootPage.url,
                apiKey: environment.GOOGLE_PAGESPEED_API_KEY,
                strategies: pageSpeedStrategies,
                signal: tools.signal,
              }),
          })
        : [];
    for (const run of pageSpeedRuns) {
      if (run.available) continue;
      const mobile = run.strategy === PageSpeedStrategy.MOBILE;
      tools.log("warn", "external_api.pagespeed_unavailable", {
        provider: "google-pagespeed-insights",
        strategy: run.strategy,
        reason: run.reason,
      });
      addPartialAuditDiagnostic(diagnostics, tools, {
        engine: mobile
          ? AuditPipelineEngine.MOBILE
          : AuditPipelineEngine.PERFORMANCE,
        step: mobile ? AuditPipelineStep.MOBILE : AuditPipelineStep.PERFORMANCE,
        outcome: AuditPipelineDiagnosticOutcome.UNAVAILABLE,
        code: `PAGESPEED_${run.reason}`,
        message: `PageSpeed ${run.strategy.toLowerCase()} analysis was unavailable (${run.reason.toLowerCase().replaceAll("_", " ")}).`,
      });
    }
    const availablePageSpeedResults = pageSpeedRuns.flatMap((run) =>
      run.available ? [run.result] : [],
    );
    const emptyPerformanceReport: PerformanceSiteReport = {
      findings: [],
      metrics: [],
      measuredScore: null,
      evaluatedStrategyCount: 0,
    };
    const performanceReport = settings.performanceAnalysis
      ? await runOptionalAuditEngine({
          engine: AuditPipelineEngine.PERFORMANCE,
          step: AuditPipelineStep.PERFORMANCE,
          code: "PERFORMANCE_ANALYSIS_FAILED",
          unavailableMessage:
            "Performance result analysis was unavailable; the rest of the audit continued.",
          fallback: emptyPerformanceReport,
          signal: tools.signal,
          tools,
          diagnostics,
          run: () => analyzePageSpeedResults(availablePageSpeedResults),
        })
      : emptyPerformanceReport;
    tools.log("info", "audit.pipeline_step_completed", {
      step: AuditPipelineStep.PERFORMANCE,
      evaluatedStrategies: performanceReport.evaluatedStrategyCount,
    });
    const performancePageSpeedAvailabilityMetrics = settings.performanceAnalysis
      ? pageSpeedRuns.flatMap((run) => {
          const prefix = `performance.pagespeed.${(run.available
            ? run.result.strategy
            : run.strategy
          ).toLowerCase()}`;
          if (run.available) return [];
          return [
            {
              category: AuditCategory.PERFORMANCE,
              key: `${prefix}.available`,
              value: 0,
              unit: "boolean",
            },
            {
              category: AuditCategory.PERFORMANCE,
              key: `${prefix}.unavailable_${run.reason.toLowerCase()}`,
              value: 1,
              unit: "boolean",
            },
          ];
        })
      : [];
    const mobilePageSpeedRun = pageSpeedRuns.find(
      (run) =>
        (run.available ? run.result.strategy : run.strategy) ===
        PageSpeedStrategy.MOBILE,
    );
    const mobilePageSpeedScore =
      mobilePageSpeedRun?.available === true
        ? mobilePageSpeedRun.result.performanceScore
        : null;
    const mobilePageSpeedAvailabilityMetrics = settings.mobileAnalysis
      ? [
          {
            category: AuditCategory.MOBILE,
            key: "mobile.pagespeed.available",
            value: mobilePageSpeedRun?.available === true ? 1 : 0,
            unit: "boolean",
          },
          ...(mobilePageSpeedRun && !mobilePageSpeedRun.available
            ? [
                {
                  category: AuditCategory.MOBILE,
                  key: `mobile.pagespeed.unavailable_${mobilePageSpeedRun.reason.toLowerCase()}`,
                  value: 1,
                  unit: "boolean",
                },
              ]
            : []),
        ]
      : [];
    const mobileBrowserPageLimit = getMobileBrowserPageLimit(
      settings.preset,
      settings.maximumPages,
    );
    const emptyMobileBrowserReport: MobileBrowserReport = {
      pages: [],
      candidatePageCount: 0,
      selectedPageCount: 0,
      analyzedPageCount: 0,
      failedPageCount: 0,
      truncated: false,
    };
    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.MOBILE,
      currentStage: AuditStatus.ANALYZING,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
      message: settings.mobileAnalysis
        ? `Measuring mobile behavior on up to ${mobileBrowserPageLimit} pages.`
        : "Mobile analysis was not requested.",
    });
    tools.log("info", "audit.pipeline_step_started", {
      step: AuditPipelineStep.MOBILE,
      enabled: settings.mobileAnalysis,
    });
    const mobileBrowserReport = settings.mobileAnalysis
      ? await runOptionalAuditEngine({
          engine: AuditPipelineEngine.MOBILE,
          step: AuditPipelineStep.MOBILE,
          code: "MOBILE_BROWSER_ENGINE_FAILED",
          unavailableMessage:
            "Browser mobile analysis was unavailable; the rest of the audit continued.",
          fallback: emptyMobileBrowserReport,
          signal: tools.signal,
          tools,
          diagnostics,
          run: () =>
            runMobileBrowserAudit({
              pages: crawl.pages.map((page) => ({
                url: page.url,
                normalizedUrl: page.normalizedUrl,
                statusCode: page.statusCode,
                contentType: page.contentType,
              })),
              pageLimit: mobileBrowserPageLimit,
              signal: tools.signal,
            }),
        })
      : emptyMobileBrowserReport;
    if (settings.mobileAnalysis && mobileBrowserReport.failedPageCount > 0) {
      addPartialAuditDiagnostic(diagnostics, tools, {
        engine: AuditPipelineEngine.MOBILE,
        step: AuditPipelineStep.MOBILE,
        outcome:
          mobileBrowserReport.analyzedPageCount === 0
            ? AuditPipelineDiagnosticOutcome.UNAVAILABLE
            : AuditPipelineDiagnosticOutcome.PARTIAL,
        code: "MOBILE_BROWSER_PAGES_FAILED",
        message: `${mobileBrowserReport.failedPageCount} selected mobile page(s) could not be analyzed.`,
      });
    }
    const emptyMobileReport: MobileSiteReport = {
      findings: [],
      metrics: [],
      evaluatedPageCount: 0,
      browserAnalyzedPageCount: 0,
      reliableBrowserPageCount: 0,
      pageSpeedScore: null,
    };
    const mobileReport = settings.mobileAnalysis
      ? await runOptionalAuditEngine({
          engine: AuditPipelineEngine.MOBILE,
          step: AuditPipelineStep.MOBILE,
          code: "MOBILE_ANALYSIS_FAILED",
          unavailableMessage:
            "Mobile result analysis was unavailable; the rest of the audit continued.",
          fallback: emptyMobileReport,
          signal: tools.signal,
          tools,
          diagnostics,
          run: () =>
            analyzeMobileSite({
              pages: crawl.pages.flatMap((page) =>
                page.metadata &&
                page.statusCode !== null &&
                page.statusCode >= 200 &&
                page.statusCode < 300 &&
                page.contentType?.toLowerCase().includes("html")
                  ? [
                      {
                        url: page.url,
                        viewport: page.metadata.viewport,
                        images: page.metadata.images.map((image) => ({
                          src: image.src,
                          hasResponsiveSource: image.hasResponsiveSource,
                        })),
                      },
                    ]
                  : [],
              ),
              browserPages: mobileBrowserReport.pages,
              pageSpeedScore: mobilePageSpeedScore,
            }),
        })
      : emptyMobileReport;
    const mobileScoreAvailable =
      settings.mobileAnalysis &&
      mobileReport.evaluatedPageCount > 0 &&
      (mobileReport.reliableBrowserPageCount > 0 ||
        mobileReport.pageSpeedScore !== null);
    tools.log("info", "audit.pipeline_step_completed", {
      step: AuditPipelineStep.MOBILE,
      evaluatedPages: mobileReport.evaluatedPageCount,
      reliableBrowserPages: mobileReport.reliableBrowserPageCount,
    });
    failureContext = {
      code: "ANALYSIS_AGGREGATION_FAILED",
      message: "Audit findings could not be aggregated.",
      stage: AuditStatus.ANALYZING,
      step: AuditPipelineStep.TECHNICAL,
      retryable: false,
    };
    const findings = sortAuditRuleResults([
      ...siteReport.findings,
      ...technicalReport.findings,
      ...performanceReport.findings,
      ...mobileReport.findings,
      ...accessibilityReport.findings,
      ...securityReport.findings,
    ]);
    failureContext = {
      code: "SCORING_FAILED",
      message: "Audit scoring could not be completed.",
      stage: AuditStatus.SCORING,
      step: AuditPipelineStep.SCORING,
      retryable: false,
    };
    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.SCORING,
      currentStage: AuditStatus.SCORING,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
      message: "Calculating deterministic category and overall scores.",
    });
    tools.log("info", "audit.pipeline_step_started", {
      step: AuditPipelineStep.SCORING,
    });
    const baseFindings = [...siteReport.findings, ...technicalReport.findings];
    const mobileScoringFindings = mobileScoreAvailable
      ? prepareScoringFindings({
          findings: mobileReport.findings,
          definitions: MOBILE_RULE_DEFINITIONS,
          totalPageCount: mobileReport.evaluatedPageCount,
        })
      : [];
    const mobileCompositeScore =
      mobileScoreAvailable && mobileReport.pageSpeedScore !== null
        ? calculateMobileCompositeScore(
            calculateAuditScores({
              findings: mobileScoringFindings,
              totalPageCount: mobileReport.evaluatedPageCount,
              evaluatedCategories: [ScoringCategory.MOBILE],
            }).categories.MOBILE.score,
            mobileReport.pageSpeedScore,
          )
        : null;
    const scoringFindings = [
      ...prepareScoringFindings({
        findings: baseFindings,
        definitions: [...SEO_RULE_DEFINITIONS, ...TECHNICAL_RULE_DEFINITIONS],
        totalPageCount: crawl.pages.length,
      }),
      ...(performanceReport.measuredScore !== null
        ? prepareScoringFindings({
            findings: performanceReport.findings,
            definitions: PERFORMANCE_RULE_DEFINITIONS,
            totalPageCount: 1,
          })
        : []),
      ...mobileScoringFindings,
      ...(accessibilityReport.analyzedPageCount > 0
        ? prepareScoringFindings({
            findings: accessibilityReport.findings,
            definitions: ACCESSIBILITY_RULE_DEFINITIONS,
            totalPageCount: accessibilityReport.analyzedPageCount,
          })
        : []),
      ...(securityReport.evaluatedPageCount > 0
        ? prepareScoringFindings({
            findings: securityReport.findings,
            definitions: SECURITY_RULE_DEFINITIONS,
            totalPageCount: securityReport.evaluatedPageCount,
          })
        : []),
    ];
    const evaluatedPageCounts = new Map<string, number>([
      [ScoringCategory.SEO, crawl.pages.length],
      [ScoringCategory.TECHNICAL, crawl.pages.length],
      ...(performanceReport.measuredScore !== null
        ? ([[ScoringCategory.PERFORMANCE, 1]] as const)
        : []),
      ...(mobileScoreAvailable
        ? ([[ScoringCategory.MOBILE, mobileReport.evaluatedPageCount]] as const)
        : []),
      ...(accessibilityReport.analyzedPageCount > 0
        ? ([
            [
              ScoringCategory.ACCESSIBILITY,
              accessibilityReport.analyzedPageCount,
            ],
          ] as const)
        : []),
      ...(securityReport.evaluatedPageCount > 0
        ? ([
            [ScoringCategory.SECURITY, securityReport.evaluatedPageCount],
          ] as const)
        : []),
    ]);
    const coverageByRule = new Map<
      string,
      { maximumReportedPages: number; affectedUrls: Set<string> }
    >();
    for (const finding of scoringFindings) {
      const key = `${finding.category}:${finding.ruleCode}`;
      const coverage = coverageByRule.get(key) ?? {
        maximumReportedPages: 0,
        affectedUrls: new Set<string>(),
      };
      coverage.maximumReportedPages = Math.max(
        coverage.maximumReportedPages,
        finding.affectedPageCount,
      );
      for (const url of finding.affectedUrls ?? []) {
        coverage.affectedUrls.add(url);
      }
      coverageByRule.set(key, coverage);
    }
    const persistedFindings = findings.map((finding) => {
      const evaluatedPageCount = evaluatedPageCounts.get(finding.category);
      const coverage = coverageByRule.get(
        `${finding.category}:${finding.ruleCode}`,
      );
      if (!evaluatedPageCount || !coverage) return finding;
      return {
        ...finding,
        affectedPageCount: Math.min(
          evaluatedPageCount,
          Math.max(coverage.maximumReportedPages, coverage.affectedUrls.size),
        ),
        evaluatedPageCount,
      };
    });
    const evaluatedCategories = [
      ScoringCategory.SEO,
      ScoringCategory.TECHNICAL,
      ...(performanceReport.measuredScore !== null
        ? [ScoringCategory.PERFORMANCE]
        : []),
      ...(mobileScoreAvailable ? [ScoringCategory.MOBILE] : []),
      ...(accessibilityReport.analyzedPageCount > 0
        ? [ScoringCategory.ACCESSIBILITY]
        : []),
      ...(securityReport.evaluatedPageCount > 0
        ? [ScoringCategory.SECURITY]
        : []),
    ];
    const scoreReport = calculateAuditScores({
      findings: scoringFindings,
      totalPageCount: crawl.pages.length,
      evaluatedCategories,
      ...(performanceReport.measuredScore !== null ||
      mobileScoreAvailable ||
      accessibilityReport.analyzedPageCount > 0 ||
      securityReport.evaluatedPageCount > 0
        ? {
            evaluatedPageCounts: {
              ...(performanceReport.measuredScore !== null
                ? { PERFORMANCE: 1 }
                : {}),
              ...(mobileScoreAvailable
                ? { MOBILE: mobileReport.evaluatedPageCount }
                : {}),
              ...(accessibilityReport.analyzedPageCount > 0
                ? { ACCESSIBILITY: accessibilityReport.analyzedPageCount }
                : {}),
              ...(securityReport.evaluatedPageCount > 0
                ? { SECURITY: securityReport.evaluatedPageCount }
                : {}),
            },
          }
        : {}),
      ...(performanceReport.measuredScore !== null ||
      mobileCompositeScore !== null
        ? {
            measuredCategoryScores: {
              ...(performanceReport.measuredScore !== null
                ? { PERFORMANCE: performanceReport.measuredScore }
                : {}),
              ...(mobileCompositeScore !== null
                ? { MOBILE: mobileCompositeScore }
                : {}),
            },
          }
        : {}),
    });
    const reportsByUrl = new Map(
      reports.map((report) => [report.normalizedUrl, report]),
    );
    tools.log("info", "audit.pipeline_step_completed", {
      step: AuditPipelineStep.SCORING,
      overallScore: scoreReport.overall.score,
    });

    failureContext = {
      code: "RESULT_PERSISTENCE_FAILED",
      message: "Audit results could not be stored safely.",
      stage: AuditStatus.GENERATING_REPORT,
      step: AuditPipelineStep.PERSISTING,
      retryable: true,
    };
    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.PERSISTING,
      currentStage: AuditStatus.GENERATING_REPORT,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
      message: "Saving crawled pages, findings, PageSpeed metrics, and scores.",
    });
    tools.log("info", "audit.pipeline_step_started", {
      step: AuditPipelineStep.PERSISTING,
    });
    const saved = await replaceAuditResults({
      auditId: context.auditId,
      pages: crawl.pages.map((page) => {
        const report = reportsByUrl.get(page.normalizedUrl);
        const metadata = page.metadata;
        return {
          url: page.url,
          normalizedUrl: page.normalizedUrl,
          title: page.title,
          metaDescription: page.description,
          canonicalUrl: page.canonical,
          canonicalDeclarations: metadata?.canonicalDeclarations ?? [],
          redirectUrl: page.redirectUrl,
          redirectCount: page.redirectCount,
          redirectChain: page.redirectChain,
          fetchErrorCode: page.fetchErrorCode,
          contentType: page.contentType,
          language: metadata?.language ?? report?.language ?? null,
          robotsDirectives: metadata?.robotsDirectives ?? [],
          openGraphTitle: metadata?.openGraph.title ?? null,
          openGraphDescription: metadata?.openGraph.description ?? null,
          openGraphImage: metadata?.openGraph.image ?? null,
          twitterCard: metadata?.twitter.card ?? null,
          twitterTitle: metadata?.twitter.title ?? null,
          twitterDescription: metadata?.twitter.description ?? null,
          twitterImage: metadata?.twitter.image ?? null,
          viewport: metadata?.viewport ?? null,
          isIndexable: page.indexable,
          headingCount: metadata?.counts.headings ?? report?.headingCount ?? 0,
          h1Count: metadata?.counts.h1 ?? report?.h1Count ?? 0,
          h2Count: metadata?.counts.h2 ?? 0,
          h3Count: metadata?.counts.h3 ?? 0,
          h4Count: metadata?.counts.h4 ?? 0,
          h5Count: metadata?.counts.h5 ?? 0,
          h6Count: metadata?.counts.h6 ?? 0,
          imageCount: metadata?.counts.images ?? report?.imageCount ?? 0,
          imagesMissingAlt:
            metadata?.counts.imagesMissingAlt ?? report?.imagesMissingAlt ?? 0,
          internalLinkCount: page.internalLinks.length,
          externalLinkCount: page.externalLinks.length,
          structuredDataCount: metadata?.counts.structuredData ?? 0,
          invalidStructuredDataCount:
            metadata?.counts.invalidStructuredData ?? 0,
          formCount: metadata?.counts.forms ?? 0,
          formControlCount: metadata?.counts.formControls ?? 0,
          labeledFormControlCount: metadata?.counts.labeledFormControls ?? 0,
          labelCount: metadata?.counts.labels ?? 0,
          buttonCount: metadata?.counts.buttons ?? 0,
          scriptCount: metadata?.counts.scripts ?? 0,
          stylesheetCount: metadata?.counts.stylesheets ?? 0,
          iframeCount: metadata?.counts.iframes ?? 0,
          mixedContentResourceCount:
            metadata?.counts.mixedContentResources ?? 0,
          metadataTruncatedFields: metadata?.truncatedFields ?? [],
          discoveredVia: page.discoveredVia,
          statusCode: page.statusCode,
          depth: page.depth,
          loadTimeMs: page.responseTimeMs,
          pageSizeBytes: page.pageSizeBytes,
          ...(page.errorMessage ? { errorMessage: page.errorMessage } : {}),
        };
      }),
      findings: persistedFindings,
      scores: scoreReport.scores.map((score) => ({
        category: score.category,
        score: score.score,
        evaluated: score.evaluated,
        weight: score.weight,
        ...(score.category === "OVERALL"
          ? { evaluatedWeight: score.evaluatedWeight }
          : {}),
        deduction: score.deduction,
        passedCredit: score.passedCredit,
        failingRuleCount: score.failingRuleCount,
        passedRuleCount: score.passedRuleCount,
      })),
      discovery: crawl.discovery,
      diagnostics,
      metrics: [
        ...siteReport.metrics,
        ...technicalReport.metrics,
        ...performanceReport.metrics,
        ...performancePageSpeedAvailabilityMetrics,
        ...mobileReport.metrics,
        ...mobilePageSpeedAvailabilityMetrics,
        ...securityReport.metrics,
        {
          key: "seo.javascript_rendering_used",
          value: 0,
          unit: "boolean",
        },
        {
          category: AuditCategory.TECHNICAL,
          key: "crawler.robots_applied",
          value: crawl.discovery.robots.applied ? 1 : 0,
          unit: "boolean",
        },
        {
          category: AuditCategory.TECHNICAL,
          key: "crawler.sitemap_documents_processed",
          value: crawl.discovery.sitemap.processedUrls.length,
          unit: "documents",
        },
        {
          category: AuditCategory.TECHNICAL,
          key: "crawler.sitemap_urls_discovered",
          value: crawl.discovery.sitemap.pageUrlsDiscovered,
          unit: "urls",
        },
        {
          category: AuditCategory.ACCESSIBILITY,
          key: "accessibility.browser_candidate_pages",
          value: accessibilityReport.candidatePageCount,
          unit: "pages",
        },
        {
          category: AuditCategory.ACCESSIBILITY,
          key: "accessibility.browser_selected_pages",
          value: accessibilityReport.selectedPageCount,
          unit: "pages",
        },
        {
          category: AuditCategory.ACCESSIBILITY,
          key: "accessibility.browser_analyzed_pages",
          value: accessibilityReport.analyzedPageCount,
          unit: "pages",
        },
        {
          category: AuditCategory.ACCESSIBILITY,
          key: "accessibility.browser_failed_pages",
          value: accessibilityReport.failedPageCount,
          unit: "pages",
        },
        {
          category: AuditCategory.ACCESSIBILITY,
          key: "accessibility.browser_truncated",
          value: accessibilityReport.truncated ? 1 : 0,
          unit: "boolean",
        },
        {
          category: AuditCategory.MOBILE,
          key: "mobile.browser_candidate_pages",
          value: mobileBrowserReport.candidatePageCount,
          unit: "pages",
        },
        {
          category: AuditCategory.MOBILE,
          key: "mobile.browser_selected_pages",
          value: mobileBrowserReport.selectedPageCount,
          unit: "pages",
        },
        {
          category: AuditCategory.MOBILE,
          key: "mobile.browser_failed_pages",
          value: mobileBrowserReport.failedPageCount,
          unit: "pages",
        },
        {
          category: AuditCategory.MOBILE,
          key: "mobile.browser_truncated",
          value: mobileBrowserReport.truncated ? 1 : 0,
          unit: "boolean",
        },
        {
          category: AuditCategory.TECHNICAL,
          key: "crawler.internal_link_urls_discovered",
          value: crawl.discovery.internalLinkUrlsDiscovered,
          unit: "urls",
        },
      ],
    });
    if (!saved) {
      throw new AuditProcessingError(
        "Audit results were not saved because the audit is no longer active.",
        {
          retryable: false,
          code: "RESULT_PERSISTENCE_REJECTED",
          stage: AuditStatus.GENERATING_REPORT,
          step: AuditPipelineStep.PERSISTING,
        },
      );
    }
    tools.log("info", "audit.pipeline_step_completed", {
      step: AuditPipelineStep.PERSISTING,
      pages: crawl.pages.length,
      findings: findings.length,
      diagnostics: diagnostics.length,
    });

    await tools.updateProgress({
      progress: AUDIT_PIPELINE_PROGRESS.FINALIZING,
      currentStage: AuditStatus.GENERATING_REPORT,
      pagesDiscovered: crawl.discoveredUrls.length,
      pagesCrawled: crawl.pages.length,
      message: `Saved ${crawl.pages.length} pages, ${findings.length} findings, and an overall score of ${scoreReport.overall.score}.`,
    });
  } catch (error) {
    throw safePipelineError(error, failureContext);
  }
};
