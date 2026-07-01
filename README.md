# Sales Manager AI

Standalone sales intelligence product — market research chat (Tavily) and template strategy synthesis. Optional LoopC Ops connector for CRM pipeline and company inbox.

## Architecture

- **Frontend** — React + Vite (`frontend/`) → deploy to Vercel
- **Backend** — Express + MongoDB (`backend/`) → deploy to Railway
- **LoopC connector** — `POST /api/integrations/loopc/connect` stores API key; chat uses LoopC `/api/integrations/sales-ai/*` routes

## Local development

```bash
# Install
npm run install:all

# Backend
cp backend/.env.example backend/.env
# Set MONGO_URI, JWT_SECRET, TAVILY_API_KEY

npm run dev --prefix backend

# Frontend (separate terminal)
npm run dev --prefix frontend
```

Open http://localhost:5173

## Deploy

### Railway (API)

1. Create new Railway project from this repo
2. Set root directory or use `railway.toml` start command
3. Env vars: `MONGO_URI`, `JWT_SECRET`, `TAVILY_API_KEY`, `CORS_ORIGIN=https://sales.loopcstrategies.com`
4. Note the public Railway URL (used in `vercel.json` API proxy)

### Vercel (UI)

1. Import repo → set root to project root
2. `vercel.json` proxies `/api/*` to Railway — replace `YOUR_RAILWAY_API_URL`
3. Env: `VITE_API_BASE_URL=` (empty when using proxy) or full API URL
4. Custom domain: `sales.loopcstrategies.com`

### LoopC ops-dashboard

1. Set `INTEGRATION_API_KEYS=loopc:<secure-key>` on LoopC Railway
2. Set `VITE_SALES_MANAGER_AI_URL=https://sales.loopcstrategies.com` on LoopC Vercel
3. In Sales Manager AI Settings, paste the same API key to connect LoopC

## Embed (LoopC iframe)

- Standalone embed route: `https://sales.loopcstrategies.com/embed?token=<jwt>`
- LoopC in-dashboard iframe: `https://loopc.loopcstrategies.com/sales-ai/embed`

## Day-1 scope

- Register / login
- Chat + Tavily market research
- Template synthesis (no OpenAI required)

## Phase 2 (LoopC connected)

- CRM snapshot in chat
- Company inbox summary
- Live metal rates from LoopC
