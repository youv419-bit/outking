#!/usr/bin/env node
/**
 * Dev-only: renders public/og.png (the default Open Graph card) from a small
 * HTML template using Playwright's bundled Chromium.
 *
 *   npx playwright install chromium && node scripts/generate-og.mjs
 *
 * The output is committed, so a normal build never needs Playwright.
 * Per-position OG cards are generated at request time by
 * src/app/[position]/opengraph-image.tsx and do not use this script.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'public', 'og.png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; background:#050506; color:#ece9e3;
    font-family: Lora, 'DejaVu Serif', Georgia, serif; overflow:hidden; }
  .wrap { position:relative; width:100%; height:100%; padding:70px 78px;
    display:flex; flex-direction:column; justify-content:space-between;
    background:
      radial-gradient(900px 520px at 78% 18%, rgba(212,172,92,0.22), transparent 62%),
      radial-gradient(700px 500px at 12% 92%, rgba(70,90,255,0.14), transparent 60%),
      linear-gradient(140deg, #08080b 0%, #0d0c0f 60%, #050506 100%);
  }
  .rule { position:absolute; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(212,172,92,.45),transparent); }
  .top { display:flex; align-items:center; gap:20px; }
  .king { font-size:56px; color:#d4ac5c; font-family:'DejaVu Sans', sans-serif; line-height:1; }
  .brand { font-family:'DejaVu Sans', sans-serif; font-size:22px; letter-spacing:.42em;
    color:rgba(236,233,227,.55); text-transform:uppercase; }
  h1 { font-size:104px; line-height:.98; font-weight:700; letter-spacing:-.01em;
    background:linear-gradient(180deg,#f9f0d9 0%,#e0bf7d 52%,#a97c33 100%);
    -webkit-background-clip:text; background-clip:text; color:transparent; }
  .sub { margin-top:26px; font-family:'DejaVu Sans', sans-serif; font-size:31px;
    color:rgba(236,233,227,.62); letter-spacing:.01em; }
  .foot { display:flex; align-items:center; justify-content:space-between; }
  .pill { font-family:'DejaVu Sans', sans-serif; font-size:19px; letter-spacing:.26em;
    text-transform:uppercase; color:#e3c583; border:1px solid rgba(212,172,92,.45);
    padding:13px 26px; border-radius:999px; }
  .supply { font-family:'DejaVu Sans', sans-serif; font-size:19px; letter-spacing:.26em;
    text-transform:uppercase; color:rgba(236,233,227,.35); }
</style></head><body><div class="wrap">
  <div class="rule" style="top:0"></div>
  <div class="top"><div class="king">&#9818;</div><div class="brand">ChessBid</div></div>
  <div>
    <h1>BECOME<br/>THE KING.</h1>
    <div class="sub">Own it. Defend it. Outbid anyone.</div>
  </div>
  <div class="foot">
    <div class="pill">Enter the board</div>
    <div class="supply">16 positions &middot; one owner each</div>
  </div>
  <div class="rule" style="bottom:0"></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: out });
await browser.close();
console.log('[og] wrote', out);
