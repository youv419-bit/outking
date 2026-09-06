const fs = require("fs");
const path = require("path");

const file = process.env.DATABASE_PATH || path.join(__dirname, "data", "rankwall.json");
fs.mkdirSync(path.dirname(file), { recursive: true });

function load() {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function save(state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

const CATEGORIES = [
  { slug: "ai-agents-infrastructure", name: "AI Agents & Infrastructure", short: "Agents" },
  { slug: "seo-ai-visibility", name: "SEO & AI Visibility", short: "SEO" },
  { slug: "marketing-advertising", name: "Marketing & Advertising", short: "Marketing" },
  { slug: "crypto-web3-investing", name: "Crypto, Web3 & Investing", short: "Crypto" },
  { slug: "developer-tools", name: "Developer Tools", short: "Developer" },
  { slug: "business-finance-legal", name: "Business, Finance & Legal", short: "Business" },
  { slug: "security-privacy-compliance", name: "Security, Privacy & Compliance", short: "Security" },
  { slug: "health-fitness-wellness", name: "Health, Fitness & Wellness", short: "Health" },
  { slug: "social-media-creator-tools", name: "Social Media & Creator Tools", short: "Social" },
  { slug: "leaderboards-attention", name: "Leaderboards & Attention", short: "Leaderboards" },
  { slug: "hiring-jobs-careers", name: "Hiring, Jobs & Careers", short: "Hiring" },
  { slug: "education-learning", name: "Education & Learning", short: "Education" },
  { slug: "agencies-studios-services", name: "Agencies, Studios & Services", short: "Agencies" },
  { slug: "domains-web-assets", name: "Domains & Web Assets", short: "Domains" },
  { slug: "design-creative", name: "Design & Creative", short: "Design" },
  { slug: "writing-content", name: "Writing & Content", short: "Writing" },
  { slug: "productivity-personal-tools", name: "Productivity & Personal Tools", short: "Productivity" },
  { slug: "people-profiles", name: "People & Profiles", short: "People" },
  { slug: "directories-launch-discovery", name: "Directories, Launch & Discovery", short: "Directories" },
  { slug: "other", name: "Other", short: "Other" }
];

function slugifyUrl(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^@/, "");
  try {
    if (!/^https?:\/\//i.test(s) && !s.includes(".")) s = "https://x.com/" + s;
    else if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    const u = new URL(s);
    u.hash = "";
    u.search = "";
    let host = u.hostname.replace(/^www\./, "");
    let p = u.pathname.replace(/\/+$/, "");
    if (host === "x.com" || host === "twitter.com") {
      return ("x-" + p.replace(/^\//, "").replace(/\//g, "-")).toLowerCase() || "x";
    }
    if (["github.com", "apps.apple.com", "play.google.com"].includes(host)) {
      return (host + p).replace(/[^\w.-]+/g, "-").toLowerCase();
    }
    return host.toLowerCase();
  } catch {
    return s.toLowerCase().replace(/[^\w.-]+/g, "-").slice(0, 80);
  }
}

function normalizeUrl(raw) {
  let s = String(raw || "").trim();
  if (s.startsWith("@")) return "https://x.com/" + s.slice(1);
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return s;
  }
}

function hostLabel(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("x.com") || u.hostname.includes("twitter.com")) {
      return "@" + u.pathname.replace(/^\//, "").split("/")[0];
    }
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// No demo/seed listings — the board starts empty and fills up from real claims.
const SEED = [];

function fresh() {
  const now = new Date().toISOString();
  const listings = SEED.map((row, i) => {
    const [url, title, description, category, amount, clicks] = row;
    return {
      id: i + 1,
      slug: slugifyUrl(url),
      url,
      title,
      description,
      category,
      amount,
      clicks,
      created_at: now,
      updated_at: now
    };
  });
  return {
    listings,
    payments: listings.map((l) => ({
      id: l.id,
      listing_id: l.id,
      amount: l.amount,
      dodo_payment_id: "seed_" + l.id,
      webhook_id: null,
      created_at: now
    })),
    pending: [],
    activity: listings.map((l) => ({
      id: l.id,
      listing_id: l.id,
      message: `${hostLabel(l.url)} claimed a rank · $${l.amount}`,
      created_at: now
    })),
    visits: 0,
    nextId: listings.length + 1
  };
}

let state = load() || fresh();
if (!state.listings?.length) state = fresh();
if (!Array.isArray(state.visitorIds)) state.visitorIds = [];
const visitorIdSet = new Set(state.visitorIds);

// One-time cleanup: earlier deploys shipped with demo/seed listings
// (their payments are tagged "seed_<id>"). Strip any that are still
// sitting in a persisted data file so the board starts clean.
const seedListingIds = new Set(
  state.payments
    .filter((p) => typeof p.dodo_payment_id === "string" && p.dodo_payment_id.startsWith("seed_"))
    .map((p) => p.listing_id)
);
if (seedListingIds.size) {
  state.listings = state.listings.filter((l) => !seedListingIds.has(l.id));
  state.payments = state.payments.filter((p) => !seedListingIds.has(p.listing_id));
  state.activity = state.activity.filter((a) => !seedListingIds.has(a.listing_id));
}

save(state);

function persist() {
  save(state);
}

function ranked(board = "all", category = null) {
  let rows = [...state.listings];
  if (category) rows = rows.filter((r) => r.category === category);
  if (board === "today" || board === "daily") {
    const cutoff = new Date();
    if (board === "today") cutoff.setHours(cutoff.getHours() - 24);
    else cutoff.setUTCHours(0, 0, 0, 0);
    const since = cutoff.toISOString();
    const spent = {};
    state.payments.forEach((p) => {
      if (p.created_at >= since) spent[p.listing_id] = (spent[p.listing_id] || 0) + p.amount;
    });
    rows = rows
      .map((r) => ({ ...r, amount: spent[r.id] || 0 }))
      .filter((r) => r.amount > 0);
  }
  rows.sort((a, b) => b.amount - a.amount || a.created_at.localeCompare(b.created_at));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

function top1Amount(board = "all", category = null) {
  return ranked(board, category)[0]?.amount || 0;
}

function findBySlug(slug) {
  return state.listings.find((l) => l.slug === slug) || null;
}

function findByUrl(url) {
  const n = normalizeUrl(url);
  const s = slugifyUrl(url);
  return state.listings.find((l) => l.url === n || l.slug === s) || null;
}

function applyPayment({ url, title, description, category, amount, dodoPaymentId, webhookId }) {
  if (dodoPaymentId && state.payments.some((p) => p.dodo_payment_id === dodoPaymentId)) {
    return findByUrl(url);
  }
  if (webhookId && state.payments.some((p) => p.webhook_id === webhookId)) {
    return findByUrl(url);
  }
  const now = new Date().toISOString();
  const slug = slugifyUrl(url);
  const norm = normalizeUrl(url);
  let listing = state.listings.find((l) => l.slug === slug);
  if (!listing) {
    listing = {
      id: state.nextId++,
      slug,
      url: norm,
      title: title || hostLabel(norm),
      description: description || "",
      category: category || "other",
      amount,
      clicks: 0,
      created_at: now,
      updated_at: now
    };
    state.listings.push(listing);
  } else {
    listing.amount += amount;
    if (title) listing.title = title;
    if (description) listing.description = description;
    if (category) listing.category = category;
    listing.updated_at = now;
  }
  state.payments.push({
    id: state.nextId++,
    listing_id: listing.id,
    amount,
    dodo_payment_id: dodoPaymentId || null,
    webhook_id: webhookId || null,
    created_at: now
  });
  state.activity.unshift({
    id: state.nextId++,
    listing_id: listing.id,
    message: `${hostLabel(listing.url)} paid $${amount} · now $${listing.amount}`,
    created_at: now
  });
  state.activity = state.activity.slice(0, 80);
  persist();
  return listing;
}

function recordClick(slug) {
  const row = findBySlug(slug);
  if (!row) return null;
  row.clicks += 1;
  persist();
  return row;
}

function activity(limit = 12) {
  return state.activity.slice(0, limit).map((a) => {
    const l = state.listings.find((x) => x.id === a.listing_id);
    return { ...a, slug: l?.slug, title: l?.title, amount: l?.amount, url: l?.url };
  });
}

// Real "who's online now" tracking — an in-memory map of visitor id ->
// last-seen timestamp. Not persisted to disk on purpose: it's a live,
// moment-to-moment count, not historical data, and resetting it on a
// restart is correct (nobody's "still online" across a redeploy anyway).
const ONLINE_WINDOW_MS = 45 * 1000;
const onlineMap = new Map();

function pingOnline(visitorId) {
  if (!visitorId) return;
  onlineMap.set(visitorId, Date.now());
}

function onlineCount() {
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  for (const [id, seen] of onlineMap) {
    if (seen < cutoff) onlineMap.delete(id);
  }
  return onlineMap.size;
}

function stats() {
  const paid = state.listings.reduce((n, l) => n + l.amount, 0);
  const clicks = state.listings.reduce((n, l) => n + l.clicks, 0);
  return {
    listings: state.listings.length,
    paid,
    clicks,
    visitors: visitorIdSet.size,
    online: onlineCount()
  };
}

// Counts a real, unique visitor exactly once (by their anonymous cookie
// id), not once per HTTP request. Previously this incremented on every GET
// that wasn't under /api — which included every CSS/JS/favicon/image
// request a single page load makes, so one person loading one page could
// add 5-6 to the "visitors" number. Now it only grows when someone genuinely
// new shows up.
function pingVisit(visitorId) {
  if (!visitorId || visitorIdSet.has(visitorId)) return;
  visitorIdSet.add(visitorId);
  state.visitorIds.push(visitorId);
  persist();
}

function deleteListing(idOrSlug) {
  const listing = state.listings.find((l) => l.id === idOrSlug || l.slug === idOrSlug);
  if (!listing) return false;
  state.listings = state.listings.filter((l) => l.id !== listing.id);
  state.payments = state.payments.filter((p) => p.listing_id !== listing.id);
  state.activity = state.activity.filter((a) => a.listing_id !== listing.id);
  persist();
  return true;
}

function savePending(row) {
  state.pending = state.pending.filter((p) => p.session_id !== row.session_id);
  state.pending.push({ ...row, created_at: new Date().toISOString() });
  persist();
}

function getPending(sessionId) {
  return state.pending.find((p) => p.session_id === sessionId) || null;
}

module.exports = {
  CATEGORIES,
  slugifyUrl,
  normalizeUrl,
  hostLabel,
  ranked,
  top1Amount,
  findBySlug,
  findByUrl,
  applyPayment,
  recordClick,
  activity,
  stats,
  pingVisit,
  pingOnline,
  savePending,
  getPending,
  deleteListing
};
