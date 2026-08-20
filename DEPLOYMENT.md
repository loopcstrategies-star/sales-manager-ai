# Deployment status

## Live URLs

| Service | URL |
|---------|-----|
| **UI (Vercel)** | https://sales.loopcstrategies.com |
| **API (Railway)** | https://api-production-6e16.up.railway.app |

## GitHub

- Repo: https://github.com/loopcstrategies-star/sales-manager-ai
- Owner: personal account `loopcstrategies-star` (transferred from `loopc-business-strategies`)
- Visibility: **Public** for now (Railway GitHub App on the personal account can link public repos; set Private after granting that app private-repo access at https://github.com/settings/installations → Railway)

## Railway project

- Project: `sales-manager-ai`
- Services: `api` (Express), `MongoDB`
- Dashboard: https://railway.com/project/9bec621f-9721-41a6-a3f2-1367990f0447
- **Build:** custom root [`Dockerfile`](Dockerfile) (not Nixpacks) — secrets stay runtime-only, no `SecretsUsedInArgOrEnv` build warnings
- **Git source:** connected to `loopcstrategies-star/sales-manager-ai` branch `main`

## Vercel project

- Project: `salesmanager-ai` (under `beulah-4360s-projects`)
- Production deploys from `frontend/` (Vite build) with [`frontend/vercel.json`](frontend/vercel.json), or from repo root via root [`vercel.json`](vercel.json)
- API proxy: `/api/*` → Railway
- **Git source:** connected to `loopcstrategies-star/sales-manager-ai` (production branch `main`)
- Login Connections GitHub identity must remain **`loopcstrategies-star`** (personal-repo owner) for Git deploys to keep working

## DNS required (GoDaddy / domain host)

Add this record for the custom domain:

```
Type: A
Name: sales
Value: 76.76.21.21
TTL: 600 (or default)
```

Verify in Vercel → Project `salesmanager-ai` → Domains → `sales.loopcstrategies.com`

## Smoke tests

- `GET https://sales.loopcstrategies.com/api/health` — DB connected
- Register + login
- Chat endpoint
- `GET /api/dashboard` (auth) — cards, price tiles, refreshedAt

## Dashboard env (Railway `api` service)

| Variable | Purpose |
|----------|---------|
| `DASHBOARD_ENABLED` | `true` to enable cron + API |
| `DASHBOARD_REFRESH_HOURS` | Background refresh interval (default 4) |
| `DASHBOARD_QUERY_COUNT` | Tavily queries per refresh (default 8) |
| `DASHBOARD_CARD_CAP` | Max cards stored (default 20) |
| `GOLDAPI_KEY` | Optional gold/silver price tiles — [goldapi.io](https://www.goldapi.io) |
| `NEWSAPI_KEY` | Optional extra headlines — [newsapi.org/register](https://newsapi.org/register) |

**No extra Tavily credits:** keep `DASHBOARD_REFRESH_HOURS=4`. Do not set to `2`.

Quick setup after free signups:

```powershell
# 1. Copy keys into backend/.env.dashboard (from .env.dashboard.example)
# 2. Log in and push vars to Railway
railway login
powershell -File scripts/set-railway-dashboard-env.ps1
```

Tavily usage stays ~2 advanced searches per refresh (cached 24h) via `SALES_AI_MAX_TAVILY_SEARCHES`. RSS + NewsAPI add headlines without Tavily.

**Railway build:** API uses root `Dockerfile` + `.dockerignore`. Do not use Nixpacks for `api` — it injects secrets into build `ARG`/`ENV` and triggers Docker warnings.

**Groq TPM:** `DASHBOARD_LLM_MAX_TOKENS=1500` (default). Optional `DASHBOARD_LLM_MODEL=llama-3.1-8b-instant`.

**Proxy:** `TRUST_PROXY=true` auto-enables when `RAILWAY_ENVIRONMENT` is set on Railway.

## Redeploy commands

```bash
# Railway API
cd sales-manager-ai
railway up -s api

# Vercel UI (from repo root)
cd sales-manager-ai
npx vercel deploy --prod --scope beulah-4360s-projects

# Or from frontend/ subdirectory
cd sales-manager-ai/frontend
npx vercel deploy --prod --scope beulah-4360s-projects
```

If the CLI reports a project mismatch after the rename, re-link locally:

```powershell
cd frontend
npx vercel link --project sales-manager-ai --scope beulah-4360s-projects
```
