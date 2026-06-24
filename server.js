// Local-only dev server. Vercel uses api/contestants.js instead.
// This mirrors that behavior so you can develop without deploying.

const express = require('express');
const path = require('path');
const fs = require('fs');
const { scrapeContestants, SOURCE_URL } = require('./lib/scraper');

const PORT = process.env.PORT || 4137;
const SEED_PATH = path.join(__dirname, 'data', 'contestants.json');
const RATINGS_PATH = path.join(__dirname, 'data', 'user-ratings.json');

const app = express();

// Static assets are at the project root for Vercel compatibility.
app.use(express.static(__dirname, {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}

function applyRatings(list) {
  const ratings = readJSON(RATINGS_PATH, {});
  return list.map((c) => {
    const r = ratings[c.fullName] || { annoying: "don't know yet", south_florida: "don't know yet" };
    return { ...c, annoying: r.annoying, south_florida: r.south_florida };
  });
}

// Simple in-memory cache so a page refresh doesn't re-scrape every time during dev.
let cache = { at: 0, payload: null };
const CACHE_MS = 60 * 60 * 1000; // 1 hour locally

app.get('/api/contestants', async (_req, res) => {
  const seed = readJSON(SEED_PATH, { contestants: [] });
  if (cache.payload && Date.now() - cache.at < CACHE_MS) {
    return res.json(cache.payload);
  }
  try {
    const scraped = await scrapeContestants(seed.contestants);
    const payload = {
      lastUpdated: new Date().toISOString(),
      source: SOURCE_URL,
      contestants: applyRatings(scraped),
    };
    cache = { at: Date.now(), payload };
    res.json(payload);
  } catch (err) {
    console.warn('[dev] scrape failed, serving seed:', err.message);
    res.json({
      lastUpdated: seed.lastUpdated,
      source: SOURCE_URL,
      contestants: applyRatings(seed.contestants),
      _warning: 'live scrape failed; serving last known cast',
    });
  }
});

app.listen(PORT, () => {
  console.log(`[server] Love Islandle dev server: http://localhost:${PORT}`);
});
