import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { parseWebServerEnvironment } from "@website-audit/shared/environment/server";

loadEnv({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

// Fail before the development or production server starts. Validation errors
// identify variable names without including their values.
parseWebServerEnvironment(process.env);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";
    // Headers are compiled with the app. Keep checkout origins available even
    // when credentials are injected later at runtime by the deployment host.
    const razorpaySources = " https://*.razorpay.com https://*.razorpay.in";
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://checkout.razorpay.com`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${razorpaySources}`,
      "font-src 'self' data:",
      `connect-src 'self'${isProduction ? "" : " ws: wss:"}${razorpaySources}`,
      `frame-src${razorpaySources}`,
      "worker-src 'self' blob:",
      ...(isProduction ? ["upgrade-insecure-requests"] : []),
    ].join("; ");

    const securityHeaders = [
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      {
        key: "Permissions-Policy",
        value:
          'camera=(), geolocation=(), microphone=(), payment=(self "https://checkout.razorpay.com"), usb=()',
      },
      ...(isProduction
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains",
            },
          ]
        : []),
    ];

    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
  // Local workspace packages publish compiled ESM. Explicitly watch and
  // transpile them so development reloads do not retain a stale export map.
  transpilePackages: [
    "@website-audit/audit-core",
    "@website-audit/audit-rules",
    "@website-audit/database",
    "@website-audit/shared",
    "@website-audit/ui",
  ],
};

export default nextConfig;
