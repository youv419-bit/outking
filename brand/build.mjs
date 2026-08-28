import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium } from 'playwright';

const dir = dirname(fileURLToPath(import.meta.url));
const mark = await readFile(join(dir, 'mark.svg'));

// Transparent mark, 1024px
await sharp(mark).resize(1024, 1024).png().toFile(join(dir, 'outking-mark.png'));

// Square avatar on the brand black
const avatar = (size) =>
  sharp({ create: { width: size, height: size, channels: 4, background: { r: 5, g: 5, b: 6, alpha: 1 } } });
await avatar(512)
  .composite([{ input: await sharp(mark).resize(340, 340).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile(join(dir, 'outking-avatar-512.png'));
await avatar(400)
  .composite([{ input: await sharp(mark).resize(266, 266).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile(join(dir, 'outking-avatar-400.png'));

const markDataUri = `data:image/svg+xml;base64,${mark.toString('base64')}`;

const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${w}px;height:${h}px;overflow:hidden;color:#ece9e3;
    font-family:Lora,'DejaVu Serif',Georgia,serif}
  .gold{background:linear-gradient(180deg,#f9f0d9 0%,#e0bf7d 52%,#a97c33 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .sans{font-family:'DejaVu Sans',sans-serif}
</style></head><body>${body}</body></html>`;

const browser = await chromium.launch();

// Horizontal wordmark, transparent
const wordmark = await browser.newPage({ viewport: { width: 1600, height: 420 } });
await wordmark.setContent(
  page(1600, 420, `<div style="width:100%;height:100%;display:flex;align-items:center;
    justify-content:center;gap:44px;background:transparent">
      <img src="${markDataUri}" style="width:250px;height:250px"/>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="gold" style="font-size:150px;font-weight:700;letter-spacing:-.01em;line-height:1">OUTKING</div>
        <div class="sans" style="font-size:26px;letter-spacing:.34em;color:rgba(236,233,227,.45);text-transform:uppercase">Own the piece</div>
      </div>
    </div>`),
);
await wordmark.screenshot({ path: join(dir, 'outking-wordmark.png'), omitBackground: true });

// X / Twitter header
const banner = await browser.newPage({ viewport: { width: 1500, height: 500 } });
await banner.setContent(
  page(1500, 500, `<div style="width:100%;height:100%;display:flex;align-items:center;
    justify-content:center;gap:52px;
    background:
      radial-gradient(820px 460px at 74% 22%, rgba(212,172,92,.24), transparent 62%),
      radial-gradient(620px 440px at 14% 88%, rgba(70,90,255,.15), transparent 60%),
      linear-gradient(140deg,#08080b 0%,#0d0c0f 60%,#050506 100%)">
      <img src="${markDataUri}" style="width:220px;height:220px"/>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="gold" style="font-size:118px;font-weight:700;line-height:1">OUTKING</div>
        <div class="sans" style="font-size:28px;color:rgba(236,233,227,.6)">Own the piece. Defend it. Outbid anyone.</div>
        <div class="sans" style="font-size:22px;letter-spacing:.28em;color:#e3c583;text-transform:uppercase">outking.lol</div>
      </div>
    </div>`),
);
await banner.screenshot({ path: join(dir, 'outking-banner-1500x500.png') });

await browser.close();
console.log('brand assets written');
