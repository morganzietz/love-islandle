// Local one-off helper to refresh data/contestants.json from the live Marie Claire page.
// (Not used by the deployed app — Vercel scrapes lazily via api/contestants.js.)

const fs = require('fs');
const path = require('path');
const { scrapeContestants } = require('./lib/scraper');

const SEED_PATH = path.join(__dirname, 'data', 'contestants.json');
const RATINGS_PATH = path.join(__dirname, 'data', 'user-ratings.json');

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}

(async () => {
  const seed = readJSON(SEED_PATH, { contestants: [] });
  let scraped;
  try {
    scraped = await scrapeContestants(seed.contestants);
  } catch (err) {
    console.error('[scraper] Failed:', err.message);
    process.exit(1);
  }
  console.log(`[scraper] Parsed ${scraped.length} contestants.`);

  // Seed user-ratings for any new contestants with "don't know yet".
  const ratings = readJSON(RATINGS_PATH, {});
  let ratingsChanged = false;
  for (const c of scraped) {
    if (!ratings[c.fullName]) {
      ratings[c.fullName] = { annoying: "don't know yet", south_florida: "don't know yet" };
      ratingsChanged = true;
      console.log(`[scraper] New contestant: ${c.fullName} (added defaults)`);
    }
  }
  if (ratingsChanged) fs.writeFileSync(RATINGS_PATH, JSON.stringify(ratings, null, 2));

  fs.writeFileSync(
    SEED_PATH,
    JSON.stringify({
      lastUpdated: new Date().toISOString(),
      source: 'https://www.marieclaire.com/culture/tv-shows/love-island-usa-season-8-cast/',
      contestants: scraped,
    }, null, 2)
  );
  console.log(`[scraper] Wrote ${scraped.length} contestants to ${SEED_PATH}`);
})();
