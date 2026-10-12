import { lookup as nodeLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";

import {
  normalizeUrl,
  type NormalizeUrlOptions,
  UrlSecurityError,
  UrlSecurityErrorCode,
} from "./url-normalization.js";

export type DnsLookupAddress = {
  address: string;
  family: 4 | 6;
};

export type DnsLookup = (hostname: string) => Promise<DnsLookupAddress[]>;

export type UrlValidationOptions = NormalizeUrlOptions & {
  lookup?: DnsLookup;
};

export type ResolvedPublicHost = {
  hostname: string;
  addresses: readonly DnsLookupAddress[];
  validatedAt: Date;
};

export type ValidatedPublicUrl = {
  url: URL;
  resolution: ResolvedPublicHost;
};

const blockedExactHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
]);

const blockedHostnameSuffixes = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".home",
  ".lan",
  ".arpa",
] as const;

const hostnameLabelPattern = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i;

function canonicalizeHostname(value: string): string {
  const unwrapped =
    value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  const withoutTrailingDot = unwrapped.toLowerCase().replace(/\.$/, "");

  if (isIP(withoutTrailingDot) !== 0) {
    return withoutTrailingDot;
  }

  const hostname = domainToASCII(withoutTrailingDot);
  if (!hostname) {
    throw new UrlSecurityError(
      UrlSecurityErrorCode.HOSTNAME_NOT_ALLOWED,
      "The URL contains an invalid hostname.",
    );
  }

  const labels = hostname.split(".");
  if (
    labels.length < 2 ||
    labels.some((label) => !hostnameLabelPattern.test(label))
  ) {
    throw new UrlSecurityError(
      UrlSecurityErrorCode.HOSTNAME_NOT_ALLOWED,
      "The URL must use a valid public hostname.",
    );
  }

  return hostname;
}

function assertHostnameAllowed(hostname: string): void {
  if (
    blockedExactHostnames.has(hostname) ||
    blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new UrlSecurityError(
      UrlSecurityErrorCode.HOSTNAME_NOT_ALLOWED,
      `Hostname ${hostname} is not a public destination.`,
    );
  }
}

function parseIpv4(address: string): number | null {
  if (isIP(address) !== 4) return null;

  const octets = address.split(".").map(Number);
  if (octets.length !== 4) return null;

  return octets.reduce((value, octet) => (value * 256 + octet) >>> 0, 0);
}

function ipv4InCidr(address: number, base: number, prefix: number): boolean {
  const shift = 32 - prefix;
  return address >>> shift === base >>> shift;
}

function isBlockedIpv4Number(address: number): boolean {
  const ranges: ReadonlyArray<readonly [number, number]> = [
    [0x00000000, 8],
    [0x0a000000, 8],
    [0x64400000, 10],
    [0x7f000000, 8],
    [0xa9fe0000, 16],
    [0xac100000, 12],
    [0xc0000000, 24],
    [0xc0000200, 24],
    [0xc0586300, 24],
    [0xc0a80000, 16],
    [0xc6120000, 15],
    [0xc6336400, 24],
    [0xcb007100, 24],
    [0xe0000000, 4],
    [0xf0000000, 4],
  ];

  return ranges.some(([base, prefix]) => ipv4InCidr(address, base, prefix));
}

function parseIpv6(address: string): bigint | null {
  if (isIP(address) !== 6 || address.includes("%")) return null;

  let normalized = address.toLowerCase();
  const ipv4Tail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];

  if (ipv4Tail) {
    const ipv4 = parseIpv4(ipv4Tail);
    if (ipv4 === null) return null;
    const high = ((ipv4 >>> 16) & 0xffff).toString(16);
    const low = (ipv4 & 0xffff).toString(16);
    normalized = normalized.slice(0, -ipv4Tail.length) + `${high}:${low}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;

  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    return null;
  }

  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[\da-f]{1,4}$/i.test(group))
  ) {
    return null;
  }

  return groups.reduce(
    (value, group) => (value << 16n) | BigInt(`0x${group}`),
    0n,
  );
}

function ipv6InCidr(address: bigint, base: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return address >> shift === base >> shift;
}

function isBlockedIpv6Number(address: bigint): boolean {
  const ranges: ReadonlyArray<readonly [bigint, number]> = [
    [0n, 96],
    [0x0064ff9b000000000000000000000000n, 96],
    [0x0064ff9b000100000000000000000000n, 48],
    [0x01000000000000000000000000000000n, 64],
    [0x20010000000000000000000000000000n, 32],
    [0x20010002000000000000000000000000n, 48],
    [0x20010db8000000000000000000000000n, 32],
    [0xfc000000000000000000000000000000n, 7],
    [0xfe800000000000000000000000000000n, 10],
    [0xfec00000000000000000000000000000n, 10],
    [0xff000000000000000000000000000000n, 8],
  ];

  if (ranges.some(([base, prefix]) => ipv6InCidr(address, base, prefix))) {
    return true;
  }

  const high96 = address >> 32n;
  if (high96 === 0xffffn) {
    return isBlockedIpv4Number(Number(address & 0xffffffffn));
  }

  if (ipv6InCidr(address, 0x20020000000000000000000000000000n, 16)) {
    const embeddedIpv4 = Number((address >> 80n) & 0xffffffffn);
    return isBlockedIpv4Number(embeddedIpv4);
  }

  return false;
}

export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) {
    const parsed = parseIpv4(address);
    return parsed !== null && !isBlockedIpv4Number(parsed);
  }

  if (version === 6) {
    const parsed = parseIpv6(address);
    return parsed !== null && !isBlockedIpv6Number(parsed);
  }

  return false;
}

function assertPublicAddress(address: string): DnsLookupAddress {
  const family = isIP(address);
  if ((family !== 4 && family !== 6) || !isPublicIpAddress(address)) {
    throw new UrlSecurityError(
      UrlSecurityErrorCode.ADDRESS_NOT_ALLOWED,
      `Address ${address} is not a public network destination.`,
    );
  }

  return { address, family };
}

async function defaultLookup(hostname: string): Promise<DnsLookupAddress[]> {
  const results = await nodeLookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({
    address,
    family: family === 6 ? 6 : 4,
  }));
}

/**
 * Resolves every A/AAAA answer and rejects the entire host if any answer is
 * private or otherwise non-public. The returned addresses must be pinned by
 * the HTTP client so a later DNS lookup cannot bypass this validation.
 */
export async function resolveAndValidateHost(
  hostnameInput: string,
  options: Pick<UrlValidationOptions, "lookup"> = {},
): Promise<ResolvedPublicHost> {
  const hostname = canonicalizeHostname(hostnameInput);
  assertHostnameAllowed(hostname);

  if (isIP(hostname) !== 0) {
    return {
      hostname,
      addresses: [assertPublicAddress(hostname)],
      validatedAt: new Date(),
    };
  }

  let results: DnsLookupAddress[];
  try {
    results = await (options.lookup ?? defaultLookup)(hostname);
  } catch (error) {
    if (error instanceof UrlSecurityError) throw error;
    throw new UrlSecurityError(
      UrlSecurityErrorCode.DNS_RESOLUTION_FAILED,
      `DNS resolution failed for ${hostname}.`,
    );
  }

  if (results.length === 0) {
    throw new UrlSecurityError(
      UrlSecurityErrorCode.NO_DNS_ADDRESSES,
      `No DNS addresses were found for ${hostname}.`,
    );
  }

  const uniqueAddresses = new Map<string, DnsLookupAddress>();
  for (const result of results) {
    const validated = assertPublicAddress(result.address);
    if (validated.family !== result.family) {
      throw new UrlSecurityError(
        UrlSecurityErrorCode.DNS_RESOLUTION_FAILED,
        `DNS returned an invalid address family for ${hostname}.`,
      );
    }
    uniqueAddresses.set(validated.address, validated);
  }

  return {
    hostname,
    addresses: [...uniqueAddresses.values()],
    validatedAt: new Date(),
  };
}

export async function validatePublicHttpUrl(
  value: string | URL,
  options: UrlValidationOptions = {},
): Promise<ValidatedPublicUrl> {
  const url = normalizeUrl(value, options);
  const resolution = await resolveAndValidateHost(url.hostname, options);
  return { url, resolution };
}

/** Repeats full URL and DNS validation for every redirect hop. */
export function validateRedirectDestination(
  destination: string | URL,
  currentUrl: string | URL,
  options: Omit<UrlValidationOptions, "baseUrl"> = {},
): Promise<ValidatedPublicUrl> {
  return validatePublicHttpUrl(destination, {
    ...options,
    baseUrl: currentUrl,
  });
}
