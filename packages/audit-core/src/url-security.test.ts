import assert from "node:assert/strict";
import test from "node:test";

import {
  isPublicIpAddress,
  normalizeUrl,
  resolveAndValidateHost,
  UrlSecurityError,
  UrlSecurityErrorCode,
  validatePublicHttpUrl,
  validateRedirectDestination,
  type DnsLookup,
} from "./index.js";

const publicLookup: DnsLookup = async () => [
  { address: "1.1.1.1", family: 4 },
  { address: "2606:4700:4700::1111", family: 6 },
];

function expectSecurityCode(code: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof UrlSecurityError);
    assert.equal(error.code, code);
    return true;
  };
}

test("normalizes domain input and removes fragments", () => {
  assert.equal(
    normalizeUrl(" Example.COM/path#section ").href,
    "https://example.com/path",
  );
  assert.equal(
    normalizeUrl("http://example.com:80/").href,
    "http://example.com/",
  );
});

test("accepts a valid public HTTPS URL after checking all DNS answers", async () => {
  const validated = await validatePublicHttpUrl(
    "https://example.com/products?page=2",
    { lookup: publicLookup },
  );

  assert.equal(validated.url.href, "https://example.com/products?page=2");
  assert.deepEqual(validated.resolution.addresses, [
    { address: "1.1.1.1", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ]);
});

test("accepts a valid public HTTP URL", async () => {
  const validated = await validatePublicHttpUrl("http://example.com", {
    lookup: publicLookup,
  });

  assert.equal(validated.url.protocol, "http:");
});

test("classifies public addresses outside blocked ranges", () => {
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("172.15.255.255"), true);
  assert.equal(isPublicIpAddress("172.32.0.1"), true);
  assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);
});

test("rejects localhost and internal hostname variants before DNS", async () => {
  for (const hostname of [
    "localhost",
    "api.localhost",
    "service.internal",
    "router.local",
    "metadata.google.internal",
  ]) {
    await assert.rejects(
      validatePublicHttpUrl(`http://${hostname}`),
      expectSecurityCode(UrlSecurityErrorCode.HOSTNAME_NOT_ALLOWED),
    );
  }
});

test("rejects loopback, unspecified, private, link-local, and metadata IPv4 addresses", async () => {
  const blocked = [
    "0.0.0.0",
    "10.0.0.1",
    "100.100.100.200",
    "127.0.0.1",
    "127.255.255.255",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
  ];

  for (const address of blocked) {
    assert.equal(isPublicIpAddress(address), false, address);
    await assert.rejects(
      validatePublicHttpUrl(`http://${address}`),
      expectSecurityCode(UrlSecurityErrorCode.ADDRESS_NOT_ALLOWED),
    );
  }
});

test("rejects IPv6 loopback, private, link-local, mapped private, and metadata addresses", async () => {
  const blocked = [
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fd00:ec2::254",
    "fe80::1",
    "fec0::1",
    "ff02::1",
  ];

  for (const address of blocked) {
    assert.equal(isPublicIpAddress(address), false, address);
    await assert.rejects(
      validatePublicHttpUrl(`http://[${address}]/`),
      expectSecurityCode(UrlSecurityErrorCode.ADDRESS_NOT_ALLOWED),
    );
  }
});

test("rejects malformed URLs", async () => {
  await assert.rejects(
    validatePublicHttpUrl("http://%"),
    expectSecurityCode(UrlSecurityErrorCode.MALFORMED_URL),
  );
});

test("rejects file, FTP, data, JavaScript, and other unsupported protocols", async () => {
  const unsafeUrls = [
    "file:///etc/passwd",
    "ftp://example.com/file",
    "data:text/plain,hello",
    "javascript:alert(1)",
    "ws://example.com/socket",
  ];

  for (const url of unsafeUrls) {
    await assert.rejects(
      validatePublicHttpUrl(url),
      expectSecurityCode(UrlSecurityErrorCode.UNSUPPORTED_PROTOCOL),
    );
  }
});

test("rejects credentials embedded in a URL", async () => {
  await assert.rejects(
    validatePublicHttpUrl("https://user:password@example.com", {
      lookup: publicLookup,
    }),
    expectSecurityCode(UrlSecurityErrorCode.CREDENTIALS_NOT_ALLOWED),
  );
});

test("rejects a hostname when any DNS answer is private", async () => {
  const rebindingLookup: DnsLookup = async () => [
    { address: "1.1.1.1", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ];

  await assert.rejects(
    resolveAndValidateHost("example.com", { lookup: rebindingLookup }),
    expectSecurityCode(UrlSecurityErrorCode.ADDRESS_NOT_ALLOWED),
  );
});

test("rejects empty DNS results and resolution failures", async () => {
  await assert.rejects(
    resolveAndValidateHost("example.com", { lookup: async () => [] }),
    expectSecurityCode(UrlSecurityErrorCode.NO_DNS_ADDRESSES),
  );
  await assert.rejects(
    resolveAndValidateHost("example.com", {
      lookup: async () => {
        throw new Error("NXDOMAIN");
      },
    }),
    expectSecurityCode(UrlSecurityErrorCode.DNS_RESOLUTION_FAILED),
  );
});

test("revalidates relative redirects and accepts a public destination", async () => {
  const validated = await validateRedirectDestination(
    "/next",
    "https://example.com/start",
    { lookup: publicLookup },
  );

  assert.equal(validated.url.href, "https://example.com/next");
  assert.equal(validated.resolution.addresses.length, 2);
});

test("rejects redirects to literal and DNS-resolved private destinations", async () => {
  await assert.rejects(
    validateRedirectDestination(
      "http://127.0.0.1/admin",
      "https://example.com/start",
    ),
    expectSecurityCode(UrlSecurityErrorCode.ADDRESS_NOT_ALLOWED),
  );

  await assert.rejects(
    validateRedirectDestination(
      "https://redirect.example.com/metadata",
      "https://example.com/start",
      {
        lookup: async () => [{ address: "169.254.169.254", family: 4 }],
      },
    ),
    expectSecurityCode(UrlSecurityErrorCode.ADDRESS_NOT_ALLOWED),
  );
});

test("rejects encoded and alternate loopback IPv4 notations after URL parsing", async () => {
  for (const url of [
    "http://2130706433",
    "http://0x7f000001",
    "http://0177.0.0.1",
  ]) {
    await assert.rejects(
      validatePublicHttpUrl(url),
      expectSecurityCode(UrlSecurityErrorCode.ADDRESS_NOT_ALLOWED),
    );
  }
});
