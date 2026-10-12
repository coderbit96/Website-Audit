import assert from "node:assert/strict";
import test from "node:test";

import { extractHtmlMetadata } from "./html.js";

test("extracts bounded page metadata without retaining raw HTML", () => {
  const metadata = extractHtmlMetadata({
    pageUrl: "https://example.com/products/item?b=2&a=1",
    siteOrigin: "https://example.com",
    xRobotsTag: "nofollow",
    html: `<!doctype html>
      <html lang="en-US"><head>
        <title> Product page </title>
        <meta name="description" content="A useful product description">
        <meta name="robots" content="noindex, max-snippet:50">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="canonical" href="/products/item">
        <meta property="og:title" content="Open Graph title">
        <meta property="og:description" content="Open Graph description">
        <meta property="og:image" content="/social.jpg">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="Twitter title">
        <meta name="twitter:description" content="Twitter description">
        <meta name="twitter:image" content="/twitter.jpg">
        <link rel="stylesheet" href="http://cdn.example.com/site.css" media="screen">
        <script src="http://cdn.example.com/app.js" defer></script>
        <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product"},{"@type":"Offer"}]}</script>
        <script type="application/ld+json">{broken}</script>
      </head><body>
        <h1>Product</h1><h2>Details</h2><h3></h3>
        <img src="http://cdn.example.com/product.jpg" srcset="/product-400.jpg 400w, /product-800.jpg 800w" sizes="100vw" alt="Product photo">
        <img src="/decorative.svg" alt=""><img src="/missing.jpg">
        <a href="/internal#details">Internal</a>
        <a href="https://outside.example/path">External</a>
        <form action="http://forms.example.com/submit" method="post">
          <label for="email">Email address</label><input id="email" name="email">
          <input name="search" aria-label="Search"><textarea name="notes"></textarea>
          <button type="submit" aria-label="Send form">Send</button>
          <input type="reset" value="Clear">
        </form>
        <iframe src="http://frames.example.com/embed" title="Product video"></iframe>
        <video><source src="http://media.example.com/video.mp4"></video>
      </body></html>`,
  });

  assert.equal(metadata.title, "Product page");
  assert.equal(metadata.description, "A useful product description");
  assert.deepEqual(metadata.robotsDirectives.sort(), [
    "max-snippet:50",
    "nofollow",
    "noindex",
  ]);
  assert.equal(metadata.indexable, false);
  assert.equal(metadata.followable, false);
  assert.equal(metadata.canonical, "https://example.com/products/item");
  assert.deepEqual(
    metadata.headings.map((heading) => heading.level),
    [1, 2, 3],
  );
  assert.equal(metadata.openGraph.image, "https://example.com/social.jpg");
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.equal(metadata.twitter.image, "https://example.com/twitter.jpg");
  assert.equal(metadata.language, "en-US");
  assert.equal(metadata.images[1]?.alt, "");
  assert.equal(metadata.images[2]?.alt, null);
  assert.deepEqual(metadata.images[0], {
    src: "http://cdn.example.com/product.jpg",
    alt: "Product photo",
    srcset: "/product-400.jpg 400w, /product-800.jpg 800w",
    sizes: "100vw",
    hasResponsiveSource: true,
  });
  assert.equal(metadata.internalLinks[0]?.url, "https://example.com/internal");
  assert.equal(metadata.externalLinks[0]?.url, "https://outside.example/path");
  assert.deepEqual(metadata.structuredData[0]?.types, ["Product", "Offer"]);
  assert.equal(metadata.structuredData[1]?.validJson, false);
  assert.equal(metadata.viewport, "width=device-width, initial-scale=1");
  assert.deepEqual(metadata.forms[0], {
    action: "http://forms.example.com/submit",
    method: "post",
    controlCount: 3,
    labeledControlCount: 2,
  });
  assert.deepEqual(metadata.labels[0], {
    htmlFor: "email",
    text: "Email address",
  });
  assert.equal(metadata.buttons[0]?.accessibleName, "Send form");
  assert.equal(metadata.scripts[0]?.defer, true);
  assert.equal(metadata.stylesheets[0]?.media, "screen");
  assert.equal(metadata.iframes[0]?.title, "Product video");
  assert.equal(metadata.mixedContentResources.length, 6);
  assert.deepEqual(metadata.counts, {
    headings: 3,
    h1: 1,
    h2: 1,
    h3: 1,
    h4: 0,
    h5: 0,
    h6: 0,
    images: 3,
    imagesMissingAlt: 1,
    structuredData: 2,
    invalidStructuredData: 1,
    forms: 1,
    formControls: 3,
    labeledFormControls: 2,
    labels: 1,
    buttons: 2,
    scripts: 3,
    stylesheets: 1,
    iframes: 1,
    mixedContentResources: 6,
  });
  assert.equal("html" in metadata, false);
});

test("caps extracted detail arrays while retaining total counts", () => {
  const headings = Array.from(
    { length: 205 },
    (_, index) => `<h2>Heading ${index}</h2>`,
  ).join("");
  const metadata = extractHtmlMetadata({
    pageUrl: "https://example.com/",
    siteOrigin: "https://example.com",
    html: `<html><body>${headings}</body></html>`,
  });

  assert.equal(metadata.headings.length, 200);
  assert.equal(metadata.counts.headings, 205);
  assert.equal(metadata.counts.h2, 205);
  assert.equal(metadata.truncatedFields.includes("headings"), true);
});
