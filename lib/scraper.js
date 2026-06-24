// Pure scraper — fetches Marie Claire, parses contestants, merges with an optional seed
// for stable origin/gender hints. NO filesystem writes (so it works in serverless).

const axios = require('axios');
const cheerio = require('cheerio');

const SOURCE_URL = 'https://www.marieclaire.com/culture/tv-shows/love-island-usa-season-8-cast/';
const SECTION_HEADERS = new Set(['Active', 'Casa Amor', 'Dumped']);
const STAFF_BIO_SPLIT = /Quinci LeGardye is a Culture Writer/;
const NAME_RE = /^[A-Z][A-Za-zé'.\-]+(?:\s+(?:[A-Z][A-Za-zé'.\-]+|[A-Z]\.))+(?:\s+[A-Z][a-z]+\.?)?$/;

function firstNameOf(full) {
  return full.split(/\s+/)[0];
}

function detectGender(text) {
  const she = (text.match(/\b(she|her|hers|she's|herself)\b/gi) || []).length;
  const he = (text.match(/\b(he|him|his|he's|himself)\b/gi) || []).length;
  if (she > he && she > 0) return 'female';
  if (he > she && he > 0) return 'male';
  return null;
}

function detectModel(text) {
  return /\bmodel(s|ing|ed)?\b/i.test(text);
}

function parsePage(html) {
  const $ = cheerio.load(html);
  const found = [];
  let section = '';
  let name = null;
  let textBuf = [];

  const flush = () => {
    if (!name) return;
    const text = textBuf.join(' ').split(STAFF_BIO_SPLIT)[0];
    found.push({
      fullName: name,
      firstName: firstNameOf(name),
      gender: detectGender(text),
      origin: section === 'Casa Amor' ? 'casa' : null,
      status: section === 'Dumped' ? 'dumped' : 'active',
      is_model: detectModel(text),
    });
  };

  const walk = (root) => {
    root.find('h2, p').each((_, el) => {
      const tag = el.tagName.toLowerCase();
      const t = $(el).text().trim();
      if (tag === 'h2') {
        flush();
        if (SECTION_HEADERS.has(t)) { section = t; name = null; textBuf = []; }
        else if (t) { name = t; textBuf = []; }
      } else if (name && t) {
        textBuf.push(t);
      }
    });
    flush();
  };

  walk($('article').first());
  if (found.length < 10) {
    found.length = 0;
    section = ''; name = null; textBuf = [];
    walk($('body'));
  }

  return found.filter((c) => NAME_RE.test(c.fullName));
}

// Merge scraped data with a seed (existing contestants.json) so we keep stable
// origin/gender hints for OG/bombshell distinctions the page doesn't mark explicitly.
function mergeWithSeed(scraped, seed) {
  const seedByName = new Map((seed || []).map((c) => [c.fullName, c]));
  return scraped.map((c) => {
    const prev = seedByName.get(c.fullName) || {};
    return {
      fullName: c.fullName,
      firstName: c.firstName,
      gender: c.gender || prev.gender || 'unknown',
      origin: c.origin || prev.origin || 'bombshell',
      status: c.status,
      is_model: c.is_model || prev.is_model || false,
    };
  });
}

async function fetchPage() {
  const res = await axios.get(SOURCE_URL, {
    timeout: 15000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
  });
  return res.data;
}

async function scrapeContestants(seed) {
  const html = await fetchPage();
  const parsed = parsePage(html);
  if (parsed.length === 0) throw new Error('No contestants parsed from page');
  return mergeWithSeed(parsed, seed);
}

module.exports = { scrapeContestants, SOURCE_URL };
