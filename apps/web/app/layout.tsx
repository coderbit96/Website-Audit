import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { getSiteUrl } from "../lib/seo/site-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "SiteSignal | Website intelligence, clearly delivered",
    template: "%s | SiteSignal",
  },
  description:
    "A professional website audit platform for SEO, performance, accessibility, security, and mobile quality.",
  applicationName: "SiteSignal",
  category: "BusinessApplication",
  openGraph: {
    type: "website",
    siteName: "SiteSignal",
    title: "SiteSignal | Website intelligence, clearly delivered",
    description:
      "Run evidence-based website audits for SEO, performance, accessibility, security, and technical quality.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SiteSignal | Website intelligence, clearly delivered",
    description:
      "Run evidence-based website audits for SEO, performance, accessibility, security, and technical quality.",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("sitesignal-theme");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
