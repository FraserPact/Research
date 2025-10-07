// Final missing screenshots
const { chromium, devices } = require("playwright");
const fs = require("fs-extra");
const path = require("path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DESKTOP = {
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const MOBILE = {
  ...devices["iPhone 14 Pro"],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
};

async function toTop(page) {
  await page.evaluate(() => { window.scrollTo(0, 0); window.scrollTo(0, 1); window.scrollTo(0, 0); });
  await sleep(500);
}

async function primePage(page) {
  try {
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const start = Date.now();
        const step = () => {
          if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 10 || Date.now() - start > 25000) return resolve();
          window.scrollBy(0, 150);
          setTimeout(step, 400);
        };
        step();
      });
    });
    await sleep(3000);
  } catch (e) {}
  await toTop(page);
  try { await page.waitForLoadState("networkidle", { timeout: 5000 }); } catch {}
  await sleep(1500);
}

async function forAllFrames(page, fn) {
  for (const fr of page.frames()) { try { if (await fn(fr)) return true; } catch {} }
  return false;
}

async function removeByPredicate(frame, predicateSource) {
  try {
    await frame.evaluate((src) => {
      const pred = eval(src);
      const kill = [];
      for (const el of document.querySelectorAll("*")) {
        try {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const id = (el.id || "").toLowerCase();
          const cls = (el.className || "").toString().toLowerCase();
          if (pred({ el, s, r, id, cls })) kill.push(el);
        } catch {}
      }
      kill.forEach(el => { try { el.remove(); } catch {} });
    }, predicateSource.toString());
  } catch {}
}

async function closeCookies(page) {
  for (const sel of ["button#onetrust-accept-btn-handler", "button#truste-consent-button"]) {
    try {
      const clicked = await forAllFrames(page, async (fr) => {
        const loc = fr.locator(sel).first();
        if (await loc.count()) { try { await loc.click({ force: true, timeout: 1000 }); await sleep(500); return true; } catch {} }
        return false;
      });
      if (clicked) { await sleep(1000); break; }
    } catch {}
  }
  await forAllFrames(page, (fr) => removeByPredicate(fr, ({ s, r, id, cls }) =>
    (s.position === "fixed" || s.position === "sticky") && r.height > 50 && r.height < 250 &&
    (id.includes("onetrust") || cls.includes("cookie"))
  ));
}

async function closePromos(page) {
  for (let i = 0; i < 3; i++) {
    for (const sel of ["button[aria-label='Close']", "button[title='Close']", "button.close"]) {
      try {
        const clicked = await forAllFrames(page, async (fr) => {
          const loc = fr.locator(sel).first();
          if (await loc.count()) { try { await loc.click({ force: true, timeout: 1000 }); await sleep(500); return true; } catch {} }
          return false;
        });
        if (clicked) await sleep(1000);
      } catch {}
    }
    await sleep(500);
  }
  await forAllFrames(page, (fr) => removeByPredicate(fr, ({ s, r, cls }) =>
    (s.position === "fixed" || s.position === "sticky") && r.width > 250 && r.height > 150 &&
    ((s.zIndex && parseInt(s.zIndex) > 999) || cls.includes("modal") || cls.includes("popup"))
  ));
  try { for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape"); await sleep(400); } } catch {}
}

async function settle(page) {
  await sleep(3000);
  for (let i = 0; i < 5; i++) { await closeCookies(page); await sleep(600); await closePromos(page); await sleep(600); }
  await primePage(page);
  await closeCookies(page); await sleep(500); await closePromos(page); await sleep(1000);
  await sleep(3000);
}

async function capture(browser, contextOptions, url, outputPath) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
    try { await page.waitForLoadState("load", { timeout: 30000 }); } catch {}
    await sleep(2000);
    await settle(page);
    await toTop(page);
    await page.screenshot({ path: outputPath, fullPage: true });
    await ctx.close();
  } catch (e) { await ctx.close(); throw e; }
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Trueclassic Mobile Homepage
  console.log("→ Trueclassic Mobile Homepage");
  await capture(browser, MOBILE, "https://www.trueclassic.com/", path.join(__dirname, "Home", "Homepage - Trueclassic - Mobile.png"));
  console.log("  ✓ Done");

  // Skims PDP Desktop & Mobile
  console.log("→ Skims PDP Desktop");
  await capture(browser, DESKTOP, "https://skims.com/products/relaxed-tees-t-shirt-light-heather-grey", path.join(__dirname, "PDP", "PDP - Skims - Desktop.png"));
  console.log("  ✓ Done");

  console.log("→ Skims PDP Mobile");
  await capture(browser, MOBILE, "https://skims.com/products/relaxed-tees-t-shirt-light-heather-grey", path.join(__dirname, "PDP", "PDP - Skims - Mobile.png"));
  console.log("  ✓ Done");

  // Trueclassic PDP Desktop & Mobile
  console.log("→ Trueclassic PDP Desktop");
  await capture(browser, DESKTOP, "https://www.trueclassictees.com/products/black-crew-neck-tee", path.join(__dirname, "PDP", "PDP - Trueclassic - Desktop.png"));
  console.log("  ✓ Done");

  console.log("→ Trueclassic PDP Mobile");
  await capture(browser, MOBILE, "https://www.trueclassictees.com/products/black-crew-neck-tee", path.join(__dirname, "PDP", "PDP - Trueclassic - Mobile.png"));
  console.log("  ✓ Done");

  // Comfrt PDP Desktop & Mobile
  console.log("→ Comfrt PDP Desktop");
  await capture(browser, DESKTOP, "https://comfrt.com/products/cloud-tee?variant=44721180999724", path.join(__dirname, "PDP", "PDP - Comfrt - Desktop.png"));
  console.log("  ✓ Done");

  console.log("→ Comfrt PDP Mobile");
  await capture(browser, MOBILE, "https://comfrt.com/products/cloud-tee?variant=44721180999724", path.join(__dirname, "PDP", "PDP - Comfrt - Mobile.png"));
  console.log("  ✓ Done");

  await browser.close();
  console.log("\n✔ All final screenshots complete!");
})().catch((e) => { console.error(e); process.exit(1); });
