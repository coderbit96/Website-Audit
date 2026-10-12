# SiteSignal — Website Audit SaaS

SiteSignal has a Next.js web app, a separate audit worker, and shared npm-workspace packages. Both apps use MongoDB. The worker uses a database-backed job queue; this repository does **not** use PostgreSQL, Redis, Prisma, or Docker Compose. Run the commands below from the repository root. Examples use Windows PowerShell.

## Visitor and account flow

Open `/audit`, enter a public website URL, and wait for a real score from a limited five-page audit. No login is needed to see the result. PDF download requires registration or login; signing in returns to the same audit result. Regular users land on `/profile`, not a dashboard. The full `/admin` panel is reserved for Super Admin. Existing workspace tools remain available at their prior URLs so stored websites, audits, and reports are not lost.

The profile and pricing page show INR prices: Free (₹0), Pro (₹999), and For Agency (₹2,999). A paid purchase covers one month and **does not renew automatically**. Account audit limits are 3, 50, and 250 per period respectively; PDF limits are 3, 100, and 500. A signed-in audit started from the public URL form counts against its account audit limit. Anonymous snapshots have separate anti-abuse limits. Razorpay checkout appears on the signed-in profile only after real gateway credentials are configured. Plans change only after a captured payment is verified server-side.

## Requirements

- Node.js 22.12.0 or newer and npm 10 or newer.
- A reachable MongoDB instance, installed locally or hosted. Use a development database, not production data.
- Git if you need to clone the project.
- Chromium for browser-based audit checks (install it below).

## Node.js requirement

The repository's `.nvmrc` specifies Node.js 22.12.0. Check your versions:

```powershell
node --version
npm --version
```

Install Node.js 22 if your version is older than 22.12.0. Use npm consistently; do not mix package managers.

## Docker requirement

Docker is **not required**. This repository has no Docker Compose file, so `docker compose up -d` is not a setup command for this project.

## Installation

If the project is already open on this computer, go to its root:

```powershell
Set-Location D:\Example.com
```

On another computer, clone using the real URL supplied by your Git host, then enter the cloned directory. This checkout has no configured Git remote, so a working `git clone` URL cannot be supplied here. Continue with the following sections in order.

## Environment setup

Copy the template **only if `.env` does not already exist**:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `.env`:

- Set `MONGODB_URI` to your local or hosted **development** MongoDB database. The template points to `mongodb://127.0.0.1:27017/website_audit`.
- Replace the `AUTH_SECRET` placeholder with a random secret. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and paste the output into `.env`.
- Keep `AUTH_URL` and `NEXT_PUBLIC_APP_URL` at `http://localhost:3000` when using the default port.

`GOOGLE_PAGESPEED_API_KEY` is optional; without a valid key, PageSpeed analysis may be unavailable while the rest of an audit continues. For local development, the blank `PUBLIC_AUDIT_HASH_SECRET` and `RATE_LIMIT_HASH_SECRET` values fall back to `AUTH_SECRET`; use distinct secrets in production. Keep the proxy trust flags `false` unless a trusted reverse proxy is configured. Keep `DEVELOPMENT_SEED_ENABLED=false` in the file.

Razorpay is optional until you are ready to take payments. Add your own `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` together. Start with **test-mode** keys from your Razorpay account. Never invent keys or put the key secret in browser variables. Set a `payment.captured` webhook to `https://YOUR_DOMAIN/api/payments/webhook` using the same webhook secret; Razorpay cannot deliver webhooks directly to `localhost`. Configure automatic capture in Razorpay. Test a complete payment and webhook before switching to live keys. If these variables are blank, checkout remains unavailable and no plan is changed.

Refunds and chargebacks are not automated in this release. If you issue one in Razorpay, reconcile the affected workspace's paid access manually. Review `/admin/payments` for the original order. Do not treat a refund in Razorpay as an automatic subscription cancellation in SiteSignal.

Never commit `.env` or share its passwords, tokens, or API keys. It is ignored by Git. This project uses `MONGODB_URI`, **not** `DATABASE_URL` or `REDIS_URL`.

## Starting PostgreSQL + Redis

**Not applicable.** Do not start PostgreSQL or Redis for SiteSignal. Start your locally installed MongoDB service using your operating system's service manager, or set `MONGODB_URI` to a reachable hosted development database. After installing dependencies, check connectivity:

```powershell
npm run database:check
```

If this fails, fix the MongoDB service, connection string, credentials, or hosted-provider IP allowlist before continuing.

## Installing dependencies

From the repository root:

```powershell
npm install
npm run browser:install
```

The second command installs Playwright Chromium, usually once per machine. `npm install` also links the workspace packages.

## Database migration

This MongoDB project has no Prisma generation or SQL migrations. Mongoose models and explicit index scripts define its structure. MongoDB creates a database when data is first written. Run these in order for a new or existing development database:

```powershell
npm run database:check
npm run db:integrity:check
npm run db:migrate:integrity
npm run db:indexes
npm run db:plans:sync
npm run db:review:indexes
```

The index step also creates unique Razorpay order and payment identifiers. `db:plans:sync` creates missing Free, Pro, and Agency catalog records without overwriting existing ones. Run both before enabling checkout; neither resets existing data.

The integrity check and index review are read-only. The integrity migration adds uniqueness indexes, and `db:indexes` creates model-declared indexes; neither resets or deletes the database. If duplicate records prevent index creation, **stop and review them** rather than resetting the database. The scripts are repeatable.

## Database seed

Seeding is optional and **development-only**. It creates repeatable sample users, workspaces, websites, audits, findings, reports, and notifications. It does not create, change, promote, or reset the existing Super Admin. Keep the seed switch disabled in `.env`; enable it only in the PowerShell session running the command:

```powershell
$env:DEVELOPMENT_SEED_ENABLED="true"
npm run db:seed:dev
Remove-Item Env:DEVELOPMENT_SEED_ENABLED
```

The command refuses to seed when `NODE_ENV=production`. Use only a development MongoDB database. The seed fixture defines these **local-development-only** logins:

| Plan   | Email                          | Password            |
| ------ | ------------------------------ | ------------------- |
| Free   | `free.demo@sitesignal.local`   | `DemoFree@123456`   |
| Pro    | `pro.demo@sitesignal.local`    | `DemoPro@123456`    |
| Agency | `agency.demo@sitesignal.local` | `DemoAgency@123456` |

Do not use these accounts or passwords for real users. The seed does not alter the Super Admin account.

## Starting Web App

The simplest development command starts **both** the web app and worker:

```powershell
npm run dev
```

Open <http://localhost:3000>. To run only the web app:

```powershell
npm run dev:web
```

Audit jobs require the worker too. If port 3000 is occupied, stop the old web process before starting another copy. Next.js may fall back to port 3001, which will not match the template's app URLs.

## Starting Worker

`npm run dev` already starts the worker. If you started the web app separately, open another terminal in the repository root:

```powershell
npm run dev:worker
```

Web and worker must use the same `MONGODB_URI`. Without the worker, submitted audits remain queued.

## Running Tests

Run repository-wide checks from the root:

```powershell
npm run lint
npm run typecheck
npm run test
```

An additional end-to-end system test is available:

```powershell
npm run build
npm run test:system
```

`test:system` requires local MongoDB at `127.0.0.1:27017`, installed Playwright Chromium, and free port 3107. It starts temporary web and worker processes and uses its own uniquely named local test database, **not** the URI in `.env`. It does not automatically drop that database. It cannot run against hosted MongoDB alone.

## Building Production

Build all workspaces:

```powershell
npm run build
```

For deployment, provide real production environment variables and reachable MongoDB, apply the database index steps above, and run the built web and worker processes separately:

```powershell
npm run start --workspace @website-audit/web
```

```powershell
npm run start --workspace @website-audit/worker
```

Use a process manager or hosting platform to keep both running. Do not run the development seed in production.

The worker opens untrusted websites in Chromium for limited accessibility and mobile checks. In production, run it under a restricted OS account or isolated host with network egress rules that deny private, loopback, link-local, and metadata addresses. Application-level URL checks are defense in depth, not a replacement for a network boundary. This repository does not provide that deployment isolation or a process manager.

## Troubleshooting

- **MongoDB connection refused or timed out:** run `npm run database:check`. Check the service and `MONGODB_URI`; for hosted MongoDB, check credentials and network/IP access rules.
- **Login fails or the secret is missing:** replace the `AUTH_SECRET` placeholder with a generated secret, then restart the web app. Never put secrets in browser-side variables.
- **Port 3000 already in use:** close the earlier Next.js server. Avoid two web servers from the same checkout. If you intentionally change ports, update both app URLs in `.env` and restart.
- **Audits stay queued:** start `npm run dev:worker` (or use `npm run dev`) and confirm both apps use the same MongoDB database.
- **Chromium/Playwright missing:** run `npm run browser:install`.
- **PageSpeed results unavailable:** the API key is optional. If you add or change it in `.env`, restart the worker; unavailable results must not become fabricated scores.
- **Index command reports duplicates:** stop and review the affected data; do not reset the database.
- **`test:system` fails with a database or port error:** it needs local MongoDB and free port 3107, even if the normal app uses hosted MongoDB.

Keep full terminal output when asking for help, but redact secrets and connection-string passwords first.
