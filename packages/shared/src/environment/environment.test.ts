import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDeploymentPublicEnvironment,
  parsePublicEnvironment,
} from "./public.js";
import {
  parseDevelopmentSeedEnvironment,
  parseWebServerEnvironment,
  parseWorkerEnvironment,
} from "./server.js";

const baseEnvironment = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/website_audit",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  AUTH_URL: "http://localhost:3000",
  AUTH_SECRET: "development-auth-secret-with-32-characters",
} as const;

test("keeps the public environment limited to browser-safe variables", () => {
  const parsed = parsePublicEnvironment({
    NEXT_PUBLIC_APP_URL: baseEnvironment.NEXT_PUBLIC_APP_URL,
    AUTH_SECRET: "must-not-be-returned",
    MONGODB_URI: "must-not-be-returned",
  });

  assert.deepEqual(parsed, {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  });
  assert.equal("AUTH_SECRET" in parsed, false);
  assert.equal("MONGODB_URI" in parsed, false);
});

test("uses Vercel's production domain when no canonical URL is configured", () => {
  assert.deepEqual(
    parseDeploymentPublicEnvironment({
      VERCEL_PROJECT_PRODUCTION_URL: "sitesignal.vercel.app",
    }),
    { NEXT_PUBLIC_APP_URL: "https://sitesignal.vercel.app" },
  );
});

test("prefers an explicit canonical URL and rejects invalid configuration", () => {
  assert.deepEqual(
    parseDeploymentPublicEnvironment({
      NEXT_PUBLIC_APP_URL: "https://sitesignal.example",
      VERCEL_PROJECT_PRODUCTION_URL: "sitesignal.vercel.app",
    }),
    { NEXT_PUBLIC_APP_URL: "https://sitesignal.example" },
  );
  assert.throws(
    () =>
      parseDeploymentPublicEnvironment({
        NEXT_PUBLIC_APP_URL: "",
        VERCEL_PROJECT_PRODUCTION_URL: "sitesignal.vercel.app",
      }),
    /NEXT_PUBLIC_APP_URL/,
  );
  assert.throws(
    () =>
      parseDeploymentPublicEnvironment({
        VERCEL_PROJECT_PRODUCTION_URL: "sitesignal.vercel.app\/bad",
      }),
    /invalid Vercel production domain/,
  );
  assert.throws(() => parseDeploymentPublicEnvironment({}), /NEXT_PUBLIC_APP_URL/);
});

test("validates and normalizes the actual web server environment", () => {
  const parsed = parseWebServerEnvironment({
    ...baseEnvironment,
    RATE_LIMIT_TRUST_PROXY: "false",
    PUBLIC_AUDIT_TRUST_PROXY: "true",
    GOOGLE_PAGESPEED_API_KEY: "",
  });

  assert.equal(parsed.RATE_LIMIT_TRUST_PROXY, false);
  assert.equal(parsed.PUBLIC_AUDIT_TRUST_PROXY, true);
  assert.equal(parsed.GOOGLE_PAGESPEED_API_KEY, undefined);
  assert.equal(parsed.RAZORPAY_KEY_SECRET, undefined);
});

test("allows Auth.js to use Vercel's request host without a fixed auth URL", () => {
  const withoutAuthUrl = { ...baseEnvironment, AUTH_URL: undefined };
  const parsed = parseWebServerEnvironment({
    ...withoutAuthUrl,
    VERCEL: "1",
  });
  assert.equal(parsed.AUTH_URL, undefined);
  assert.equal(parsed.VERCEL, "1");
  assert.throws(
    () => parseWebServerEnvironment(withoutAuthUrl),
    /AUTH_URL or NEXTAUTH_URL is required outside Vercel/,
  );
});

test("checkout requires a Razorpay key ID and key secret together", () => {
  assert.throws(
    () =>
      parseWebServerEnvironment({
        ...baseEnvironment,
        RAZORPAY_KEY_ID: "rzp_test_12345678901234",
      }),
    /RAZORPAY_KEY_ID/,
  );
  const parsed = parseWebServerEnvironment({
    ...baseEnvironment,
    RAZORPAY_KEY_ID: "rzp_test_12345678901234",
    RAZORPAY_KEY_SECRET: "test-secret-with-enough-length",
  });
  assert.equal(parsed.RAZORPAY_KEY_ID, "rzp_test_12345678901234");
  assert.equal(
    "RAZORPAY_KEY_SECRET" in parsePublicEnvironment(baseEnvironment),
    false,
  );
});

test("keeps the Razorpay webhook secret optional", () => {
  const parsed = parseWebServerEnvironment({
    ...baseEnvironment,
    RAZORPAY_KEY_ID: "rzp_test_12345678901234",
    RAZORPAY_KEY_SECRET: "test-secret-with-enough-length",
  });
  assert.equal(parsed.RAZORPAY_WEBHOOK_SECRET, undefined);
});

test("rejects missing required server variables without including values", () => {
  assert.throws(
    () => parseWebServerEnvironment({ NODE_ENV: "production" }),
    (error: unknown) => {
      assert.match(String(error), /MONGODB_URI/);
      assert.match(String(error), /AUTH_SECRET/);
      assert.doesNotMatch(String(error), /development-auth-secret/);
      return true;
    },
  );
});

test("rejects weak production authentication secrets", () => {
  assert.throws(
    () =>
      parseWebServerEnvironment({
        ...baseEnvironment,
        NODE_ENV: "production",
        AUTH_SECRET: "short-development",
      }),
    /AUTH_SECRET.*32/,
  );
});

test("keeps the PageSpeed key optional for the worker", () => {
  assert.deepEqual(
    parseWorkerEnvironment({
      MONGODB_URI: baseEnvironment.MONGODB_URI,
      GOOGLE_PAGESPEED_API_KEY: "",
    }),
    {
      MONGODB_URI: baseEnvironment.MONGODB_URI,
      NODE_ENV: "development",
      GOOGLE_PAGESPEED_API_KEY: undefined,
    },
  );
});

test("requires an explicit non-production opt-in for development seeds", () => {
  assert.throws(
    () => parseDevelopmentSeedEnvironment(baseEnvironment),
    /DEVELOPMENT_SEED_ENABLED/,
  );
  assert.throws(
    () =>
      parseDevelopmentSeedEnvironment({
        ...baseEnvironment,
        NODE_ENV: "production",
        DEVELOPMENT_SEED_ENABLED: "true",
      }),
    /forbidden in production/,
  );
});
