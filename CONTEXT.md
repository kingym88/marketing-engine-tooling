# Wakiru Marketing Ecosystem — Cross-Repo Context

> Generated 2026-05-19. Audience: an engineer who has never seen these four
> repos and needs a precise mental model before they touch any of them.
>
> Scope: the four repos that live side by side under
> `/Users/kingmurekio/Documents/`:
>
> 1. `wakiru-coffee` — e-commerce Next.js site, also hosts the admin
>    marketing console.
> 2. `wakiru-marketing-engine` — the AI agent runtime (Vertex AI + Buffer
>    + Serper) that produces, schedules, and reconciles social content.
> 3. `wakiru-marketing-engine-db` — the Prisma schema package shared by
>    the engine and the coffee site for the marketing PostgreSQL DB.
> 4. `marketing-engine-tooling` — a shared `check-tooling` linter (Node
>    version / package manager / lockfile / dep-spec rules) consumed by
>    the other three repos as a dev dependency.

---

## 1. System overview

The product is a coffee D2C brand (`wakirucoffee.com`) plus an
in-house **agentic marketing system** that fully drafts, schedules,
publishes, reconciles, and analyses social posts for Instagram /
TikTok / X / Facebook.

The split between the four repos is not domain-driven; it is
**runtime-driven**:

| Repo | Runtime | Database | Public surface |
|------|---------|----------|----------------|
| `wakiru-coffee` | Next.js (Vercel-style, currently Railway) | `prisma` → e-commerce DB **+** `marketingPrisma` → marketing DB | Public storefront, `/account/*`, `/admin/marketing/*` console, social platform webhooks |
| `wakiru-marketing-engine` | Headless Node services on Railway (one cron-style service per agent + one always-on `scheduler-agent` HTTP service) | `prisma` → marketing DB only | Internal HTTP trigger endpoints (`/trigger/calendar`, `/trigger/schedule-one`, etc.) protected by `CALENDAR_TRIGGER_SECRET` |
| `wakiru-marketing-engine-db` | npm package — no runtime of its own | Owns Prisma schema + migrations for the marketing DB | Exports `prisma` singleton, `PrismaClient`, all generated marketing model types |
| `marketing-engine-tooling` | CLI invoked via `pnpm exec check-tooling` | None | Exports `runChecks(repoRoot)` API + `bin/check-tooling.ts` |

The same Postgres marketing database is reached from **two** runtimes
(Next.js admin + Railway agents) via **one** Prisma client (the
generated client shipped inside `@kingym88/marketing-engine-db`). That
shared schema package is what keeps both sides in lockstep — and it is
the reason every consumer pins it with an exact version (no `^`, no
`~`), enforced by the `engineDbExactPin` rule in tooling.

The engine runs entirely on Google Cloud / Vertex AI (Gemini 2.5
Flash for text, Gemini 3.1 Flash Image Preview for stills, Veo 3.1 Fast
for video) and on third-party social plumbing: **Buffer** for scheduling
posts on IG/TT/X/FB, **Serper** for Google search trend data, and
**Meta / TikTok / X webhooks** for ingesting community interactions.

---

## 2. Data and control flow

### 2.1 ASCII overview

```
                ┌────────────────────────────────────────────────────────────┐
                │                  Marketing PostgreSQL DB                   │
                │  Schema: "marketing" (Prisma schema lives in engine-db)    │
                │                                                            │
                │  BrandConfig · TrendReport · MarketingCampaign            │
                │  ContentAsset · ContentAssetSchedule · Analytics          │
                │  AgentRunLog · CreditUsage · SocialInteraction            │
                │  TrendSignal · MarketingTrend · MarketingCreative         │
                └─────▲────────────────────────────────────────▲─────────────┘
                      │                                        │
       @kingym88/marketing-engine-db (Prisma client + types)   │
                      │                                        │
        ┌─────────────┴─────────────┐         ┌────────────────┴────────────────┐
        │                           │         │                                 │
        │   wakiru-coffee           │         │   wakiru-marketing-engine       │
        │   (Next.js, Railway)      │         │   (Node, Railway, multi-svc)    │
        │                           │         │                                 │
        │  ┌─────────────────────┐  │  HTTPS  │  ┌───────────────────────────┐  │
        │  │ /admin/marketing/*  │──┼─────────┼──▶  POST /trigger/calendar   │  │
        │  │  (Engine tab,       │  │  Bearer │  │       /trigger/schedule-one│  │
        │  │   Calendar, Assets) │  │  secret │  │       /trigger/retry-     │  │
        │  └─────────────────────┘  │         │  │            schedule        │  │
        │  ┌─────────────────────┐  │         │  │       /trigger/recall-    │  │
        │  │ /api/webhooks/social│  │         │  │            schedule        │  │
        │  │   /meta /tiktok /x  │──┼─writes──┼──┴───────────────────────────┘  │
        │  └─────────────────────┘  │ Social- │                                 │
        │  ┌─────────────────────┐  │ Inter-  │  ┌───────────────────────────┐  │
        │  │ /api/admin/brand-   │  │ action  │  │  Scheduler (node-cron)    │  │
        │  │   config            │  │         │  │   daily-refresh, content- │  │
        │  └─────────────────────┘  │         │  │   generation, analytics-  │  │
        │            │              │         │  │   sync, community-check,  │  │
        │            ▼              │         │  │   buffer-sweep            │  │
        │   E-commerce Prisma DB    │         │  └──────────┬────────────────┘  │
        │   (User / Order /         │         │             │                   │
        │    Product / Subscription)│         │  ┌──────────▼────────────────┐  │
        └───────────────────────────┘         │  │  Agents (8):              │  │
                                              │  │   trendIntel, image,      │  │
                                              │  │   video, copy, calendar,  │  │
                                              │  │   campaignPlanning,       │  │
                                              │  │   analytics, community,   │  │
                                              │  │   bufferStatusSweep       │  │
                                              │  └──────────┬────────────────┘  │
                                              │             │                   │
                                              └─────────────┼───────────────────┘
                                                            │
                       ┌────────────────────────────────────┼───────────────────┐
                       ▼                                    ▼                   ▼
            ┌────────────────────┐               ┌────────────────────┐  ┌──────────────┐
            │  Vertex AI         │               │  Buffer API        │  │  Serper      │
            │  - Gemini 2.5 Fl.  │               │  bufferapp.com/1   │  │  google.serp │
            │  - Gemini 3.1 Img  │               │  profiles.json /   │  │  er.dev      │
            │  - Veo 3.1 Fast    │               │  updates/create    │  │              │
            └─────────┬──────────┘               └────────────────────┘  └──────────────┘
                      │
            ┌─────────▼──────────┐
            │  Google Cloud      │
            │  Storage (GCS)     │
            │  - generated media │
            │  - brand-assets/   │
            │  - chain-videos/   │
            └────────────────────┘
```

### 2.2 Lifecycle of one social post (end-to-end)

This is the easiest way to understand who calls whom:

1. **`trendIntel` agent** (Railway cron, default 06:00 UTC daily):
   - Reads active `BrandConfig` via `loadBrandContext()` (engine repo).
   - Calls `searchTrends()` → Serper Google Search.
   - Calls Gemini 2.5 Flash to map trends to brand angles.
   - Writes `TrendReport` rows (`used=false`) tagged with `agentRunId`.
   - Logs to `AgentRunLog`; charges `CreditUsage` (gemini tokens).
2. **`campaignPlanning`** (daily-refresh pipeline, second stage):
   - Reads `BrandConfig` + `loadCompetitors()`, calls Gemini.
   - Writes `MarketingCampaign` rows with brief / KPIs / dates.
3. **`imageContent` / `videoContent`** (content-generation pipeline,
   Mon/Wed/Fri 08:00 UTC):
   - Pull pending `TrendReport`s, generate concept JSON via Gemini, then
     generate the actual asset via Gemini 3.1 Flash Image Preview
     (stills) or Veo 3.1 Fast (video). Uploads to GCS under
     `chain-videos/…`, `images/…`, etc.
   - Inserts `ContentAsset` rows with `status="draft"`, the GCS URI, a
     CDN URL, and `agentRunId`.
   - Marks the source `TrendReport.used=true` and `referenceUsed`
     accordingly.
4. **`copyCaption`** (same pipeline, after image/video):
   - Pulls assets that need captions, generates per-platform variants
     (short/standard/story) via Gemini, writes into
     `ContentAsset.captionVariants`.
5. **Human review** in `wakiru-coffee`'s admin:
   - `/admin/marketing/assets` lists drafts (`marketingPrisma.contentAsset`
     reads).
   - Admin clicks Approve → `updateAssetStatus(id, "approved")` server
     action sets `status="approved"`, `approvedAt`, `approvedBy`.
6. **Two scheduling paths converge on the engine's HTTP trigger**:
   - **a) Drag-and-drop on `/admin/marketing/calendar`** → Next.js
     server action `scheduleAssetForDay()` → `POST {engine}/trigger/schedule-one`
     with `{ assetId, platform, scheduledAt }`. Engine upserts
     `ContentAssetSchedule` rows, calls Buffer
     `POST /updates/create.json`, stores `externalId`, flips
     `ContentAsset.status` to `"scheduled"`.
   - **b) Bulk via `socialCalendar` agent** → `POST {engine}/trigger/calendar`
     (manual button on `/admin/marketing/engine` page) **or** the engine's
     own cron. The agent reads approved assets, calls Gemini to plan a
     week, then calls `publishPost()` per row, writing
     `ContentAssetSchedule` and `externalId` the same way.
7. **`bufferStatusSweep` agent** (every hour):
   - Reconciles `ContentAssetSchedule` rows by polling Buffer
     `GET /updates/{id}.json`. Pending rows older than 5 min get
     promoted/failed based on Buffer state; scheduled rows past
     `scheduledAt + 15 min` flip to `published` or `failed`.
8. **`analytics` agent** (daily 02:00 UTC):
   - For each schedule row with an `externalId`, calls
     `fetchPlatformMetrics()` (currently simulated; will call Meta /
     TikTok / X APIs). Writes `Analytics` rows + `TrendSignal` summaries.
9. **Community side-channel** (continuous):
   - Public social-platform webhooks land on `wakiru-coffee`:
     `POST /api/webhooks/social/{meta,tiktok,x}`. They HMAC-verify the
     payload and INSERT `SocialInteraction` rows with `status="new"`
     directly via `marketingPrisma`.
   - `community` agent (every 4 hours) reads `status="new"`,
     classifies sentiment / UGC / influencer, generates reply drafts via
     Gemini, writes `replyDrafts` JSON, flips to `pending-review`.
   - Admin in `/admin/marketing/community` reviews drafts, picks one,
     and flips status to `replied` via `updateInteractionStatus`.

### 2.3 The unusual edges

- **Two Prisma clients in `wakiru-coffee`.** `prisma` (`@/lib/prisma`)
  hits the e-commerce DB; `marketingPrisma` (`@/lib/marketingDb`) hits
  the marketing DB. They are separate `PrismaClient` instances over
  separate connection strings (`DATABASE_URL` vs
  `MARKETING_DATABASE_URL`). Failing to wire `marketingPrisma` through
  `@kingym88/marketing-engine-db` would silently use the e-commerce DB
  schema — the published package is what guarantees both sides see the
  same models.
- **`next.config.ts` MUST mark the engine-db package as external.**
  Without `serverExternalPackages: ["@kingym88/marketing-engine-db",
  "@prisma/client"]`, Next.js's bundler cannot resolve the Prisma engine
  binary at runtime. (Captured in user memory and as a known foot-gun.)
- **Brand context is duplicated, not shared.** Both repos have
  `lib/brandContext.ts` with their own `generateBrandContextMd()`.
  Engine reads `BrandConfig` directly from DB at agent run time; the
  coffee admin reads/writes `BrandConfig` via
  `marketingPrisma.brandConfig` from `/api/admin/brand-config`. These
  two implementations have drifted slightly (the engine version omits
  the Competitors / Logo White / Logo Mark / Brand Pattern sections).
- **`process.env.DRY_RUN` is treated as scoped state.** The engine's
  orchestrator mutates `process.env.DRY_RUN` for the duration of a
  pipeline so that deep-nested `publishPost()` calls see the flag. The
  engine's `env.ts` uses a `Proxy` that re-reads `process.env` on every
  access specifically to support this.

---

## 3. Per-repo deep dive

### 3.1 `wakiru-coffee`

**Role.** Public-facing Next.js 16 storefront *and* the operator console
for the marketing engine. The "front of house" for both buyers and
admins. It is the only place a human ever logs in. Everything in
`/src/app/admin/marketing/*` is the engine's UI — the engine itself is
headless.

**Stack.** Next.js 16 App Router + React 19 + Tailwind 4, NextAuth v5
(Credentials provider, `bcryptjs`), Stripe v20 (`/api/webhooks/stripe`,
`/api/create-payment-intent`, `/api/subscriptions/*`), Resend for
transactional email, React-Email templates in `src/emails/`,
`@google-cloud/storage` for asset thumbnails, `prisma` v6 for the
e-commerce DB.

**Key modules.**

| Path | Purpose |
|------|---------|
| `src/app/page.tsx`, `src/app/shop/*`, `src/app/cart/*`, `src/app/checkout/*` | Public storefront (orthogonal to the engine) |
| `src/auth.ts`, `src/middleware.ts` | NextAuth v5 + admin gate (`role === "ADMIN"`) |
| `src/app/admin/marketing/layout.tsx` | The 7-tab nav: Brand Kit, Assets, Analytics, Calendar, Campaigns, Community, Engine |
| `src/app/admin/marketing/brand-kit/*` | CRUD for `BrandConfig`. Talks to `/api/admin/brand-config` (POST validates with `BrandConfigInputSchema`, returns signed URLs for visual assets via `signVisualAssets()`) |
| `src/app/admin/marketing/assets/*` | List/edit `ContentAsset`. Server actions wrap `marketingPrisma` writes **and** call the engine trigger for retry/recall/reschedule/scheduleOne |
| `src/app/admin/marketing/calendar/*` | Month grid + drag-drop. `actions.ts::scheduleAssetForDay` → engine `POST /trigger/schedule-one` |
| `src/app/admin/marketing/campaigns/*` | Pure `marketingPrisma` CRUD; never touches the engine |
| `src/app/admin/marketing/community/*` | Reads `SocialInteraction`; admin flips status; never calls engine |
| `src/app/admin/marketing/engine/*` | "Run calendar agent" button + `AgentRunLog` table + `CreditUsage` summary + recent `TrendSignal`s. Pure read except for the trigger button |
| `src/app/api/webhooks/social/{meta,tiktok,x}/route.ts` | Public webhook receivers for the three platforms. HMAC-verify, then INSERT `SocialInteraction` rows |
| `src/app/api/admin/brand-config/route.ts` (+ `upload-asset/`) | The only mutation path for `BrandConfig`; also signs visual asset URLs |
| `src/lib/marketingDb.ts` | `marketingPrisma` singleton via `MARKETING_DATABASE_URL` |
| `src/lib/brandContext.ts` | `generateBrandContextMd()` (markdown rendering); plus a legacy `syncBrandContextFile()` that now just validates the DB row |
| `src/lib/brandConfigSchema.ts` | Zod schema for POST validation (mirrors `BrandConfig` writable fields) |
| `src/lib/engineTrigger.ts` | Resolves `ENGINE_TRIGGER_BASE_URL` (with deprecated `CALENDAR_AGENT_TRIGGER_URL` fallback) and `CALENDAR_TRIGGER_SECRET` |
| `src/lib/platforms.ts`, `src/lib/socialInteractionStatus.ts` | **Duplicated** from engine — same constants in both repos |
| `src/lib/gcs.ts`, `src/lib/gcpCredentials.ts` | GCS signing + service-account JSON loader. `gcpCredentials.ts` is **byte-for-byte identical** to the engine's |

**External services it calls.** Stripe (checkout / webhooks /
subscriptions), Resend (transactional email), GCS (sign URLs for brand
assets and asset thumbnails), Buffer (`profiles.json` only — read-only,
on the Brand Kit Social tab), the marketing engine's HTTP trigger
endpoints. It also receives webhooks from Stripe, Meta, TikTok, X.

**Inbound dependencies.** None — it sits at the top of the dependency
DAG. Other repos do not import from `wakiru-coffee`.

**Integration points with the other three repos:**

- **→ `@kingym88/marketing-engine-db`** (runtime dep): all marketing DB
  reads/writes flow through this package's `PrismaClient` + generated
  types.
- **→ `wakiru-marketing-engine`** (runtime IPC, no code dep): outbound
  HTTPS calls to `{engine}/trigger/calendar`, `/trigger/schedule-one`,
  `/trigger/retry-schedule`, `/trigger/recall-schedule`,
  `/trigger/reschedule-schedule`, each with
  `Authorization: Bearer ${CALENDAR_TRIGGER_SECRET}`.
- **→ `@kingym88/marketing-engine-tooling`** (devDep): `pnpm exec
  check-tooling` runs in CI.

---

### 3.2 `wakiru-marketing-engine`

**Role.** Headless Node runtime that owns every AI agent and the
Buffer-side of social publishing. It does not render UI; it does not
expose a public API to end users. Its only external surface is **four
internal POST endpoints behind a Bearer secret**, plus its scheduled
cron pipelines.

**Stack.** Pure Node `>=22`, ESM, `tsx` for run-time TypeScript, no
bundler. Vertex AI SDKs (`@google-cloud/vertexai`, `@google/genai`),
`@google-cloud/storage`, `node-cron`, `@modelcontextprotocol/sdk`,
`zod`, `@anthropic-ai/sdk` (declared but currently unused in the source
I reviewed — everything goes through Vertex/Gemini), `bullmq` + Upstash
Redis (declared but the queue worker itself is not in the active
pipeline path I saw).

**Deployment topology.** One Railway service **per agent** plus one
always-on **scheduler-agent**. Configs in `deploy/railway/*.json`:

| Service | Start command | Cron |
|---------|---------------|------|
| `trend-agent` | `pnpm run agent:trend` | `0 */6 * * *` |
| `image-agent` | `pnpm run agent:image` | (cron via scheduler) |
| `video-agent` | `pnpm run agent:video` | (cron via scheduler) |
| `copy-agent` | `pnpm run agent:copy` | (cron via scheduler) |
| `calendar-agent` | `pnpm run agent:calendar` | (cron via scheduler) |
| `analytics-agent` | `pnpm run agent:analytics` | `0 7 * * *` |
| `community-agent` | `pnpm run agent:community` | (cron via scheduler) |
| `campaign-agent` | `pnpm run agent:campaign` | `0 10 1 * *` (monthly) |
| `scheduler-agent` | `pnpm run engine:scheduler` | always-on (registers all pipelines + HTTP trigger) |

The `scheduler-agent` is the canonical entrypoint; the per-agent
services are essentially "manual invocation slots" that can also be
triggered ad-hoc.

**Key modules.**

| Path | Purpose |
|------|---------|
| `src/orchestrator/scheduler.ts` | Long-running daemon. Validates cron expressions, runs `probeGcsSignature()` at boot (fails fast on key mismatch), sweeps orphaned `AgentRunLog` rows, does startup catch-up, registers all 5 pipelines on `node-cron`, starts the HTTP trigger server |
| `src/orchestrator/pipeline.ts` | `runPipeline(name, options)` with five pipelines: `daily-refresh`, `content-generation`, `analytics-sync`, `community-check`, `buffer-sweep`. Owns min-interval skip, stale-lock detection, per-stage timeouts, `failSafe` semantics, `AgentRunLog` lifecycle |
| `src/orchestrator/httpTrigger.ts` | Plain Node `http.createServer`. Five POST endpoints + `/health`. **This is the integration contract with the coffee site** |
| `src/orchestrator/sweepOrphans.ts` | Flips stale `running` `AgentRunLog` rows to `failed` at scheduler boot |
| `src/agents/trendIntel.ts` | Trend research; writes `TrendReport`s |
| `src/agents/campaignPlanning.ts` | Writes `MarketingCampaign` rows |
| `src/agents/imageContent.ts` | Reads pending trend reports, generates stills via Gemini 3.1 Flash Image Preview, uploads to GCS, writes `ContentAsset`s |
| `src/agents/videoContent.ts`, `src/agents/videoChainAgent.ts` | Same shape but with Veo 3.1 Fast; the chain agent stitches four 8s segments via ffmpeg |
| `src/agents/copyCaption.ts` | Fills `captionVariants` per platform |
| `src/agents/socialCalendar.ts` | Picks approved assets, plans a week with Gemini, calls Buffer, writes `ContentAssetSchedule` |
| `src/agents/analytics.ts` | Pulls metrics for published rows, writes `Analytics` + `TrendSignal` |
| `src/agents/community.ts` | Reads new `SocialInteraction`s, classifies, drafts replies |
| `src/agents/bufferStatusSweep.ts` | Hourly reconciliation of `ContentAssetSchedule` vs Buffer's authoritative state |
| `src/lib/db.ts` | `import { prisma } from "@kingym88/marketing-engine-db"` |
| `src/lib/env.ts` | Zod-validated env contract; `Proxy`-based getter so `DRY_RUN` mutation works |
| `src/lib/gcpCredentials.ts` | **Byte-for-byte identical** to the coffee version |
| `src/lib/vertex.ts` | `getVertexAI()` singleton |
| `src/lib/brandContext.ts` | `loadBrandContext()`, `loadBrandReferenceAssets()`, `loadCompetitors()` — reads `BrandConfig` from DB |
| `src/lib/agentRun.ts` | `runWithLog()` lifecycle, `AgentRunLog` heartbeat, `runAsCli` helper |
| `src/lib/credits.ts` | `GeminiTokenTracker`, `recordCreditsUsed()`, `MONTHLY_SOFT_CAP` |
| `src/lib/platforms.ts`, `src/lib/socialInteractionStatus.ts` | **Duplicated** from coffee |
| `src/tools/publishPost.ts` | Buffer wrapper: profile lookup with TTL cache, retry-on-5xx, `deleteBufferPost`, DRY_RUN short-circuit |
| `src/tools/generateImage.ts`, `src/tools/generateVideo.ts` | Vertex AI generation, GCS upload |
| `src/tools/searchTrends.ts` | Serper Search API client |
| `src/tools/fetchAnalytics.ts` | Currently simulates metrics; declared API key envs exist for Meta/TikTok/X |
| `src/mcp-server/index.ts` | MCP server exposing each agent as a tool (developer-only stdio interface) |

**External services it calls.** Vertex AI (Gemini text, Gemini Flash
Image, Veo), Google Cloud Storage (uploads + signed read probe at
boot), Buffer (`/profiles.json`, `/updates/create.json`,
`/updates/{id}/destroy.json`, `/updates/{id}.json`), Serper
(`google.serper.dev/search`). Meta / TikTok / X access tokens are read
from env but no live calls are made in the analytics path I reviewed.

**HTTP trigger contract** (auth: `Authorization: Bearer ${CALENDAR_TRIGGER_SECRET}`,
method: `POST`):

| Endpoint | Body | Effect | Reply |
|----------|------|--------|-------|
| `/trigger/calendar` | none | Runs `socialCalendar` once (synchronous) | `{ ok, agentRunLogId, outputSummary, error? }` |
| `/trigger/schedule-one` | `{ assetId, platform, scheduledAt }` | Upserts `ContentAssetSchedule`(s), publishes to Buffer, flips `ContentAsset.status` to `scheduled` if any row succeeded | `{ ok, scheduleId, newStatus, externalId, results[] }` |
| `/trigger/retry-schedule` | `{ scheduleId }` | Re-publishes a `status="failed"` row to Buffer | `{ ok, scheduleId, newStatus, externalId }` |
| `/trigger/recall-schedule` | `{ scheduleId }` | Calls Buffer `destroy` if `externalId` is set, flips row to `"recalled"` | `{ ok, scheduleId, newStatus }` |
| `/trigger/reschedule-schedule` | `{ scheduleId, scheduledAt }` | Destroys at Buffer if live, re-publishes at new time | `{ ok, scheduleId, newStatus, externalId, scheduledAt }` |
| `/health` | none | Health probe | `{ ok: true }` |

**Inbound dependencies.** `wakiru-coffee` calls its HTTP trigger
endpoints. Nothing else imports from this repo (it is not a published
package).

**Integration points with the other three repos:**

- **→ `@kingym88/marketing-engine-db`** (runtime dep, exact pin
  `1.3.2`): single source of truth for marketing DB types and the
  Prisma client.
- **← `wakiru-coffee`** (network): receives 5 POSTs. Sends no calls
  back; the coffee site polls `AgentRunLog` via `marketingPrisma` for
  results.
- **→ `@kingym88/marketing-engine-tooling`** (devDep): tooling check.

---

### 3.3 `wakiru-marketing-engine-db`

**Role.** Contract-shipping package. It owns the canonical Prisma
schema for the marketing database **and** ships a pre-generated Prisma
client. Both the coffee site and the engine consume it from GitHub
Packages.

**Stack.** TypeScript + Prisma 6 + a `tsc` build that copies the
generated Prisma client into `dist/generated/client/` so consumers
don't have to regenerate at install time.

**Key contents.**

| Path | Purpose |
|------|---------|
| `prisma/schema.prisma` | The canonical schema. PostgreSQL provider, `schemas = ["marketing"]`. Defines every marketing model |
| `prisma/migrations/*` | Five named migrations. `migrate:deploy` is run from this repo against the target DB |
| `src/index.ts` | Tiny shim: re-exports `* from "./generated/client"`, creates a singleton `prisma` instance with the standard `globalThis.__wakiruMarketingPrisma` HMR-safe pattern |
| `src/generated/client/*` | The committed Prisma client + native engine binaries for `darwin-arm64`, `linux-musl-openssl-3.0.x`, `debian-openssl-3.0.x`. Shipped pre-built so consumers (especially the Next.js bundle) don't need a postinstall `prisma generate` |
| `Dockerfile`, `railway.json` | Lets Railway run `migrate:deploy` as a one-shot service when the schema changes |
| `.github/workflows/publish.yml` | Publishes to `npm.pkg.github.com` under the `@kingym88` scope |

**Models (with the role each plays in §2.2).**

- `BrandConfig` — one active row at a time. Edited via the coffee
  admin's Brand Kit tab; read by every agent that needs voice/visuals
  context.
- `MarketingTrend`, `MarketingCreative` — early ad-hoc tables; the
  current path uses `TrendReport` + `ContentAsset` instead. Treat as
  legacy.
- `MarketingCampaign` — `campaignPlanning` agent writes; admin edits.
- `TrendReport` — `trendIntel` writes; `imageContent`/`videoContent`
  consume (`used` boolean).
- `ContentAsset` — the central artefact. Status flow: `draft →
  approved → scheduled → published` (or `rejected`). Has
  `captionVariants` JSON keyed by platform.
- `ContentAssetSchedule` — per-platform / per-Buffer-profile fanout of
  one `ContentAsset`. Unique on `(assetId, platform, profileId)`.
  Owns the Buffer `externalId`.
- `Analytics` — per-platform engagement counters from `analytics` agent.
- `AgentRunLog` — every agent run gets a row. Status:
  `running → success | failed`. `heartbeatAt` updated every 30s by
  `runWithLog`. Orphans are swept at scheduler boot.
- `CreditUsage` — monthly cost-attribution rows (`service`,
  `creditsUsed`, `month` key as `YYYY-MM`, `agentRunId`).
- `SocialInteraction` — comments/DMs from webhooks. Status:
  `new → pending-review → replied`.
- `TrendSignal` — small narrative records emitted by `analytics`.

**Inbound dependencies.** Both the engine (runtime dep, version `1.3.2`)
and the coffee site (runtime dep, version `1.3.2`) consume this
package. Tooling enforces the exact-pin via
`engineDbExactPin` rule.

**Outbound dependencies.** Just `@prisma/client` at runtime.

---

### 3.4 `marketing-engine-tooling`

**Role.** Cross-repo linter that enforces "all four repos use the same
Node toolchain conventions." It is **only a dev dependency**; nothing
imports from it at runtime.

**Stack.** TypeScript, no framework. CLI binary `check-tooling` reads a
`package.json` + `.gitignore` from a given repo root and runs ten
rules:

| Rule | Severity | Enforces |
|------|----------|----------|
| `pkgManagerDeclared` | error | `packageManager` field present in `package.json` |
| `singleLockfile` | error | Only `pnpm-lock.yaml`, not `package-lock.json` / `yarn.lock` |
| `noLatestSpecifier` | error | No `"latest"` in `dependencies` / `devDependencies` |
| `onlyBuiltDepsDeclared` | error | `pnpm.onlyBuiltDependencies` explicitly listed |
| `noNpmInScripts` | error | No `npm` calls in `scripts` (must be `pnpm`) |
| `noEnginesNpm` | warning | No `engines.npm` constraint |
| `validatedEnv` | warning | `.gitignore` covers `.env*` |
| `engineDbExactPin` | error | `@kingym88/marketing-engine-db` must be exact-pin (no `^`, no `~`) |
| `noFileDeps` | error | No `file:` protocol deps |
| `pkgManagerVersionAligned` | warning | `packageManager` semver aligns across repos |

**Public API.** `runChecks(repoRoot)` returns
`{ violations, errorCount, warningCount }`. `loadRepoContext`,
`RULES`, `Rule`, `RepoContext`, `Violation`, `Severity` are also
exported.

**Inbound dependencies.** All three other repos list it as a devDep
(`@kingym88/marketing-engine-tooling@1.0.0`). `wakiru-marketing-engine`
runs it in `.github/workflows/tooling-check.yml`.

**Outbound dependencies.** Just `zod@4.4.3`. Self-contained.

---

## 4. Shared dependencies, contracts, and data models

### 4.1 npm packages shared across runtimes

| Package | Why both sides need it | Pinning |
|---------|------------------------|---------|
| `@kingym88/marketing-engine-db@1.3.2` | Prisma client + types for the marketing DB | Exact, enforced by tooling |
| `@kingym88/marketing-engine-tooling@1.0.0` | Linter | Exact |
| `@google-cloud/storage` | Both sides upload to / sign URLs from the same bucket | Engine `7.19.0`, coffee `^7.19.0` |
| `zod` | Schemas (`BrandConfigInputSchema` in coffee, env validation everywhere) | Engine `4.3.6`, coffee `^4.3.6`, tooling `4.4.3` |
| `@prisma/client` | Transitive via engine-db; coffee also has direct `^6.19.2` for its e-commerce client | Loose in coffee, transitive in engine |

### 4.2 Code-level duplication (de-facto contracts)

These files are **identical or near-identical** between
`wakiru-coffee` and `wakiru-marketing-engine`. They represent contracts
that today are kept in sync by copy-paste:

| Coffee path | Engine path | Notes |
|-------------|-------------|-------|
| `src/lib/platforms.ts` | `src/lib/platforms.ts` | `SUPPORTED_PLATFORMS = ["instagram","tiktok","twitter","facebook"]`, `assertPlatforms()` |
| `src/lib/socialInteractionStatus.ts` | `src/lib/socialInteractionStatus.ts` | `SOCIAL_INTERACTION_STATUSES = ["new","pending-review","replied"]` |
| `src/lib/gcpCredentials.ts` | `src/lib/gcpCredentials.ts` | Byte-identical: `loadGcpCredentials()` + `ServiceAccountJsonSchema` Zod schema |
| `src/lib/brandContext.ts` :: `generateBrandContextMd()` | `src/lib/brandContext.ts` :: `generateBrandContextMd()` | Engine version omits Competitors / Logo White / Logo Mark / Brand Pattern. Already drifting |

### 4.3 Network / IPC contracts

- **Engine HTTP trigger surface** — five POSTs documented in §3.2. The
  shape is duck-typed JSON; no shared schema package. Both sides hand-
  marshal the request/response objects.
- **Bearer secret** — `CALENDAR_TRIGGER_SECRET` must match between the
  coffee site (env var read in `src/lib/engineTrigger.ts`) and the
  engine (env var read in `src/lib/env.ts`). It is not rotated
  automatically.

### 4.4 Database contracts

- **One physical Postgres database** with two consumers but **one
  generated Prisma client** (the published `@kingym88/marketing-engine-db`).
  Connection string env is `DATABASE_URL` on the engine and
  `MARKETING_DATABASE_URL` on the coffee site (they point to the same
  DB).
- **Status enums are stored as `String` columns**, not Postgres enums:
  `ContentAsset.status`, `ContentAssetSchedule.status`,
  `SocialInteraction.status`, `MarketingCampaign.status`,
  `AgentRunLog.status`. The allowed values live in code (split between
  the two repos as listed in §4.2).
- **`BrandConfig.competitors`** is a `Json` column; both repos
  independently coerce it to `Array<{ name, positioning,
  phrasesToAvoid }>`.

### 4.5 Shared env-var conventions

- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — the single, validated path to
  the GCP service account. Both repos use the identical
  `loadGcpCredentials()`. (Old `GCS_SERVICE_ACCOUNT` + `GCS_PRIVATE_KEY`
  pair is fully retired.)
- `GCS_BUCKET` — same bucket on both sides; the engine uploads, the
  coffee site signs URLs for reading.
- `CALENDAR_TRIGGER_SECRET` — must match across the two repos.
- `ENGINE_TRIGGER_BASE_URL` (coffee side only) — points to the engine
  service. `CALENDAR_AGENT_TRIGGER_URL` is the deprecated legacy
  name, still honored with a one-time warning.
- `DRY_RUN` — engine reads as scoped state; coffee reads to gate the
  manual trigger button.
- `BUFFER_ACCESS_TOKEN` — both sides read it; engine for publishing,
  coffee for the Brand Kit Buffer Profiles read-only widget.

---

## 5. The big picture in one paragraph

The **engine** is the brain (Vertex AI + Buffer + cron). The
**marketing-engine-db** is the contract (schema + Prisma client). The
**coffee** site is the operator console (brand kit form, calendar
drag-drop, asset review, run history viewer) and the public webhook
sink for the three social platforms. The **tooling** package is the
guardrail (lockfile/Node-version/dep-pin discipline). All four are
kept in lockstep by exact-pinning the schema package and by running the
tooling linter in CI. The coffee site speaks to the engine over HTTPS
with a shared Bearer secret; both sides speak to the same Postgres
database; only the engine ever speaks to Vertex, Buffer, or Serper.
