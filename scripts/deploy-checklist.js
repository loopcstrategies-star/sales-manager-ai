#!/usr/bin/env node
/**
 * Deployment checklist for Sales Manager AI.
 * Run after configuring Railway + Vercel env vars.
 */
console.log(`
Sales Manager AI deploy checklist
=================================
1. Railway: MONGO_URI, JWT_SECRET, TAVILY_API_KEY, CORS_ORIGIN
2. Vercel: update vercel.json rewrites with Railway API URL
3. LoopC: INTEGRATION_API_KEYS=loopc:<key>
4. LoopC Vercel: VITE_SALES_MANAGER_AI_URL=https://sales.loopcstrategies.com
5. Health: curl https://sales.loopcstrategies.com/api/health
6. UI: open https://sales.loopcstrategies.com/login
`)
