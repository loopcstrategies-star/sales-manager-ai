#!/usr/bin/env node
/**
 * Deployment checklist for Sales Manager AI.
 * Run after configuring Railway + Vercel env vars.
 */
console.log(`
Sales Manager AI deploy checklist
=================================
1. Railway: MONGO_URI, JWT_SECRET, TAVILY_API_KEY, GROQ_API_KEY, CORS_ORIGIN
2. Dashboard (no extra Tavily): GOLDAPI_KEY, NEWSAPI_KEY — see backend/.env.dashboard.example
3. Run: railway login && powershell -File scripts/set-railway-dashboard-env.ps1
4. Keep DASHBOARD_REFRESH_HOURS=4 (do NOT set to 2)
5. Vercel: update vercel.json rewrites with Railway API URL
6. Health: curl https://sales.loopcstrategies.com/api/health
7. Dashboard: open https://sales.loopcstrategies.com/dashboard -> Refresh now
`)
