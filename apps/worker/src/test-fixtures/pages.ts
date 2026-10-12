/**
 * Small, deterministic HTML documents used by crawler tests. Keeping these
 * local prevents the suite from depending on public websites or live DNS.
 */
export const controlledPageFixtures = {
  crawlRoot: `<!doctype html><html lang="en"><head><title>Root</title></head><body>
    <a href="/a#one">A one</a><a href="/a#two">A two</a>
    <a href="/search?b=2&a=1">Search</a>
    <a href="https://outside.example/">Outside</a>
  </body></html>`,
  crawlChild: `<!doctype html><html lang="en"><head><title>A</title></head><body>
    <a href="/deep">Deep</a>
  </body></html>`,
  notFound:
    "<!doctype html><html><head><title>Missing</title></head><body></body></html>",
} as const;
