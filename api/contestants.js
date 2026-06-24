// Vercel serverless function: returns the merged contestant list.
// Scrapes Marie Claire fresh, falls back to bundled seed if scrape fails.
// Response is CDN-cached for 1 day so the scrape only actually runs ~once per day.

const { scrapeContestants, SOURCE_URL } = require('../lib/scraper');
const seed = require('../data/contestants.json');
const userRatings = require('../data/user-ratings.json');

function applyRatings(contestants) {
  return contestants.map((c) => {
    const r = userRatings[c.fullName] || { annoying: "don't know yet", south_florida: "don't know yet" };
    return { ...c, annoying: r.annoying, south_florida: r.south_florida };
  });
}

module.exports = async (req, res) => {
  try {
    const scraped = await scrapeContestants(seed.contestants);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');
    res.status(200).json({
      lastUpdated: new Date().toISOString(),
      source: SOURCE_URL,
      contestants: applyRatings(scraped),
    });
  } catch (err) {
    console.error('[api/contestants] Scrape failed, serving seed:', err.message);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    res.status(200).json({
      lastUpdated: seed.lastUpdated,
      source: SOURCE_URL,
      contestants: applyRatings(seed.contestants),
      _warning: 'live scrape failed; serving last known cast',
    });
  }
};
