// Fix specific homepage issues
const { chromium, devices } = require("playwright");
const fs = require("fs-extra");
const path = require("path");

const BRANDS = [
  { name: "Comfrt", url: "https://www.comfrt.com/" },
  { name: "Faherty", url: "https://fahertybrand.com/" },
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
    console.log("    Scrolling...");
    await page.evaluate((timeout) => {
      return new Promise((resolve) => {
        const start = Date.now();
        const step = () => {
          const currentHeight = document.documentElement.scrollHeight;
          const scrolledToBottom = window.scrollY + window.innerHeight >= currentHeight - 10;
          const timeExpired = Date.now() - start > timeout;
          if (scrolledToBottom || timeExpired) return resolve();
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
  for (const fr of page.frames()) {
    try { if (await fn(fr)) return true; } catch {}
  }
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

// Aggressive cookie closing - ONLY buttons
async function closeCookies(page) {
  const selectors = [
    "button#onetrust-accept-btn-handler",
    "button[id='onetrust-accept-btn-handler']",
    "button#truste-consent-button",
    "button.accept-cookies",
    "button.cookie-accept",
    "button[data-cy='cookie-banner-accept']",
  ];

  for (const sel of selectors) {
    try {
      const clicked = await forAllFrames(page, async (fr) => {
        const loc = fr.locator(sel).first();
        if (await loc.count()) {
          try {
            await loc.click({ force: true, timeout: 1000 });
            await sleep(800);
            console.log(`      Clicked cookie: ${sel}`);
            return true;
          } catch {}
        }
        return false;
      });
      if (clicked) { await sleep(1500); break; }
    } catch {}
  }

  // Force remove cookie banners
  await forAllFrames(page, (fr) =>
    removeByPredicate(fr, ({ s, r, id, cls }) =>
      (s.position === "fixed" || s.position === "sticky") &&
      r.height > 50 && r.height < 300 &&
      (id.includes("onetrust") || cls.includes("onetrust") || id.includes("cookie") || cls.includes("cookie") || id.includes("consent"))
    )
  );
}

// Aggressive popup closing - many selectors
async function closePromos(page, brand) {
  const selectors = [
    "button[aria-label='Close']",
    "button[aria-label='Close dialog']",
    "button[aria-label='Close Dialog']",
    "button[aria-label='close']",
    "button[title='Close']",
    "button[data-testid='dialog-close']",
    "button[data-testid='modal-close']",
    "button.close",
    "button.modal-close",
    "button.popup-close",
    "[aria-label='Close'][role='button']",
    "button[class*='close']",
    "button[class*='Close']",
    ".close-button",
    "[data-dismiss='modal']",
  ];

  // Try 6 times to catch late popups
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const sel of selectors) {
      try {
        const clicked = await forAllFrames(page, async (fr) => {
          const loc = fr.locator(sel).first();
          if (await loc.count()) {
            try {
              await loc.click({ force: true, timeout: 1000 });
              await sleep(600);
              console.log(`      Clicked close: ${sel}`);
              return true;
            } catch {}
          }
          return false;
        });
        if (clicked) await sleep(1000);
      } catch {}
    }
    await sleep(800);
  }

  // Force remove modals/popups
  await forAllFrames(page, (fr) =>
    removeByPredicate(fr, ({ s, r, cls, id }) =>
      (s.position === "fixed" || s.position === "sticky") &&
      r.width > 200 && r.height > 100 &&
      ((s.zIndex && parseInt(s.zIndex) > 900) ||
       cls.includes("modal") || cls.includes("popup") || cls.includes("dialog") ||
       cls.includes("newsletter") || cls.includes("overlay") ||
       id.includes("modal") || id.includes("popup") || id.includes("dialog"))
    )
  );

  // Escape key spam
  try {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Escape");
      await sleep(500);
    }
  } catch {}
}

// Don't click on ANYTHING except close buttons and cookie buttons
async function removeNavOverlays(page) {
  // Remove any open navigation overlays
  await forAllFrames(page, (fr) =>
    removeByPredicate(fr, ({ s, r, cls, id }) =>
      (s.position === "fixed" || s.position === "absolute") &&
      (cls.includes("nav") || cls.includes("menu") || cls.includes("dropdown")) &&
      r.width > 300 && r.height > 200 &&
      s.display !== "none" && s.visibility !== "hidden"
    )
  );
}

async function settle(page, brand) {
  console.log("    Initial wait...");
  await sleep(4000);

  console.log("    Closing popups (aggressive)...");
  for (let i = 0; i < 8; i++) {
    await closeCookies(page);
    await sleep(800);
    await closePromos(page, brand);
    await sleep(800);
  }

  console.log("    Scrolling page...");
  await primePage(page, 30000);

  console.log("    Final cleanup...");
  await closeCookies(page);
  await sleep(800);
  await closePromos(page, brand);
  await sleep(800);
  await removeNavOverlays(page);
  await sleep(1000);

  console.log("    Final image wait...");
  await sleep(4000);
}

async function capture(browser, contextOptions, brand, url, outputPath) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();

  try {
    console.log(`    Loading ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});

    try {
      await page.waitForLoadState("load", { timeout: 40000 });
    } catch {}

    await sleep(3000);
    await settle(page, brand);
    await toTop(page);

    console.log("    Taking screenshot...");
    await page.screenshot({ path: outputPath, fullPage: true });

    await ctx.close();
    return true;
  } catch (e) {
    await ctx.close();
    throw e;
  }
}

(async () => {
  const outputDir = path.join(__dirname, "Home");
  await fs.ensureDir(outputDir);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-notifications", "--disable-blink-features=AutomationControlled"]
  });

  for (const { name, url } of BRANDS) {
    console.log(`\n→ ${name}:`);

    try {
      const desktopPath = path.join(outputDir, `Homepage - ${name} - Desktop.png`);
      console.log(`  📱 Desktop:`);
      await capture(browser, DESKTOP, name, url, desktopPath);
      console.log(`  ✓ Desktop saved`);

      const mobilePath = path.join(outputDir, `Homepage - ${name} - Mobile.png`);
      console.log(`  📱 Mobile:`);
      await capture(browser, MOBILE, name, url, mobilePath);
      console.log(`  ✓ Mobile saved`);

      console.log(`✓ ${name}: COMPLETE`);
    } catch (e) {
      console.log(`✗ ${name}: FAILED — ${e && e.message ? e.message : e}`);
    }
  }

  await browser.close();
  console.log("\n✔ All fixed!");
})().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
