require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("./store");

const app = express();
const PORT = process.env.PORT || 3000;
// Accept APP_URL or the old Next.js-app naming (NEXT_PUBLIC_SITE_URL) so an
// existing Railway service doesn't need its variables renamed.
const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const APP_NAME = process.env.APP_NAME || "Outking";
const MIN = 1;
const MAX = 999999;
const TAKE_ONE_GAP = 1;

app.set("trust proxy", true);
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf; // needed later to verify the Dodo webhook signature
    }
  })
);
app.use(express.urlencoded({ extended: true }));
const STATIC_VERSION = Date.now().toString(36);
app.use("/static", express.static(path.join(__dirname, "public"), { maxAge: "1y", etag: true }));

// Favicon / social-share assets at the well-known root paths browsers,
// crawlers, and link-preview bots request directly (not under /static).
const publicDir = path.join(__dirname, "public");
app.get("/favicon.ico", (req, res) => res.sendFile(path.join(publicDir, "favicon.ico"), { maxAge: "1d" }));
app.get("/apple-touch-icon.png", (req, res) => res.sendFile(path.join(publicDir, "apple-touch-icon.png"), { maxAge: "7d" }));
app.get("/apple-touch-icon-precomposed.png", (req, res) =>
  res.sendFile(path.join(publicDir, "apple-touch-icon.png"), { maxAge: "7d" })
);
app.get("/og-image.png", (req, res) => res.sendFile(path.join(publicDir, "og-image.png"), { maxAge: "7d" }));
app.get("/manifest.webmanifest", (req, res) => {
  res.type("application/manifest+json");
  res.json({
    name: APP_NAME,
    short_name: APP_NAME,
    start_url: "/",
    display: "standalone",
    background_color: "#101218",
    theme_color: "#101218",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  });
});
app.get("/icon-192.png", (req, res) => res.sendFile(path.join(publicDir, "icon-192.png"), { maxAge: "7d" }));
app.get("/icon-512.png", (req, res) => res.sendFile(path.join(publicDir, "icon-512.png"), { maxAge: "7d" }));
app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send(`User-agent: *\nAllow: /\n\nSitemap: ${APP_URL}/sitemap.xml\n`);
});
app.get("/sitemap.xml", (req, res) => {
  const staticPaths = ["/", "/today", "/daily", "/categories", "/faq", "/rules", "/about", "/terms", "/privacy"];
  const categoryPaths = db.CATEGORIES.map((c) => `/category/${c.slug}`);
  const productPaths = db.ranked("all").map((r) => `/product/${r.slug}`);
  const urls = [...staticPaths, ...categoryPaths, ...productPaths]
    .map((p) => `<url><loc>${APP_URL}${p}</loc></url>`)
    .join("");
  res.type("application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

const MAINTENANCE_BYPASS_COOKIE = "outking_bypass_maintenance";
const MAINTENANCE_ALWAYS_ALLOWED_PREFIXES = ["/static", "/webhook/dodo", "/api/webhooks/dodo", "/admin"];
const MAINTENANCE_ALWAYS_ALLOWED_PATHS = new Set([
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/og-image.png",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/robots.txt",
  "/sitemap.xml"
]);

function maintenanceAlwaysAllowed(pathname) {
  if (MAINTENANCE_ALWAYS_ALLOWED_PATHS.has(pathname)) return true;
  return MAINTENANCE_ALWAYS_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function maintenancePage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${APP_NAME} — Down for maintenance</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: ui-sans-serif, system-ui, Inter, sans-serif;
    background: #101218;
    color: #eee;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
    text-align: center;
  }
  .card {
    max-width: 480px;
    padding: 40px 32px;
    border-radius: 20px;
    background: #161922;
    border: 1px solid #ffffff14;
  }
  h1 { margin: 0 0 12px; font-size: 24px; letter-spacing: -0.02em; }
  p { margin: 0; color: #9aa; font-size: 15px; line-height: 1.5; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 99px; background: #ffb38a; margin-right: 8px; }
</style>
</head>
<body>
  <div class="card">
    <h1><span class="dot"></span>We'll be right back</h1>
    <p>${APP_NAME} is undergoing scheduled maintenance. Please check back shortly.</p>
  </div>
</body>
</html>`;
}

app.use((req, res, next) => {
  const maintenanceEnabled = process.env.MAINTENANCE_MODE === "true" || process.env.MAINTENANCE_MODE === "1";
  if (!maintenanceEnabled) return next();
  if (maintenanceAlwaysAllowed(req.path)) return next();

  const bypassToken = process.env.MAINTENANCE_BYPASS_TOKEN;
  const cookies = parseCookies(req);
  const hasBypassCookie = bypassToken && cookies[MAINTENANCE_BYPASS_COOKIE] === bypassToken;
  const suppliedToken = req.query.bypass;

  if (bypassToken && suppliedToken === bypassToken) {
    res.cookie(MAINTENANCE_BYPASS_COOKIE, bypassToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: "/"
    });
    return next();
  }

  if (hasBypassCookie) return next();

  res.set("Retry-After", "3600");
  res.set("Cache-Control", "no-store");
  return res.status(503).send(maintenancePage());
});

// Accept DODO_ENVIRONMENT or the old Next.js-app naming (DODO_PAYMENTS_ENVIRONMENT)
// so an existing Railway service doesn't need its variables renamed.
function rawDodoEnvVar() {
  if (process.env.DODO_ENVIRONMENT !== undefined) return process.env.DODO_ENVIRONMENT;
  return process.env.DODO_PAYMENTS_ENVIRONMENT || "";
}

function dodoEnvMode() {
  return rawDodoEnvVar().trim().toLowerCase() === "live_mode" ? "live_mode" : "test_mode";
}

function dodoEnvWarnings() {
  const warnings = [];
  const key = process.env.DODO_PAYMENTS_API_KEY || "";
  const productId = process.env.DODO_PRODUCT_ID || "";
  const rawEnv = rawDodoEnvVar();
  if (rawEnv && rawEnv.trim() !== rawEnv) {
    warnings.push(
      `Your DODO_ENVIRONMENT / DODO_PAYMENTS_ENVIRONMENT variable has leading/trailing whitespace or a newline (it's silently falling back to test_mode because of this) — re-copy/re-type it as exactly "live_mode" or "test_mode".`
    );
  }
  if (key && key.trim() !== key) {
    warnings.push("DODO_PAYMENTS_API_KEY has leading/trailing whitespace or a newline — re-copy it and re-paste carefully.");
  }
  if (productId && productId.trim() !== productId) {
    warnings.push("DODO_PRODUCT_ID has leading/trailing whitespace or a newline — re-copy it and re-paste carefully.");
  }
  if (key && !/^[A-Za-z0-9_.\-]+$/.test(key.trim())) {
    warnings.push("DODO_PAYMENTS_API_KEY contains characters that look wrong for an API key (check for a copy/paste error).");
  }
  return warnings;
}

function dodoClient() {
  if (!process.env.DODO_PAYMENTS_API_KEY) return null;
  const DodoPayments = require("dodopayments");
  return new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY.trim(),
    environment: dodoEnvMode(),
    webhookKey: (process.env.DODO_PAYMENTS_WEBHOOK_KEY || "").trim() || undefined
  });
}

function blockedUrl(url) {
  const s = url.toLowerCase();
  const banned = ["t.me", "telegram", "wa.me", "whatsapp", "discord.gg", "discord.com/invite", "chat.whatsapp", "signal.me"];
  return banned.some((b) => s.includes(b));
}

function computeCharge(url, desired) {
  let amount = Math.round(Number(desired));
  if (!Number.isFinite(amount)) amount = MIN;
  amount = Math.max(MIN, Math.min(MAX, amount));
  const existing = db.findByUrl(url);
  const top = db.top1Amount("all");
  if (existing) {
    const minRaise = existing.amount + 1;
    if (amount <= existing.amount) amount = minRaise;
    return { existing, targetAmount: amount, chargeAmount: amount - existing.amount, top };
  }
  return { existing: null, targetAmount: amount, chargeAmount: amount, top };
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const pageMetaCache = new Map(); // url -> { data, at }
const PAGE_META_TTL_MS = 5 * 60 * 1000;
const PAGE_META_FETCH_TIMEOUT_MS = 4000;

async function fetchPageMeta(url) {
  const cached = pageMetaCache.get(url);
  if (cached && Date.now() - cached.at < PAGE_META_TTL_MS) return cached.data;
  if (typeof fetch !== "function") return { title: null, description: null };
  let result = { title: null, description: null };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_META_FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OutkingBot/1.0; +https://outking.lol)" }
    });
    clearTimeout(timer);
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const html = (await res.text()).slice(0, 200000);
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch) result.title = decodeEntities(titleMatch[1]).slice(0, 140) || null;
        const descMatch =
          html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ||
          html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i);
        if (descMatch) result.description = decodeEntities(descMatch[1]).slice(0, 280) || null;
      }
    }
  } catch {
    // best-effort only — fall back to hostname-derived title downstream
  }
  pageMetaCache.set(url, { data: result, at: Date.now() });
  return result;
}

function claimPriceForRank(rank, rows) {
  if (rank <= 1) return (rows[0]?.amount || 0) + TAKE_ONE_GAP;
  const target = rows[rank - 1];
  return (target?.amount || MIN) + 1;
}

const VISITOR_COOKIE = "rw_vid";

app.use((req, res, next) => {
  // A lightweight, anonymous id used only to count real distinct people
  // currently on the site (the "X online" number) — not used for anything
  // else. It's set once and just read back on later requests/heartbeats.
  let vid = parseCookies(req)[VISITOR_COOKIE];
  if (!vid) {
    vid = crypto.randomUUID();
    res.cookie(VISITOR_COOKIE, vid, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: "lax"
    });
  }
  req.visitorId = vid;
  db.pingOnline(vid);
  // Only count actual page navigations toward "visitors", not every
  // sub-resource a page pulls in. Browsers send Accept: text/html (among
  // other things) for the page itself, but a different Accept for
  // CSS/JS/image/font requests — that's what tells the two apart, since
  // static assets don't all share one predictable URL prefix.
  const isPageNav = req.method === "GET" && !req.path.startsWith("/api") && (req.headers.accept || "").includes("text/html");
  if (isPageNav) db.pingVisit(vid);
  next();
});

app.post("/api/heartbeat", (req, res) => {
  db.pingOnline(req.visitorId);
  res.json({ ok: true });
});

app.get("/api/state", (req, res) => {
  const board = req.query.board || "all";
  const category = req.query.category || null;
  const rows = db.ranked(board, category);
  const bubbles = db.ranked("all").slice(0, 20);
  res.json({
    app: APP_NAME,
    board,
    category,
    stats: db.stats(),
    listings: rows,
    bubbles,
    activity: db.activity(16),
    categories: db.CATEGORIES,
    top1: db.top1Amount(board, category),
    claim1: db.top1Amount(board, category) + TAKE_ONE_GAP,
    min: MIN
  });
});

app.post("/api/preview", async (req, res) => {
  const url = db.normalizeUrl(req.body.url || "");
  const amount = req.body.amount;
  if (!url) return res.status(400).json({ error: "Paste a product URL or @handle." });
  if (blockedUrl(url)) return res.status(400).json({ error: "Chat and invite links are not allowed." });
  const calc = computeCharge(url, amount);
  const existingListing = calc.existing;
  let title = existingListing?.title || null;
  let description = existingListing?.description || null;
  if (!title) {
    const meta = await fetchPageMeta(url);
    title = meta.title || db.hostLabel(url);
    description = meta.description || null;
  }
  res.json({
    url,
    slug: db.slugifyUrl(url),
    title,
    description,
    existingAmount: calc.existing?.amount || 0,
    targetAmount: calc.targetAmount,
    chargeAmount: calc.chargeAmount,
    wouldRank:
      db.ranked("all").filter((r) => r.amount > calc.targetAmount).length + 1,
    note:
      calc.targetAmount > calc.top
        ? `This takes #1 (need at least $${calc.top + TAKE_ONE_GAP} to beat current #1).`
        : `Lands at whatever rank $${calc.targetAmount} can take.`
  });
});

app.post("/api/checkout", async (req, res) => {
  try {
    const url = db.normalizeUrl(req.body.url || "");
    const category = req.body.category || "other";
    let title = (req.body.title || "").slice(0, 140);
    let description = (req.body.description || "").slice(0, 280);
    if (!url) return res.status(400).json({ error: "Paste a product URL or @handle." });
    if (blockedUrl(url)) return res.status(400).json({ error: "Chat and invite links are not allowed." });
    if (!db.CATEGORIES.find((c) => c.slug === category)) {
      return res.status(400).json({ error: "Pick a valid category." });
    }
    if (!title && !db.findByUrl(url)) {
      const meta = await fetchPageMeta(url);
      title = meta.title || "";
      if (!description) description = meta.description || "";
    }
    const calc = computeCharge(url, req.body.amount);
    if (calc.existing && calc.chargeAmount < 1) {
      return res.status(400).json({ error: "Raise by at least $1 above your current rank." });
    }
    const client = dodoClient();
    const metadata = {
      url,
      category,
      title,
      description,
      target_amount: String(calc.targetAmount),
      charge_amount: String(calc.chargeAmount)
    };

    if (!client || !process.env.DODO_PRODUCT_ID) {
      const listing = db.applyPayment({
        url,
        title,
        description,
        category,
        amount: calc.chargeAmount,
        dodoPaymentId: "demo_" + Date.now()
      });
      return res.json({
        demo: true,
        checkout_url: `${APP_URL}/success?demo=1&slug=${encodeURIComponent(listing.slug)}`,
        message: "Dodo keys not set — demo payment applied locally."
      });
    }

    const session = await client.checkoutSessions.create({
      product_cart: [
        {
          product_id: (process.env.DODO_PRODUCT_ID || "").trim(),
          quantity: 1,
          amount: calc.chargeAmount * 100
        }
      ],
      return_url: `${APP_URL}/success`,
      metadata,
      feature_flags: { redirect_immediately: true }
    });
    if (session.session_id) {
      db.savePending({
        session_id: session.session_id,
        url,
        title,
        description,
        category,
        target_amount: calc.targetAmount,
        charge_amount: calc.chargeAmount
      });
    }
    res.json({ checkout_url: session.checkout_url, session_id: session.session_id });
  } catch (err) {
    console.error("Dodo checkout failed:", err?.status || "", err?.message || err, err?.error || "");
    const warnings = dodoEnvWarnings();
    const status = err?.status;
    let hint = "";
    if (status === 401 || /unauthorized/i.test(err?.message || "")) {
      hint =
        warnings[0] ||
        "Dodo rejected the API key. Re-check DODO_PAYMENTS_API_KEY on Railway (no extra spaces), that it's a " +
          (dodoEnvMode() === "live_mode" ? "live" : "test") +
          "-mode key matching DODO_ENVIRONMENT/DODO_PAYMENTS_ENVIRONMENT (currently resolving to " +
          dodoEnvMode() +
          "), and that DODO_PRODUCT_ID was created in that same mode.";
    }
    res.status(500).json({
      error: (err.message || "Checkout failed") + (hint ? " — " + hint : ""),
      dodoStatus: status || null
    });
  }
});

async function handleDodoWebhook(req, res) {
  try {
    const webhookId = req.header("webhook-id") || req.header("Webhook-Id");
    const webhookKey = (process.env.DODO_PAYMENTS_WEBHOOK_KEY || "").trim();
    let payload;

    if (webhookKey) {
      // Verify this really came from Dodo before trusting anything in it.
      // Without this, anyone who finds this URL could POST a fake
      // "payment succeeded" event and claim a rank for free.
      //
      // NOTE: we verify with the `standardwebhooks` library directly rather
      // than the dodopayments SDK's `client.webhooks.unwrap()` convenience
      // wrapper. That wrapper isn't present on every published SDK version
      // (confirmed: it throws "client.webhooks.unwrap is not a function" on
      // the version range this app installs), while `standardwebhooks` is
      // the actual verification implementation underneath it and is a
      // guaranteed, directly-installed dependency here.
      const rawBodyStr = (req.rawBody || Buffer.from("")).toString();
      if (!rawBodyStr) {
        // The global JSON body parser didn't capture a raw body for this
        // request — usually a Content-Type mismatch. Signature verification
        // can never succeed against an empty body, so surface this clearly
        // instead of a generic "invalid signature".
        console.error(
          "Webhook body was empty when verifying — Content-Type received:",
          req.header("content-type") || "(none)"
        );
        return res.status(401).json({
          error: "invalid signature",
          detail: "empty raw body — content-type was " + (req.header("content-type") || "(none)")
        });
      }
      try {
        const { Webhook } = require("standardwebhooks");
        const wh = new Webhook(webhookKey);
        payload = wh.verify(rawBodyStr, {
          "webhook-id": req.header("webhook-id") || "",
          "webhook-signature": req.header("webhook-signature") || "",
          "webhook-timestamp": req.header("webhook-timestamp") || ""
        });
      } catch (verifyErr) {
        const detail = String(verifyErr?.message || verifyErr);
        console.error("Webhook signature verification failed:", detail);
        // Surfaced in the response body so it shows up directly in Dodo's
        // dashboard (click the failed attempt) without needing server logs.
        return res.status(401).json({ error: "invalid signature", detail });
      }
    } else {
      // No DODO_PAYMENTS_WEBHOOK_KEY set — accept unverified (fine for local/demo
      // testing only; set the webhook key on Railway before going live).
      console.warn("DODO_PAYMENTS_WEBHOOK_KEY is not set — accepting this webhook without signature verification.");
      payload = req.body || {};
    }

    const type = payload.type || payload.event_type;
    const data = payload.data || payload;
    if (type && type !== "payment.succeeded" && data.payment_status !== "succeeded") {
      return res.json({ ignored: type || "unknown" });
    }
    const meta = data.metadata || payload.metadata || {};
    const amountCents = data.total_amount || data.settlement_amount || data.amount;
    const charge =
      Number(meta.charge_amount) ||
      (amountCents ? Math.round(Number(amountCents) / 100) : 0);
    const url = meta.url;
    if (!url || !charge) return res.json({ skipped: true });
    db.applyPayment({
      url,
      title: meta.title,
      description: meta.description,
      category: meta.category,
      amount: charge,
      dodoPaymentId: data.payment_id || data.id,
      webhookId
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "webhook failed" });
  }
}

// Registered on both paths: /webhook/dodo (this app's original convention)
// and /api/webhooks/dodo (the URL that's actually configured in the Dodo
// dashboard for outking.lol) — so it works regardless of which one Dodo
// has on file, with no dashboard changes required.
app.post("/webhook/dodo", handleDodoWebhook);
app.post("/api/webhooks/dodo", handleDodoWebhook);

// Lightweight admin cleanup — protected by the same secret you already set
// as MAINTENANCE_BYPASS_TOKEN on Railway. Use this to remove stray/test
// listings (like leftover demo entries) without a code redeploy.
//   List:   GET  /admin/listings?token=YOUR_TOKEN
//   Delete: GET  /admin/delete/:idOrSlug?token=YOUR_TOKEN
function checkAdminToken(req, res) {
  const token = (process.env.MAINTENANCE_BYPASS_TOKEN || "").trim();
  if (!token || req.query.token !== token) {
    res.status(403).json({ error: "forbidden — pass ?token=<your MAINTENANCE_BYPASS_TOKEN>" });
    return false;
  }
  return true;
}
app.get("/admin/listings", (req, res) => {
  if (!checkAdminToken(req, res)) return;
  const rows = db.ranked("all").map((r) => ({ id: r.id, slug: r.slug, title: r.title, amount: r.amount, rank: r.rank }));
  res.json(rows);
});
app.get("/admin/delete/:idOrSlug", (req, res) => {
  if (!checkAdminToken(req, res)) return;
  const ok = db.deleteListing(req.params.idOrSlug);
  res.json(ok ? { deleted: req.params.idOrSlug } : { error: "not found", idOrSlug: req.params.idOrSlug });
});

app.get("/go/:slug", (req, res) => {
  const row = db.recordClick(req.params.slug);
  if (!row) return res.redirect("/");
  res.redirect(row.url);
});

app.get("/success", (req, res) => {
  // Dodo redirects here with ?payment_id=...&status=...&email=... — NOT a
  // session_id. This page is purely informational: the listing is actually
  // credited by the /webhook/dodo handler (the verified, tamper-proof
  // source of truth), which usually lands within a few seconds of this
  // redirect, sometimes slightly after the browser gets here.
  const status = req.query.status || (req.query.demo ? "succeeded" : null);
  res.send(page("success", successPage(status)));
});

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_DESCRIPTION =
  "A pay-to-rank leaderboard. Claim a rank for $1, pay what you want, and anyone can outbid you for $1 more. No ads, no accounts — just the board.";

function layout(title, body, extra = "") {
  const path = extra.path || "/";
  const description = (extra.description || DEFAULT_DESCRIPTION).slice(0, 300);
  const canonical = `${APP_URL}${path === "/" ? "/" : path}`;
  const ogImage = `${APP_URL}/og-image.png`;
  const pageTitle = title === APP_NAME ? `${APP_NAME} — Pay to rank #1` : `${esc(title)} · ${esc(APP_NAME)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${pageTitle}</title>
<meta name="description" content="${esc(description)}"/>
<link rel="canonical" href="${esc(canonical)}"/>
<meta name="theme-color" content="#101218"/>
<meta name="robots" content="index, follow"/>

<link rel="icon" href="/favicon.ico" sizes="any"/>
<link rel="icon" href="/icon-512.png" type="image/png" sizes="512x512"/>
<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
<link rel="manifest" href="/manifest.webmanifest"/>

<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${esc(APP_NAME)}"/>
<meta property="og:title" content="${esc(title)}${title === APP_NAME ? " — Pay to rank #1" : ` · ${esc(APP_NAME)}`}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:url" content="${esc(canonical)}"/>
<meta property="og:image" content="${esc(ogImage)}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>

<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}${title === APP_NAME ? " — Pay to rank #1" : ` · ${esc(APP_NAME)}`}"/>
<meta name="twitter:description" content="${esc(description)}"/>
<meta name="twitter:image" content="${esc(ogImage)}"/>

<link rel="stylesheet" href="/static/styles.css?v=${STATIC_VERSION}"/>
</head>
<body>
<div class="bg-glow"></div>
<header class="top">
  <a class="brand" href="/">${esc(APP_NAME)}</a>
  <div class="live" id="liveStats">loading stats…</div>
  <nav>
    <a href="/today">Today</a>
    <a href="/daily">Daily</a>
    <a href="/categories">Explore</a>
    <button class="theme" id="themeBtn" type="button" title="Toggle theme" aria-label="Toggle theme"><span id="themeIcon">◐</span></button>
  </nav>
</header>
${body}
<footer class="foot">
  <a href="/faq">FAQ</a>
  <a href="/rules">Rules</a>
  <a href="/about">About</a>
  <a href="/terms">Terms</a>
  <a href="/privacy">Privacy</a>
  <span>ranks are what you pay</span>
</footer>
<script>window.RW_BOARD=${JSON.stringify(extra.board || "all")};window.RW_CATEGORY=${JSON.stringify(extra.category || null)};</script>
<script src="/static/app.js?v=${STATIC_VERSION}"></script>
</body></html>`;
}

function page(name, inner, extra) {
  return layout(name, inner, extra || {});
}

function boardPage(board, category) {
  const cat = category ? db.CATEGORIES.find((c) => c.slug === category) : null;
  const title = cat ? cat.name : board === "today" ? "Today" : board === "daily" ? "Daily" : APP_NAME;
  return layout(
    title,
    `<main class="shell">
      <aside class="rail left" id="railLeft"></aside>
      <section class="stage">
        <p class="kicker">${cat ? esc(cat.name) : board === "all" ? "All-time board" : board === "today" ? "Rolling 24 hours" : "UTC calendar day"}</p>
        <h1 id="claimTitle">Claim #1</h1>
        <form class="claim" id="claimForm">
          <input name="url" required placeholder="https://yourproduct.com or @handle"/>
          <select name="category" required>
            <option value="">Choose a category</option>
            ${db.CATEGORIES.map((c) => `<option value="${c.slug}" ${category === c.slug ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
          </select>
          <div class="amt">
            <button type="button" id="minus">−</button>
            <input name="amount" id="amount" type="number" min="${MIN}" max="${MAX}" step="1" value="${MIN}"/>
            <button type="button" id="plus">+</button>
          </div>
          <button class="go" type="submit" id="claimSubmit">Claim rank</button>
        </form>
        <div class="urlpreview" id="urlPreview" hidden>
          <img class="urlpreview-logo" id="upLogo" alt="" />
          <div class="urlpreview-body">
            <b id="upTitle"></b>
            <p id="upDesc"></p>
            <span class="urlpreview-note" id="upNote"></span>
          </div>
        </div>
        <p class="hint" id="hint"></p>
        <div id="list"></div>
        <section class="activity-block">
          <h2>Latest activity</h2>
          <ul id="activity"></ul>
        </section>
      </section>
      <aside class="rail right" id="railRight"></aside>
    </main>`,
    {
      board,
      category,
      path: category ? `/category/${category}` : board === "today" ? "/today" : board === "daily" ? "/daily" : "/",
      description: cat
        ? `See the top-ranked ${cat.name} listings on ${APP_NAME} — pay to rank, $1 to start.`
        : DEFAULT_DESCRIPTION
    }
  );
}

function successPage(status) {
  let heading = "Payment received";
  let body = "Your rank should appear on the board within a few seconds — refresh if you don't see it right away.";
  if (status === "failed" || status === "cancelled") {
    heading = "Payment not completed";
    body = "The payment didn't go through, so no rank was claimed and nothing was charged. You can try again from the board.";
  } else if (status === "processing") {
    heading = "Payment processing";
    body = "Dodo is still confirming this payment. Your rank will appear on the board automatically once it clears — no need to try again.";
  }
  return `<main class="doc"><h1>${esc(heading)}</h1>
  <p>${esc(body)}</p>
  <p><a class="go" href="/">Back to the board</a></p></main>`;
}

app.get("/", (req, res) => res.send(boardPage("all")));
app.get("/today", (req, res) => res.send(boardPage("today")));
app.get("/daily", (req, res) => res.send(boardPage("daily")));
app.get("/categories", (req, res) => {
  const groups = db.CATEGORIES.map((c) => {
    const rows = db.ranked("all", c.slug).slice(0, 3);
    return `<a class="cat-card" href="/category/${c.slug}">
      <strong>${esc(c.name)}</strong>
      <em>${rows.length} on the board</em>
      <ol>${rows.map((r) => `<li>#${r.rank} ${esc(r.title)} · $${r.amount}</li>`).join("")}</ol>
    </a>`;
  }).join("");
  res.send(
    layout("Explore", `<main class="doc"><h1>Explore categories</h1><div class="cats">${groups}</div></main>`, {
      path: "/categories",
      description: `Browse every category on ${APP_NAME} — SEO, dev tools, crypto, hiring, and more, ranked by who paid the most.`
    })
  );
});
app.get("/category/:slug", (req, res) => {
  const c = db.CATEGORIES.find((x) => x.slug === req.params.slug);
  if (!c) return res.redirect("/categories");
  res.send(boardPage("all", c.slug));
});
app.get("/product/:slug", (req, res) => {
  const row = db.findBySlug(req.params.slug);
  if (!row) return res.status(404).send(layout("Not found", `<main class="doc"><h1>Not listed</h1></main>`));
  const ranked = db.ranked("all");
  const r = ranked.find((x) => x.id === row.id);
  res.send(
    layout(
      row.title,
      `<main class="doc">
        <p class="kicker">#${r ? r.rank : "—"} · $${row.amount} · ${row.clicks} clicks</p>
        <h1>${esc(row.title)}</h1>
        <p>${esc(row.description)}</p>
        <p><a href="/go/${esc(row.slug)}" target="_blank" rel="noopener noreferrer">${esc(row.url)}</a></p>
        <p>Category: <a href="/category/${esc(row.category)}">${esc(row.category)}</a></p>
        <a class="go" href="/">Claim this rank</a>
      </main>`,
      {
        path: `/product/${row.slug}`,
        description: (row.description || `${row.title} is ranked #${r ? r.rank : "?"} on ${APP_NAME} for $${row.amount}.`).slice(0, 300)
      }
    )
  );
});

app.get("/faq", (req, res) => {
  res.send(
    layout(
      "FAQ",
      `<main class="doc">
      <h1>FAQ</h1>
      <h2>What is ${esc(APP_NAME)}?</h2>
      <p>A public product leaderboard where rank is what you pay. No ads, no API keys, no revenue share. List a website or X profile, pay, and sit above everyone who paid less.</p>
      <h2>How does it work?</h2>
      <p>Paste a URL or @handle, pick a category, pay. A completed Dodo payment claims the rank. New listings start at $${MIN}. Taking #1 costs at least $${TAKE_ONE_GAP} more than the current #1. Equal amounts keep the older listing higher.</p>
      <h2>Boards</h2>
      <p><b>All-time</b> never expires. <b>Today</b> is a rolling 24 hours. <b>Daily</b> is midnight–midnight UTC and then freezes.</p>
      <h2>Can I raise later?</h2>
      <p>Yes. Submit the same URL again. Checkout only charges the difference. Someone else cannot steal your rank by paying only that difference.</p>
      <h2>Refunds?</h2>
      <p>No. Payments are final.</p>
      <h2>How do I pay?</h2>
      <p>Checkout runs through Dodo Payments. Card details never touch this server.</p>
      </main>`
    )
  );
});
app.get("/rules", (req, res) => {
  res.send(
    layout(
      "Rules",
      `<main class="doc">
      <h1>Rules</h1>
      <p>Rank is what you pay — nothing else.</p>
      <ul>
        <li>Whole US dollars, $${MIN} minimum, $${MAX.toLocaleString()} maximum, $1 steps.</li>
        <li>Taking #1 costs at least $${TAKE_ONE_GAP} more than the current #1.</li>
        <li>Raises must be $1 above your current total. Checkout charges the difference only.</li>
        <li>Product websites or X handles you are authorized to represent.</li>
        <li>No Telegram / WhatsApp / Discord / Signal invite links.</li>
        <li>No NSFW or adult platforms.</li>
        <li>Query strings are stripped. Shorteners are resolved.</li>
        <li>Payments are not refundable.</li>
      </ul>
      </main>`
    )
  );
});
app.get("/about", (req, res) => {
  const s = db.stats();
  res.send(
    layout(
      "About",
      `<main class="doc">
      <h1>About</h1>
      <p>${esc(APP_NAME)} is a pay-to-rank board with a live bubble wall for the top 20 paid listings — 10 on the left, 10 on the right.</p>
      <p>Same ranking rules as the original public boards: money is the sort key. Checkout is Dodo Payments. Hosting is Railway.</p>
      <p>Live snapshot: <b>${s.listings}</b> listings · <b>$${s.paid}</b> paid · <b>${s.clicks}</b> outbound clicks.</p>
      </main>`
    )
  );
});
app.get("/terms", (req, res) => {
  res.send(
    layout(
      "Terms",
      `<main class="doc">
      <h1>Terms of Service</h1>
      <p>Listings are paid placements, not endorsements. You must own or be authorized to represent the URL or profile. Payments are processed by Dodo Payments in USD, final and non-refundable. We may remove listings that break the rules without a refund. The service is provided as-is. Liability is limited to amounts paid for listings in the prior three months.</p>
      <p>Contact ${esc(process.env.CONTACT_EMAIL || "you@example.com")}.</p>
      </main>`
    )
  );
});
app.get("/privacy", (req, res) => {
  res.send(
    layout(
      "Privacy",
      `<main class="doc">
      <h1>Privacy</h1>
      <p>We store the URL you submit, category, rank amounts, click counts, and Dodo payment identifiers. Card data is collected by Dodo Payments, not by us. A visitor cookie is used only for rate limiting clicks. Theme preference stays in localStorage.</p>
      </main>`
    )
  );
});

app.listen(PORT, () => {
  console.log(`${APP_NAME} on ${APP_URL} (port ${PORT})`);
});
