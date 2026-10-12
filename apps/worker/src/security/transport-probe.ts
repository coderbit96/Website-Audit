import {
  SecureHttpError,
  secureFetchUrl,
  type SecureHttpOptions,
  type SecureHttpResponse,
  type SecureRedirectHop,
} from "@website-audit/audit-core";
import type { SecurityTransportObservation } from "@website-audit/audit-rules";

export type PassiveTransportRoot = {
  requestedUrl: string;
  url: string;
  statusCode: number | null;
  redirectChain: readonly SecureRedirectHop[];
};

export type PassiveTransportFetch = (
  url: string | URL,
  options?: SecureHttpOptions,
) => Promise<SecureHttpResponse>;

function urlWithProtocol(value: string, protocol: "http:" | "https:"): string {
  const url = new URL(value);
  url.protocol = protocol;
  url.hash = "";
  return url.href;
}

function redirectsToHttps(redirects: readonly SecureRedirectHop[]): boolean {
  return redirects.some((redirect) => {
    const source = new URL(redirect.sourceUrl);
    const destination = new URL(redirect.destinationUrl);
    return source.protocol === "http:" && destination.protocol === "https:";
  });
}

function observedHttps(root: PassiveTransportRoot): boolean {
  return (
    new URL(root.requestedUrl).protocol === "https:" ||
    new URL(root.url).protocol === "https:" ||
    root.redirectChain.some(
      (redirect) =>
        new URL(redirect.sourceUrl).protocol === "https:" ||
        new URL(redirect.destinationUrl).protocol === "https:",
    )
  );
}

function safeErrorCode(error: unknown): string {
  return error instanceof SecureHttpError ? error.code : "UNKNOWN";
}

const probeOptions = (signal: AbortSignal): SecureHttpOptions => ({
  signal,
  timeoutMs: 10_000,
  maximumBodyBytes: 64 * 1024,
  maximumRedirects: 5,
  method: "GET",
});

/**
 * Performs at most one ordinary GET request in addition to the crawl. It does
 * not scan ports, bypass TLS validation, submit data, or attempt exploitation.
 */
export async function observePassiveTransport(
  root: PassiveTransportRoot,
  signal: AbortSignal,
  fetchUrl: PassiveTransportFetch = secureFetchUrl,
): Promise<SecurityTransportObservation> {
  signal.throwIfAborted();
  const requestedProtocol = new URL(root.requestedUrl).protocol;
  const finalProtocol = new URL(root.url).protocol;
  const tlsAlreadyObserved = observedHttps(root);
  const initialHttpObserved = requestedProtocol === "http:";
  const rootRedirectsToHttps = redirectsToHttps(root.redirectChain);

  let tlsAvailability: SecurityTransportObservation["tlsAvailability"] =
    tlsAlreadyObserved ? "AVAILABLE" : "CANNOT_DETERMINE";
  let tlsUrl = urlWithProtocol(root.url, "https:");
  let tlsEvidence = tlsAlreadyObserved
    ? "A validated HTTPS connection was observed during the root crawl."
    : "HTTPS availability could not be determined from the root crawl.";
  let httpToHttpsBehavior: SecurityTransportObservation["httpToHttpsBehavior"];
  let httpProbeUrl = urlWithProtocol(root.url, "http:");
  let httpFinalUrl: string | null = null;
  let httpStatusCode: number | null = null;
  let httpEvidence: string;

  if (initialHttpObserved) {
    httpProbeUrl = root.requestedUrl;
    httpFinalUrl = root.url;
    httpStatusCode = root.statusCode;
    if (rootRedirectsToHttps || finalProtocol === "https:") {
      httpToHttpsBehavior = "REDIRECTS_TO_HTTPS";
      httpEvidence =
        "The root crawl observed an HTTP request upgrading to HTTPS.";
    } else if (root.statusCode !== null && finalProtocol === "http:") {
      httpToHttpsBehavior = "DOES_NOT_REDIRECT";
      httpEvidence =
        "The HTTP root returned a response without upgrading to HTTPS.";
    } else {
      httpToHttpsBehavior = "CANNOT_DETERMINE";
      httpEvidence =
        "The HTTP-to-HTTPS behavior could not be determined from the root crawl.";
    }
  } else {
    try {
      const response = await fetchUrl(httpProbeUrl, probeOptions(signal));
      httpFinalUrl = response.finalUrl;
      httpStatusCode = response.statusCode;
      if (
        redirectsToHttps(response.redirects) ||
        new URL(response.finalUrl).protocol === "https:"
      ) {
        httpToHttpsBehavior = "REDIRECTS_TO_HTTPS";
        httpEvidence =
          "A passive HTTP request was observed upgrading to HTTPS.";
      } else {
        httpToHttpsBehavior = "DOES_NOT_REDIRECT";
        httpEvidence =
          "A passive HTTP request returned without upgrading to HTTPS.";
      }
    } catch (error) {
      if (signal.aborted) throw error;
      const redirects =
        error instanceof SecureHttpError ? error.redirects : ([] as const);
      if (redirectsToHttps(redirects)) {
        httpToHttpsBehavior = "REDIRECTS_TO_HTTPS";
        httpFinalUrl =
          redirects.at(-1)?.destinationUrl ??
          urlWithProtocol(root.url, "https:");
        httpEvidence =
          "The HTTP endpoint was observed redirecting to HTTPS, but the final response could not be completed.";
      } else {
        httpToHttpsBehavior = "CANNOT_DETERMINE";
        httpEvidence = `The passive HTTP request was inconclusive (${safeErrorCode(error)}).`;
      }
    }
  }

  if (!tlsAlreadyObserved) {
    try {
      const response = await fetchUrl(tlsUrl, probeOptions(signal));
      tlsAvailability = "AVAILABLE";
      tlsEvidence = `A validated HTTPS response was observed with HTTP status ${response.statusCode}.`;
    } catch (error) {
      if (signal.aborted) throw error;
      tlsAvailability = "CANNOT_DETERMINE";
      tlsEvidence = `HTTPS availability could not be confirmed (${safeErrorCode(error)}).`;
    }
  } else if (new URL(root.url).protocol === "https:") {
    tlsUrl = root.url;
  } else {
    tlsUrl =
      root.redirectChain.find(
        (redirect) => new URL(redirect.sourceUrl).protocol === "https:",
      )?.sourceUrl ?? tlsUrl;
  }

  return {
    tlsAvailability,
    tlsUrl,
    tlsEvidence,
    httpToHttpsBehavior,
    httpProbeUrl,
    httpFinalUrl,
    httpStatusCode,
    httpEvidence,
  };
}
