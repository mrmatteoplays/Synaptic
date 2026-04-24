# Synaptic

Your personal AI learning engine. Learn anything. Remember everything.

## Features
- **Active Learning** — AI answers your question + gives an analogy to make it click
- **Quiz Mode** — Active recall questions generated for every concept
- **Spaced Repetition** — Nodes resurface at 1, 3, 7, 14, 30, 90 day intervals
- **Growth Charts** — XP over time, knowledge map donut, 30-day activity heatmap
- **Answers Stay Open** — Latest answer always visible, nodes expandable

## Local Development

```bash
npm install
npm run dev
# Open http://localhost:5173
```

Get a free Anthropic API key at https://console.anthropic.com

## Deploy to Vercel

1. Push ALL files to GitHub root (package.json must be at root)
2. Go to vercel.com → New Project → import repo
3. Deploy — zero config needed
4. Enter your API key in the app on first load

## File Structure

```
/
├── api/
│   └── chat.js          ← Vercel serverless proxy (fixes CORS)
├── src/
│   ├── main.jsx         ← Entry point
│   ├── App.jsx          ← Full app
│   ├── api.js           ← Claude API calls
│   ├── storage.js       ← localStorage + spaced repetition logic
│   └── index.css        ← Global styles
├── index.html
├── package.json
└── vite.config.js
```

## Stack
- React 18 + Vite
- Anthropic API (claude-haiku-4-5-20251001)
- Vercel serverless functions (CORS proxy)
- localStorage for persistence (no backend needed)
