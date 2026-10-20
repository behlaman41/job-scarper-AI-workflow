// Polite navigation for the scrapers: robots.txt check (cached per origin) and a per-host
// minimum gap between page loads, taken from config.sites.<site>.rate_limit.

const axios = require('axios');
const config = require('../config/config.json');

const robotsCache = new Map(); // origin -> Promise<string[]> disallowed path prefixes
const nextSlot = new Map(); // host -> earliest timestamp for the next request

function parseRobots(text) {
  // Rules for "User-agent: *" (the scraper does not have its own agent token).
  const rules = [];
  let inStar = false;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      inStar = (lastWasAgent && inStar) || value === '*';
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (inStar && field === 'disallow' && value) rules.push(value.replace(/\*.*$/, ''));
    }
  }
  return rules;
}

async function loadRobots(origin) {
  try {
    const { data, status } = await axios.get(`${origin}/robots.txt`, {
      timeout: 8000, responseType: 'text', validateStatus: () => true,
      headers: { 'User-Agent': config.scraping.user_agent }
    });
    return status < 400 && typeof data === 'string' ? parseRobots(data) : [];
  } catch (_) {
    return [];
  }
}

async function isAllowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) robotsCache.set(u.origin, loadRobots(u.origin));
  const rules = await robotsCache.get(u.origin);
  const p = u.pathname + u.search;
  return !rules.some(prefix => p.startsWith(prefix));
}

function gapFor(host) {
  const site = Object.values(config.sites || {}).find(s => s.base_url && host.endsWith(new URL(s.base_url).hostname.replace(/^www\./, '')));
  return Math.max((site && site.rate_limit) || 0, config.scraping.delay_between_requests || 0);
}

async function throttle(host) {
  // Reserve the slot synchronously so concurrent callers queue up instead of racing.
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) || 0);
  nextSlot.set(host, at + gapFor(host));
  if (at > now) await new Promise(r => setTimeout(r, at - now));
}

// page.goto that refuses robots-disallowed URLs and spaces out requests per host.
async function politeGoto(page, url, options) {
  if (!(await isAllowed(url))) {
    const err = new Error(`robots.txt disallows ${url}`);
    err.code = 'ROBOTS';
    throw err;
  }
  await throttle(new URL(url).host);
  return page.goto(url, options);
}

module.exports = { politeGoto, isAllowed, parseRobots };
