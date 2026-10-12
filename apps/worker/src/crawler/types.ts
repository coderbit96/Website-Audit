import type {
  RobotsPolicy,
  SecureHttpErrorCode,
  SecureHttpOptions,
  SecureHttpResponse,
  SecureRedirectHop,
} from "@website-audit/audit-core";

export type CrawlDiscoverySource = "ROOT" | "LINK" | "SITEMAP";

export type CrawledLink = {
  url: string;
  normalizedUrl: string;
  text: string;
  classification: "INTERNAL" | "EXTERNAL";
  nofollow: boolean;
};

export type ExtractedHeading = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
};

export type ExtractedImage = {
  src: string | null;
  alt: string | null;
  srcset: string | null;
  sizes: string | null;
  hasResponsiveSource: boolean;
};

export type ExtractedStructuredData = {
  validJson: boolean;
  types: string[];
  context: string | null;
};

export type ExtractedForm = {
  action: string | null;
  method: string;
  controlCount: number;
  labeledControlCount: number;
};

export type ExtractedLabel = {
  htmlFor: string | null;
  text: string;
};

export type ExtractedButton = {
  type: string;
  text: string;
  accessibleName: string;
};

export type ExtractedScript = {
  src: string | null;
  type: string | null;
  inline: boolean;
  async: boolean;
  defer: boolean;
};

export type ExtractedStylesheet = {
  href: string;
  media: string | null;
};

export type ExtractedIframe = {
  src: string | null;
  title: string | null;
};

export type MixedContentResource = {
  url: string;
  type: "IMAGE" | "SCRIPT" | "STYLESHEET" | "IFRAME" | "FORM" | "MEDIA";
};

export type ExtractedHtmlMetadata = {
  title: string | null;
  description: string | null;
  robotsMeta: string[];
  robotsDirectives: string[];
  canonical: string | null;
  canonicalDeclarations: string[];
  indexable: boolean;
  followable: boolean;
  headings: ExtractedHeading[];
  openGraph: {
    title: string | null;
    description: string | null;
    image: string | null;
  };
  twitter: {
    card: string | null;
    title: string | null;
    description: string | null;
    image: string | null;
  };
  language: string | null;
  images: ExtractedImage[];
  internalLinks: CrawledLink[];
  externalLinks: CrawledLink[];
  structuredData: ExtractedStructuredData[];
  viewport: string | null;
  forms: ExtractedForm[];
  labels: ExtractedLabel[];
  buttons: ExtractedButton[];
  scripts: ExtractedScript[];
  stylesheets: ExtractedStylesheet[];
  iframes: ExtractedIframe[];
  mixedContentResources: MixedContentResource[];
  counts: {
    headings: number;
    h1: number;
    h2: number;
    h3: number;
    h4: number;
    h5: number;
    h6: number;
    images: number;
    imagesMissingAlt: number;
    structuredData: number;
    invalidStructuredData: number;
    forms: number;
    formControls: number;
    labeledFormControls: number;
    labels: number;
    buttons: number;
    scripts: number;
    stylesheets: number;
    iframes: number;
    mixedContentResources: number;
  };
  truncatedFields: string[];
};

export type CrawledPage = {
  requestedUrl: string;
  url: string;
  normalizedUrl: string;
  redirectUrl: string | null;
  redirectCount: number;
  redirectChain: readonly SecureRedirectHop[];
  fetchErrorCode: SecureHttpErrorCode | "ROBOTS_DENIED" | "UNKNOWN" | null;
  statusCode: number | null;
  contentType: string | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  indexable: boolean;
  followable: boolean;
  depth: number;
  responseTimeMs: number | null;
  pageSizeBytes: number;
  discoveredVia: CrawlDiscoverySource;
  internalLinks: CrawledLink[];
  externalLinks: CrawledLink[];
  metadata: ExtractedHtmlMetadata | null;
  errorMessage: string | null;
};

export type CrawlDocument = {
  html: string;
  headers: Readonly<Record<string, string>>;
  setCookieHeaders: readonly string[];
  siteOrigin: string;
};

export type CrawlProgress = {
  pagesDiscovered: number;
  pagesCrawled: number;
  currentUrl: string;
};

export type CrawlResult = {
  siteOrigin: string;
  pages: CrawledPage[];
  discoveredUrls: string[];
  discovery: CrawlDiscoveryInfo;
  externalLinkChecks: ExternalLinkCheckSummary;
};

export type ExternalLinkCheck = {
  url: string;
  statusCode: number | null;
  redirectCount: number;
  sourceUrls: string[];
  errorCode: SecureHttpErrorCode | "UNKNOWN" | null;
};

export type ExternalLinkCheckSummary = {
  enabled: boolean;
  /** Distinct retained candidates; a lower bound when truncated is true. */
  candidateCount: number;
  checkedCount: number;
  truncated: boolean;
  results: ExternalLinkCheck[];
};

export type CrawlDiscoveryInfo = {
  robots: {
    url: string;
    status: "FOUND" | "NOT_FOUND" | "UNAVAILABLE";
    applied: boolean;
  };
  sitemap: {
    declaredUrls: string[];
    processedUrls: string[];
    pageUrls: string[];
    pageUrlsDiscovered: number;
    rejectedUrlCount: number;
    truncated: boolean;
  };
  internalLinkUrlsDiscovered: number;
};

export type CrawlerSettings = {
  maximumPages: number;
  maximumDepth: number;
  concurrency?: number;
  respectRobotsTxt: boolean;
  checkExternalLinks?: boolean;
  requestTimeoutMs?: number;
  maximumBodyBytes?: number;
};

export type CrawlerCallbacks = {
  onPage?: (
    page: CrawledPage,
    document: CrawlDocument | null,
  ) => void | Promise<void>;
  onDiscovery?: (
    discovery: Readonly<CrawlDiscoveryInfo>,
  ) => void | Promise<void>;
  onProgress?: (progress: CrawlProgress) => void | Promise<void>;
};

export type CrawlerDependencies = {
  fetchUrl: (
    url: string | URL,
    options?: SecureHttpOptions,
  ) => Promise<SecureHttpResponse>;
  loadRobots: (
    origin: string | URL,
    options?: { signal?: AbortSignal },
  ) => Promise<RobotsPolicy>;
};
