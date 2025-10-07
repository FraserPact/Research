// Fix remaining homepage issues
const { chromium, devices } = require("playwright");
const fs = require("fs-extra");
const path = require("path");

const BRANDS = [
  { name: "Gap", url: "https://www.gap.com/" },
  { name: "Jennikayne", url: "https://jennikayne.com/" },
  { name: "Madewell", url: "https://www.madewell.com/" },
  { name: "Nike", url: "https://www.nike.com/" },
  { name: "Outdoorvoices", url: "https://www.outdoorvoices.com/" },
];

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function toTop(page) {
  await page.evaluate(() => { window.scrollTo(0, 0); window.scrollTo(0, 1); window.scrollTo(0, 0); });
  await sleep(500);
}

async function primePage(page, ms = 30000) {
  try {
    await page.evaluate((timeout) => {
      return new Promise((resolve) => {
        const start = Date.now();
        const step = () => {
          if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 10 || Date.now() - start > timeout) return resolve();
          window.scrollBy(0, 100);
          setTimeout(step, 300);
        };
        step();
      });
    }, ms);
    await sleep(4000);
  } catch (e) {}
  await toTop(page);
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await sleep(2000);
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
  const selectors = [
    "button#onetrust-accept-btn-handler",
    "button[id='onetrust-accept-btn-handler']",
    "button#truste-consent-button",
  ];

  for (const sel of selectors) {
    try {
      const clicked = await forAllFrames(page, async (fr) => {
        const loc = fr.locator(sel).first();
        if (await loc.count()) {
          try { await loc.click({ force: true, timeout: 1000 }); await sleep(800); return true; } catch {}
        }
        return false;
      });
      if (clicked) { await sleep(1500); break; }
    } catch {}
  }

  await forAllFrames(page, (fr) =>
    removeByPredicate(fr, ({ s, r, id, cls }) =>
      (s.position === "fixed" || s.position === "sticky") && r.height > 50 && r.height < 300 &&
      (id.includes("onetrust") || cls.includes("onetrust") || id.includes("cookie") || cls.includes("cookie"))
    )
  );
}

async function closePromos(page) {
  const selectors = [
    "button[aria-label='Close']",
    "button[aria-label='close']",
    "button[title='Close']",
    "button.close",
    "button[class*='close']",
    "button[class*='Close']",
  ];

  for (let attempt = 0; attempt < 6; attempt++) {
    for (const sel of selectors) {
      try {
        const clicked = await forAllFrames(page, async (fr) => {
          const loc = fr.locator(sel).first();
          if (await loc.count()) {
            try { await loc.click({ force: true, timeout: 1000 }); await sleep(600); return true; } catch {}
          }
          return false;
        });
        if (clicked) await sleep(1000);
      } catch {}
    }
    await sleep(800);
  }

  await forAllFrames(page, (fr) =>
    removeByPredicate(fr, ({ s, r, cls, id }) =>
      (s.position === "fixed" || s.position === "sticky") && r.width > 200 && r.height > 100 &&
      ((s.zIndex && parseInt(s.zIndex) > 900) || cls.includes("modal") || cls.includes("popup") || cls.includes("dialog") || cls.includes("newsletter"))
    )
  );

  try { for (let i = 0; i < 5; i++) { await page.keyboard.press("Escape"); await sleep(500); } } catch {}
}

async function removeNavOverlays(page) {
  await forAllFrames(page, (fr) =>
    removeByPredicate(fr, ({ s, r, cls }) =>
      (s.position === "fixed" || s.position === "absolute") &&
      (cls.includes("nav") || cls.includes("menu") || cls.includes("dropdown")) &&
      r.width > 300 && r.height > 200
    )
  );
}

async function settle(page) {
  await sleep(4000);
  for (let i = 0; i < 8; i++) { await closeCookies(page); await sleep(800); await closePromos(page); await sleep(800); }
  await primePage(page, 30000);
  await closeCookies(page); await sleep(800); await closePromos(page); await sleep(800);
  await removeNavOverlays(page); await sleep(1000);
  await sleep(4000);
}

async function capture(browser, contextOptions, url, outputPath) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
    try { await page.waitForLoadState("load", { timeout: 40000 }); } catch {}
    await sleep(3000);
    await settle(page);
    await toTop(page);
    await page.screenshot({ path: outputPath, fullPage: true });
    await ctx.close();
  } catch (e) { await ctx.close(); throw e; }
}

(async () => {
  const outputDir = path.join(__dirname, "Home");
  const browser = await chromium.launch({ headless: true });

  for (const { name, url } of BRANDS) {
    console.log(`→ ${name}`);
    try {
      await capture(browser, DESKTOP, url, path.join(outputDir, `Homepage - ${name} - Desktop.png`));
      console.log(`  ✓ Desktop`);
      await capture(browser, MOBILE, url, path.join(outputDir, `Homepage - ${name} - Mobile.png`));
      console.log(`  ✓ Mobile`);
    } catch (e) { console.log(`✗ ${name}: ${e.message}`); }
  }

  await browser.close();
  console.log("✔ Done!");
})().catch(e => { console.error(e); process.exit(1); });
