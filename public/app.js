function applyTheme(mode) {
  if (mode === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  const icon = document.getElementById("themeIcon");
  if (icon) icon.textContent = mode === "light" ? "☀" : "☾";
  const btn = document.getElementById("themeBtn");
  if (btn) btn.setAttribute("aria-pressed", mode === "light" ? "true" : "false");
}

let savedTheme = "combo";
try {
  savedTheme = localStorage.getItem("rw-theme") || "combo";
} catch {}
applyTheme(savedTheme);

document.getElementById("themeBtn")?.addEventListener("click", () => {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const next = isLight ? "combo" : "light";
  applyTheme(next);
  try {
    localStorage.setItem("rw-theme", next);
  } catch {}
});

function initial(title, url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("x.com")) return "@";
    return (title || u.hostname).replace(/^www\./, "").slice(0, 2).toUpperCase();
  } catch {
    return "#";
  }
}

function favicon(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent("https://" + host)}`;
  } catch {
    return "";
  }
}

function fmtClicks(n) {
  n = Number(n) || 0;
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k clicks";
  return n.toLocaleString() + (n === 1 ? " click" : " clicks");
}

function bubbleEl(item, size) {
  const a = document.createElement("a");
  a.className = "bubble";
  a.href = "/product/" + item.slug;
  const orb = document.createElement("div");
  orb.className = "orb";
  orb.style.width = orb.style.height = size + "px";
  const img = document.createElement("img");
  img.src = favicon(item.url);
  img.alt = "";
  img.onerror = () => {
    img.remove();
    orb.textContent = initial(item.title, item.url);
  };
  orb.appendChild(img);
  a.appendChild(orb);
  const b = document.createElement("b");
  b.textContent = item.title.split(/[—·|]/)[0].trim().slice(0, 16);
  const s = document.createElement("span");
  s.textContent = "$" + item.amount.toLocaleString();
  const c = document.createElement("small");
  c.textContent = fmtClicks(item.clicks);
  a.appendChild(b);
  a.appendChild(s);
  a.appendChild(c);
  return a;
}

function renderBubbles(items) {
  const left = document.getElementById("railLeft");
  const right = document.getElementById("railRight");
  if (!left || !right) return;
  const top = items.slice(0, 10);
  const next = items.slice(10, 20);
  left.innerHTML = `<h3>TOP 10</h3><div class="bubbles" id="bL"></div>`;
  right.innerHTML = `<h3>LIVE WALL <span class="dot"></span></h3><div class="wall" id="bR"></div><div class="happened" id="happened"></div>`;
  const bL = left.querySelector("#bL");
  const bR = right.querySelector("#bR");
  const max = top[0]?.amount || 1;
  top.forEach((it) => bL.appendChild(bubbleEl(it, 48 + Math.round((it.amount / max) * 22))));
  next.forEach((it) => {
    const a = document.createElement("a");
    a.className = "wall-row";
    a.href = "/product/" + it.slug;
    a.innerHTML = `<div class="orb sm"><img src="${favicon(it.url)}" alt=""></div><div><b>${it.title.split(/[—·|]/)[0].trim().slice(0, 18)}</b><span>$${it.amount.toLocaleString()} · ${fmtClicks(it.clicks)}</span></div>`;
    bR.appendChild(a);
  });
}

function renderList(rows) {
  const box = document.getElementById("list");
  if (!box) return;
  box.innerHTML = "";
  rows.forEach((row) => {
    const el = document.createElement("article");
    el.className = "card";
    const claimFor = row.amount + 1;
    el.innerHTML = `
      <div class="rank">#${row.rank}</div>
      <div>
        <h3><a href="/product/${row.slug}">${escapeHtml(row.title)}</a></h3>
        <p>${escapeHtml(row.description || row.url)}</p>
        <div class="meta"><a href="/category/${row.category}">${row.category}</a> · ${row.clicks.toLocaleString()} clicks · <a href="/go/${row.slug}" target="_blank" rel="noopener noreferrer">visit ↗</a></div>
      </div>
      <div class="price">$${row.amount.toLocaleString()}</div>
      <button class="take" data-amount="${claimFor}" data-url="${escapeHtml(row.url)}" data-cat="${row.category}">claim this rank for $${claimFor.toLocaleString()}</button>
    `;
    box.appendChild(el);
  });
  box.querySelectorAll(".take").forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = document.getElementById("claimForm");
      if (!form) return;
      form.url.value = btn.dataset.url;
      form.category.value = btn.dataset.cat;
      form.amount.value = btn.dataset.amount;
      form.scrollIntoView({ behavior: "smooth" });
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function load() {
  const params = new URLSearchParams({
    board: window.RW_BOARD || "all",
    category: window.RW_CATEGORY || ""
  });
  const res = await fetch("/api/state?" + params.toString());
  const data = await res.json();
  const live = document.getElementById("liveStats");
  if (live) {
    live.textContent = `${data.stats.online} online · ${data.stats.visitors.toLocaleString()} visitors · $${data.stats.paid.toLocaleString()} paid`;
  }
  const title = document.getElementById("claimTitle");
  if (title) title.textContent = `Claim #1 for $${data.claim1.toLocaleString()}`;
  const amt = document.getElementById("amount");
  if (amt && Number(amt.value) <= 10) amt.value = data.claim1;
  renderBubbles(data.bubbles);
  renderList(data.listings);
  const happened = document.getElementById("happened");
  if (happened && data.activity[0]) happened.textContent = "JUST HAPPENED · " + data.activity[0].message;
  const act = document.getElementById("activity");
  if (act) {
    act.innerHTML = data.activity
      .map(
        (a) =>
          `<li>${escapeHtml(a.message)} · ${a.slug ? `<a href="/product/${a.slug}">details</a>` : ""}</li>`
      )
      .join("");
  }
}

const minus = document.getElementById("minus");
const plus = document.getElementById("plus");
const amount = document.getElementById("amount");
minus?.addEventListener("click", () => {
  amount.value = Math.max(1, Number(amount.value) - 1);
});
plus?.addEventListener("click", () => {
  amount.value = Number(amount.value) + 1;
});

const claimForm = document.getElementById("claimForm");
const urlPreview = document.getElementById("urlPreview");
const upLogo = document.getElementById("upLogo");
const upTitle = document.getElementById("upTitle");
const upDesc = document.getElementById("upDesc");
const upNote = document.getElementById("upNote");
const claimSubmit = document.getElementById("claimSubmit");

let previewTimer = null;
let previewSeq = 0;

async function runPreview() {
  if (!claimForm) return;
  const url = claimForm.url.value.trim();
  if (!url) {
    if (urlPreview) urlPreview.hidden = true;
    return;
  }
  const payload = {
    url,
    category: claimForm.category.value,
    amount: Number(claimForm.amount.value)
  };
  const seq = ++previewSeq;
  try {
    const prev = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then((r) => r.json());
    if (seq !== previewSeq) return; // a newer preview request landed first
    if (prev.error || !urlPreview) return;
    if (upLogo) {
      upLogo.src = favicon(payload.url);
      upLogo.onerror = () => {
        upLogo.style.visibility = "hidden";
      };
      upLogo.style.visibility = "visible";
    }
    if (upTitle) upTitle.textContent = prev.title || payload.url;
    if (upDesc) upDesc.textContent = prev.description || "";
    if (upNote) upNote.textContent = `${prev.note} You'll be charged $${Number(prev.chargeAmount).toLocaleString()}.`;
    urlPreview.hidden = false;
  } catch {
    // silent — this is just an informational preview, not blocking
  }
}

claimForm?.url.addEventListener("input", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 500);
});
claimForm?.category.addEventListener("change", runPreview);
amount?.addEventListener("change", runPreview);
amount?.addEventListener("input", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 500);
});

claimForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = {
    url: form.url.value,
    category: form.category.value,
    amount: Number(form.amount.value)
  };
  const hint = document.getElementById("hint");
  if (hint) hint.textContent = "";
  if (claimSubmit) claimSubmit.disabled = true;
  try {
    const out = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then((r) => r.json());
    if (out.error) throw new Error(out.error);
    if (out.checkout_url) {
      window.location.href = out.checkout_url;
      return;
    }
    throw new Error("Checkout did not return a payment link.");
  } catch (err) {
    if (hint) hint.textContent = err.message;
    else alert(err.message);
    if (claimSubmit) claimSubmit.disabled = false;
  }
});

// Every element load() touches is individually null-checked, so this is
// safe to run on every page (product pages included) — it's what keeps the
// header stats bar from being stuck on "loading stats..." forever there.
load();

// Keeps the "X online" number honest: the server only counts a visitor as
// online for 45s after it last heard from them, so a tab left open needs to
// keep checking in. Also refreshes the board every 20s so numbers update
// live without a manual page reload.
setInterval(() => {
  fetch("/api/heartbeat", { method: "POST" }).catch(() => {});
  load();
}, 20000);
