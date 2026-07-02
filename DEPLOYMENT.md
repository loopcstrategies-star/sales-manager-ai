# Deployment status

## Live URLs

| Service | URL |
|---------|-----|
| **API (Railway)** | https://api-production-6e16.up.railway.app |
| **UI (Vercel)** | https://frontend-umber-five-ui0szwvc1b.vercel.app |
| **Custom domain (pending DNS)** | https://sales.loopcstrategies.com |

## GitHub

- Private repo: https://github.com/loopc-business-strategies/sales-manager-ai

## Railway project

- Project: `sales-manager-ai`
- Services: `api` (Express), `MongoDB`
- Dashboard: https://railway.com/project/9bec621f-9721-41a6-a3f2-1367990f0447

## Vercel project

- Project: `frontend` (under `beulah-4360s-projects`)
- Production deploys from `frontend/` directory with `frontend/vercel.json`
- API proxy: `/api/*` → Railway

## DNS required (GoDaddy / domain host)

Add this record for the custom domain:

```
Type: A
Name: sales
Value: 76.76.21.21
TTL: 600 (or default)
```

Verify in Vercel → Project `frontend` → Domains → `sales.loopcstrategies.com`

## Smoke tests

- `GET /api/health` — DB connected
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

## Redeploy commands

```bash
# Railway API
cd sales-manager-ai
railway up -s api

# Vercel UI
cd sales-manager-ai/frontend
npx vercel deploy --prod --scope beulah-4360s-projects
```
