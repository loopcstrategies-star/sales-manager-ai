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
3. Health: curl https://sales.loopcstrategies.com/api/health
4. UI: open https://sales.loopcstrategies.com/login
`)
