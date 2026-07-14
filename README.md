# Sales Manager AI

Standalone sales intelligence product — web research chat (Brave/Tavily) and Groq/OpenAI/template answer synthesis.

For a full architecture and codebase walkthrough, see [PROJECT_ANALYSIS.md](./PROJECT_ANALYSIS.md).

For chat behavior and UI options, see [CHAT_GUIDE.md](./CHAT_GUIDE.md).

## Architecture

- **Frontend** — React + Vite (`frontend/`) → deploy to Vercel
- **Backend** — Express + MongoDB (`backend/`) → deploy to Railway

## Local development

```bash
# Install
npm run install:all

# Backend
cp backend/.env.example backend/.env
# Set MONGO_URI, JWT_SECRET, GROQ_API_KEY, BRAVE_API_KEY (see CHAT_GUIDE.md)

npm run dev --prefix backend

# Frontend (separate terminal)
npm run dev --prefix frontend
```

Open http://localhost:5173

## Deploy

### Railway (API)

1. Create new Railway project from this repo
2. Set root directory or use `railway.toml` start command
3. Env vars: `MONGO_URI`, `JWT_SECRET`, `GROQ_API_KEY`, `BRAVE_API_KEY`, `CORS_ORIGIN=https://sales.loopcstrategies.com`
4. Note the public Railway URL (used in `vercel.json` API proxy)

### Vercel (UI)

1. Import repo → set root to project root
2. `vercel.json` proxies `/api/*` to Railway — replace `YOUR_RAILWAY_API_URL`
3. Env: `VITE_API_BASE_URL=` (empty when using proxy) or full API URL
4. Custom domain: `sales.loopcstrategies.com`

## Embed

- Standalone embed route: `https://sales.loopcstrategies.com/embed?token=<jwt>`

## Features

- Register / login
- Chat + Brave or Tavily web research (with MongoDB response cache)
- Groq (free), OpenAI, Ollama, or template fallback synthesis
- Region focus, constraints, deep research, session history, chat export
- CRM: Import from web, Find contacts (free: search + Groq), CSV contact import — verify before outreach
- Optional Hunter.io emails only if `HUNTER_API_KEY` is set (button hidden otherwise)

## Minimize API costs

See [CHAT_GUIDE.md](./CHAT_GUIDE.md#recommended-free-stack-groq--brave). Quick defaults in `backend/.env`:

```env
SALES_AI_SYNTHESIS_MODE=auto
GROQ_API_KEY=gsk_...
OPENAI_BASE_URL=https://api.groq.com/openai/v1
SEARCH_PROVIDER=brave
BRAVE_API_KEY=...
SALES_AI_MAX_TAVILY_SEARCHES=2
# Optional paid: HUNTER_API_KEY=...
```
