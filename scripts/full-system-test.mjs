/**
 * Opt-in, isolated local HTTP + worker smoke test.
 * Run only after `npm run build`, with a local MongoDB listening on 127.0.0.1.
 * This script never reads the project's .env and never drops a database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

const root = process.cwd();
const port = 3107;
const origin = `http://localhost:${port}`;
const suffix = randomBytes(6).toString("hex");
const databaseName = `website_audit_system_test_${suffix}`;
const databaseUrl = `mongodb://127.0.0.1:27017/${databaseName}`;
// Set this before importing the database package, which otherwise loads .env.
process.env.MONGODB_URI = databaseUrl;
const secret = randomBytes(48).toString("hex");
const password = `SystemTest-${randomBytes(12).toString("hex")}aA1`;
const email = `system-test-${suffix}@example.test`;
const childEnv = {
  ...process.env,
  MONGODB_URI: databaseUrl,
  AUTH_URL: origin,
  NEXTAUTH_URL: origin,
  NEXT_PUBLIC_APP_URL: origin,
  AUTH_SECRET: secret,
  GOOGLE_PAGESPEED_API_KEY: "",
  DEVELOPMENT_SEED_ENABLED: "false",
};
const children = [];
const logs = [];
let disconnectDatabase;

async function assertPortAvailable() {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => server.close(resolve));
  });
}

function check(name, condition) {
  assert.ok(condition, name);
  process.stdout.write(`PASS ${name}\n`);
}

function start(label, file, args, cwd) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      logs.push(`${label}: ${chunk}`);
      if (logs.length > 100) logs.shift();
    });
  }
  children.push(child);
  return child;
}

class Session {
  #cookies = new Map();

  async request(url, options = {}) {
    const headers = new Headers(options.headers);
    const cookie = [...this.#cookies]
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(`${origin}${url}`, {
      ...options,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    for (const entry of response.headers.getSetCookie()) {
      const [pair] = entry.split(";");
      const separator = pair.indexOf("=");
      if (separator < 0) continue;
      const key = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.#cookies.set(key, value);
      else this.#cookies.delete(key);
    }
    return response;
  }

  json(url, body, method = "POST") {
    return this.request(url, {
      method,
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    });
  }

  async signIn(accountEmail, accountPassword) {
    const csrfResponse = await this.request("/api/auth/csrf");
    assert.equal(csrfResponse.status, 200);
    const { csrfToken } = await csrfResponse.json();
    const form = new URLSearchParams({
      csrfToken,
      email: accountEmail,
      password: accountPassword,
      callbackUrl: `${origin}/dashboard`,
      json: "true",
    });
    const response = await this.request("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin,
      },
      body: form,
    });
    assert.equal(response.status, 200, "credentials callback");
    return response.json();
  }
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Web server exited with ${child.exitCode}`);
    }
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) return;
    } catch {
      // Startup is still in progress.
    }
    await delay(500);
  }
  throw new Error("Web server did not become ready.");
}

async function waitForAudit(session, auditId) {
  const states = new Set();
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const response = await session.request(`/api/audits/${auditId}/status`);
    assert.equal(response.status, 200, "audit status endpoint");
    const { data } = await response.json();
    states.add(data.status);
    if (data.status === "COMPLETED" || data.status === "FAILED") {
      return { data, states: [...states] };
    }
    await delay(1_000);
  }
  throw new Error(`Audit ${auditId} did not finish within 3 minutes.`);
}

async function main() {
  const {
    connectToDatabase,
    disconnectFromDatabase,
    AuditModel,
    AuditPageModel,
    AuditFindingModel,
    AuditMetricModel,
    AuditScoreModel,
    ClientModel,
    PlanModel,
    ReportModel,
    SubscriptionModel,
    getAuditComparisonForWorkspace,
    listAuditHistoryForWorkspace,
    getPublicAuditByToken,
    getWorkspaceEntitlementContext,
    reserveWorkspaceUsage,
    replaceClientWebsitesForWorkspace,
  } = await import("@website-audit/database");
  disconnectDatabase = disconnectFromDatabase;
  const mongo = await connectToDatabase();
  assert.equal(
    mongo.connection.host,
    "127.0.0.1",
    "system test must use local MongoDB",
  );
  assert.equal(
    mongo.connection.name,
    databaseName,
    "system test database mismatch",
  );
  check("isolated local MongoDB connection", true);

  const migration = spawnSync(
    process.execPath,
    [
      path.join(
        root,
        "packages/database/dist/migrations/20261010-audit-result-identities.js",
      ),
      "--apply",
    ],
    { cwd: root, env: childEnv, timeout: 30_000, windowsHide: true },
  );
  assert.equal(
    migration.status,
    0,
    `Local index migration failed: ${migration.stderr?.toString() ?? ""}`,
  );
  check("unique audit result indexes migrate safely", true);

  await assertPortAvailable();
  const web = start(
    "web",
    path.join(root, "node_modules/next/dist/bin/next"),
    ["start", "-p", String(port)],
    path.join(root, "apps/web"),
  );
  await waitForServer(web);
  start("worker", path.join(root, "apps/worker/dist/index.js"), [], root);
  const anonymous = new Session();

  check("landing page renders", (await anonymous.request("/")).status === 200);
  check(
    "public audit page renders",
    (await anonymous.request("/audit")).status === 200,
  );
  const unauthenticatedDashboard = await anonymous.request("/dashboard");
  check(
    "dashboard redirects unauthenticated visitor",
    unauthenticatedDashboard.status === 307,
  );
  check(
    "invalid public URL is rejected",
    (
      await anonymous.json("/api/public-audits", {
        url: "not a URL",
        company: "",
      })
    ).status === 400,
  );
  check(
    "localhost public URL is rejected",
    (
      await anonymous.json("/api/public-audits", {
        url: "http://localhost:3000/",
        company: "",
      })
    ).status === 400,
  );
  check(
    "private IP public URL is rejected",
    (
      await anonymous.json("/api/public-audits", {
        url: "http://10.0.0.1/",
        company: "",
      })
    ).status === 400,
  );

  const publicAudit = await anonymous.json("/api/public-audits", {
    url: "https://example.com/",
    company: "",
  });
  assert.equal(publicAudit.status, 202, "public audit creation");
  const publicData = (await publicAudit.json()).data;
  check(
    "public audit is queued with a private result token",
    Boolean(publicData.token),
  );
  check(
    "public PDF requires login",
    (await anonymous.json(`/api/public-audits/${publicData.token}/pdf`, {}))
      .status === 401,
  );

  const registration = await anonymous.json("/api/auth/register", {
    name: "System Test",
    email,
    password,
    confirmPassword: password,
  });
  assert.equal(registration.status, 201, "registration");
  const account = (await registration.json()).data;
  check(
    "registration creates user and workspace",
    Boolean(account.userId && account.workspaceId),
  );
  const signInResult = await anonymous.signIn(email, password);
  check("credentials login succeeds", !signInResult.error);
  check(
    "regular account reaches its profile",
    (await anonymous.request("/profile")).status === 200,
  );
  const regularDashboard = await anonymous.request("/dashboard");
  const regularDashboardHtml = await regularDashboard.text();
  check(
    "regular dashboard entry redirects to profile",
    (regularDashboard.status === 307 &&
      new URL(regularDashboard.headers.get("location"), origin).pathname ===
        "/profile") ||
      (regularDashboard.status === 200 &&
        regularDashboardHtml.includes("/profile") &&
        !regularDashboardHtml.includes("Workspace analytics")),
  );
  check(
    "unknown public PDF token is rejected after login",
    (await anonymous.json(`/api/public-audits/${"a".repeat(43)}/pdf`, {}))
      .status === 404,
  );
  const signedInPublicAudit = await anonymous.json("/api/public-audits", {
    url: "https://example.com/",
    company: "",
  });
  check(
    "signed-in URL submission queues a real audit",
    signedInPublicAudit.status === 202,
  );
  check(
    "signed-in public audit counts against account plan",
    (await getWorkspaceEntitlementContext(account.workspaceId)).usage
      .monthlyAudits === 1,
  );
  const freeUsage = await getWorkspaceEntitlementContext(account.workspaceId);
  const fillFreeAuditLimit = await reserveWorkspaceUsage({
    workspaceId: account.workspaceId,
    metric: "AUDITS",
    period: {
      start: freeUsage.usage.periodStart,
      end: freeUsage.usage.periodEnd,
    },
    quantity: 2,
    limit: freeUsage.entitlements.limits.monthlyAudits,
    baselineQuantity: freeUsage.usage.monthlyAudits,
  });
  assert.equal(fillFreeAuditLimit.allowed, true);
  const limitedAudit = await anonymous.json("/api/public-audits", {
    url: "https://example.com/",
    company: "",
  });
  check(
    "free account cannot exceed its monthly audit allowance",
    limitedAudit.status === 403 &&
      (await limitedAudit.json()).code === "MONTHLY_AUDIT_LIMIT_REACHED",
  );

  const second = new Session();
  const secondEmail = `other-${suffix}@example.test`;
  const secondRegistration = await second.json("/api/auth/register", {
    name: "Other User",
    email: secondEmail,
    password,
    confirmPassword: password,
  });
  assert.equal(secondRegistration.status, 201, "second registration");
  await second.signIn(secondEmail, password);
  const emptyWebsites = await second.request("/api/websites");
  assert.equal(emptyWebsites.status, 200);
  check(
    "new workspace has a real empty state",
    (await emptyWebsites.json()).data.length === 0,
  );
  check(
    "empty account profile renders",
    (await second.request("/profile")).status === 200,
  );

  const websiteResponse = await anonymous.json("/api/websites", {
    name: "Example",
    url: "https://example.com/",
  });
  assert.equal(websiteResponse.status, 201, "website creation");
  const website = (await websiteResponse.json()).data;
  check("website is workspace-scoped", Boolean(website.id));
  check(
    "workspace isolation hides website",
    (await second.request(`/api/websites/${website.id}`)).status === 404,
  );
  check(
    "free website limit enforced",
    (
      await anonymous.json("/api/websites", {
        name: "Second",
        url: "https://iana.org/",
      })
    ).status === 403,
  );

  const plan = await PlanModel.create({ slug: "pro", name: "Pro System Test" });
  await SubscriptionModel.create({
    workspaceId: account.workspaceId,
    planId: plan._id,
    status: "ACTIVE",
  });
  check("test workspace upgraded to PRO in isolated database", true);
  check(
    "duplicate website is rejected",
    (
      await anonymous.json("/api/websites", {
        name: "Duplicate",
        url: "example.com",
      })
    ).status === 409,
  );

  const settings = {
    maximumPages: 1,
    maximumDepth: 0,
    respectRobotsTxt: true,
    checkExternalLinks: false,
    javascriptRendering: false,
    performanceAnalysis: true,
    accessibilityAnalysis: true,
    securityAnalysis: true,
    mobileAnalysis: true,
  };
  const createAudit = async () => {
    const response = await anonymous.json("/api/audits", {
      websiteId: website.id,
      preset: "QUICK",
      settings,
    });
    assert.equal(response.status, 202, "audit creation");
    return (await response.json()).data.auditId;
  };
  const firstId = await createAudit();
  check("audit enters queue", Boolean(firstId));
  check(
    "other workspace cannot read audit",
    (await second.request(`/api/audits/${firstId}/status`)).status === 404,
  );
  const first = await waitForAudit(anonymous, firstId);
  assert.equal(first.data.status, "COMPLETED", JSON.stringify(first.data));
  check("worker completes first audit", first.data.pagesCrawled > 0);
  check("worker records lifecycle progress", first.states.length >= 2);

  const [audit, pages, findings, scores] = await Promise.all([
    AuditModel.findById(firstId).lean().exec(),
    AuditPageModel.find({ auditId: firstId }).lean().exec(),
    AuditFindingModel.find({ auditId: firstId }).lean().exec(),
    AuditScoreModel.find({ auditId: firstId }).lean().exec(),
  ]);
  check(
    "crawl persists page metadata",
    Boolean(audit && pages.length && pages[0].statusCode),
  );
  check("audit persists deterministic findings", findings.length > 0);
  check("audit persists evaluated category scores", scores.length > 0);
  const duplicateFinding = { ...findings[0] };
  delete duplicateFinding._id;
  await assert.rejects(
    AuditFindingModel.collection.insertOne(duplicateFinding),
    { code: 11000 },
  );
  check("finding identity index prevents duplicates", true);
  const storedMetric = await AuditMetricModel.findOne({ auditId: firstId })
    .lean()
    .exec();
  assert.ok(storedMetric);
  const duplicateMetric = { ...storedMetric };
  delete duplicateMetric._id;
  await assert.rejects(AuditMetricModel.collection.insertOne(duplicateMetric), {
    code: 11000,
  });
  check("metric identity index prevents duplicates", true);
  for (const category of [
    "OVERALL",
    "SEO",
    "TECHNICAL",
    "ACCESSIBILITY",
    "SECURITY",
    "MOBILE",
  ]) {
    check(
      `${category.toLowerCase()} engine stores an evaluated score`,
      scores.some((score) => score.category === category && score.evaluated),
    );
  }
  const performance = scores.find((score) => score.category === "PERFORMANCE");
  check(
    "missing PageSpeed key leaves performance unevaluated",
    performance?.evaluated === false,
  );
  check(
    "optional PageSpeed unavailability is recorded",
    audit.pipelineDiagnostics.some(
      (diagnostic) =>
        diagnostic.engine === "PERFORMANCE" &&
        diagnostic.outcome === "UNAVAILABLE",
    ),
  );
  const publicResult = await getPublicAuditByToken(publicData.token);
  check(
    "free public audit completes within its page cap",
    publicResult?.status === "COMPLETED" && publicResult.pagesCrawled <= 5,
  );
  check(
    "free audit result page renders",
    (await anonymous.request(publicData.resultUrl)).status === 200,
  );
  const publicPdf = await anonymous.json(
    `/api/public-audits/${publicData.token}/pdf`,
    {},
  );
  check(
    "signed-in user downloads PDF from completed public audit",
    publicPdf.status === 200 &&
      Buffer.from(await publicPdf.arrayBuffer())
        .subarray(0, 5)
        .toString() === "%PDF-",
  );
  check(
    "public PDF counts against the account report limit",
    (await getWorkspaceEntitlementContext(account.workspaceId)).usage
      .reportGenerations === 1,
  );
  check(
    "audit report dashboard renders",
    (await anonymous.request(`/dashboard/audits/${firstId}`)).status === 200,
  );
  check(
    "issue explorer renders",
    (await anonymous.request("/dashboard/issues")).status === 200,
  );
  check(
    "page explorer renders",
    (await anonymous.request(`/dashboard/audits/${firstId}/pages`)).status ===
      200,
  );
  const pageId = pages[0]._id.toString();
  check(
    "individual page renders",
    (await anonymous.request(`/dashboard/audits/${firstId}/pages/${pageId}`))
      .status === 200,
  );
  const pdf = await anonymous.json(`/api/audits/${firstId}/reports/pdf`, {});
  assert.equal(pdf.status, 200, "PDF generation");
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  check(
    "PDF download contains a real PDF document",
    pdfBytes.subarray(0, 5).toString() === "%PDF-",
  );

  const secondId = await createAudit();
  const secondAudit = await waitForAudit(anonymous, secondId);
  assert.equal(
    secondAudit.data.status,
    "COMPLETED",
    JSON.stringify(secondAudit.data),
  );
  check("second audit completes", secondAudit.data.pagesCrawled > 0);
  const comparison = await getAuditComparisonForWorkspace({
    workspaceId: account.workspaceId,
    websiteId: website.id,
    auditAId: firstId,
    auditBId: secondId,
  });
  check("second audit can be compared", Boolean(comparison.comparison));
  const history = await listAuditHistoryForWorkspace({
    workspaceId: account.workspaceId,
    filters: { websiteId: website.id, page: 1, pageSize: 10 },
  });
  check(
    "history trend uses both persisted audits",
    history.trend.points.length === 2,
  );
  check(
    "history computes real score change",
    history.items.some(
      (item) => item.id === secondId && item.overallScoreChange !== null,
    ),
  );
  const client = await ClientModel.create({
    workspaceId: account.workspaceId,
    name: "System Test Client",
    companyName: "System Test Client",
    normalizedCompanyName: "system test client",
  });
  const clientId = client._id.toString();
  const attachOutcome = await replaceClientWebsitesForWorkspace({
    workspaceId: account.workspaceId,
    clientId,
    websiteIds: [website.id],
  });
  const attachedReport = await ReportModel.findOne({ auditId: firstId })
    .select({ clientId: 1 })
    .lean()
    .exec();
  check(
    "attaching a website links its report to the client",
    attachOutcome === "updated" &&
      attachedReport?.clientId?.toString() === clientId,
  );
  const detachOutcome = await replaceClientWebsitesForWorkspace({
    workspaceId: account.workspaceId,
    clientId,
    websiteIds: [],
  });
  const detachedReport = await ReportModel.findOne({ auditId: firstId })
    .select({ clientId: 1 })
    .lean()
    .exec();
  check(
    "detaching a website clears stale client report metadata",
    detachOutcome === "updated" && !detachedReport?.clientId,
  );
  check(
    "comparison page renders",
    (
      await anonymous.request(
        `/dashboard/compare?website=${website.id}&auditA=${firstId}&auditB=${secondId}`,
      )
    ).status === 200,
  );
  check(
    "history page renders",
    (await anonymous.request("/dashboard/audits")).status === 200,
  );

  const brokenResponse = await anonymous.json("/api/websites", {
    name: "Broken",
    url: "https://unresolvable.invalid/",
  });
  assert.equal(brokenResponse.status, 201, "broken website registration");
  const brokenWebsite = (await brokenResponse.json()).data;
  const brokenAuditResponse = await anonymous.json("/api/audits", {
    websiteId: brokenWebsite.id,
    preset: "QUICK",
    settings,
  });
  assert.equal(brokenAuditResponse.status, 202, "broken website audit queued");
  const brokenId = (await brokenAuditResponse.json()).data.auditId;
  const brokenAudit = await waitForAudit(anonymous, brokenId);
  check(
    "worker failure becomes FAILED with safe reason",
    brokenAudit.data.status === "FAILED" &&
      Boolean(brokenAudit.data.failureReason),
  );
  check(
    "PDF refuses failed audit",
    (await anonymous.json(`/api/audits/${brokenId}/reports/pdf`, {})).status ===
      409,
  );
  check(
    "invalid session cannot read audit",
    (await new Session().request(`/api/audits/${firstId}/status`)).status ===
      401,
  );

  const unavailableDatabase = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'const {connectToDatabase}=await import("@website-audit/database");try{await connectToDatabase();process.exit(1)}catch(error){process.exit(error.name==="MongooseServerSelectionError"?0:2)}',
    ],
    {
      cwd: root,
      env: {
        ...childEnv,
        MONGODB_URI: "mongodb://127.0.0.1:27018/system_test_unavailable",
      },
      timeout: 12_000,
      windowsHide: true,
    },
  );
  check(
    "database dependency failure is surfaced",
    unavailableDatabase.status === 0,
  );

  process.stdout.write(
    `System check completed. Isolated test database retained: ${databaseName}\n`,
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(`FAIL ${error?.stack ?? error}\n`);
  process.stderr.write(
    `Recent process output:\n${logs.slice(-10).join("").slice(-4000)}\n`,
  );
  process.exitCode = 1;
} finally {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  if (disconnectDatabase) await disconnectDatabase();
}
