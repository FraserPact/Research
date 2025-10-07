// capture-home.js — captures homepage screenshots for all brands
// Output: Single "Home" folder with naming: "Homepage - {Brand} - {Desktop/Mobile}.png"

const { chromium, devices } = require("playwright");
const fs = require("fs-extra");
const path = require("path");

// ---------- BRANDS ----------
const BRANDS = [
  { name: "Alo",           url: "https://www.aloyoga.com/" },
  { name: "Bonobos",       url: "https://bonobos.com/" },
  { name: "Everlane",      url: "https://www.everlane.com/" },
  { name: "Faherty",       url: "https://fahertybrand.com/" },
  { name: "Gap",           url: "https://www.gap.com/" },
  { name: "Jcrew",         url: "https://www.jcrew.com/" },
  { name: "Jennikayne",    url: "https://jennikayne.com/" },
  { name: "Lululemon",     url: "https://shop.lululemon.com/" },
  { name: "Madewell",      url: "https://www.madewell.com/" },
  { name: "Marinelayer",   url: "https://www.marinelayer.com/" },
  { name: "Nike",          url: "https://www.nike.com/" },
  { name: "Onrunning",     url: "https://www.on-running.com/" },
  { name: "Outdoorvoices", url: "https://www.outdoorvoices.com/" },
  { name: "Quince",        url: "https://www.quince.com/" },
  { name: "Skims",         url: "https://www.skims.com/" },
  { name: "Trueclassic",   url: "https://www.trueclassic.com/" },
  { name: "Comfrt",        url: "https://www.comfrt.com/" },
];

// ---------- VIEWPORTS ----------
// Normal desktop width (1440px) with high resolution (2x scale factor)
const DESKTOP = {
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

// Mobile with high resolution
const MOBILE = {
  ...devices["iPhone 14 Pro"],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
};

// ---------- UTILS ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function toTop(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    window.scrollTo(0, 1);
    window.scrollTo(0, 0);
  });
  await sleep(500);
}

// Scroll through the page VERY SLOWLY to trigger ALL lazy content
async function primePage(page, ms = 20000) {
  try {
    console.log("    Scrolling to load all content...");
    await page.evaluate((timeout) => {
      return new Promise((resolve) => {
        const start = Date.now();
        const step = () => {
          const currentHeight = document.documentElement.scrollHeight;
          const scrolledToBottom =
            window.scrollY + window.innerHeight >= currentHeight - 10;
          const timeExpired = Date.now() - start > timeout;

          if (scrolledToBottom || timeExpired) {
            return resolve();
          }

          // Scroll SLOWLY in smaller increments
          window.scrollBy(0, 150);

          // Wait longer between scrolls for lazy loading
          setTimeout(step, 400);
        };
        step();
      });
    }, ms);

    console.log("    Waiting for content to settle...");
    await sleep(3000);
  } catch (e) {
    console.log(`    Scroll error (continuing): ${e.message}`);
  }

  await toTop(page);

  // Wait for network idle
  try {
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  } catch {}

  // Extra buffer
  await sleep(1500);
}

// ---------- POPUP HELPERS ----------
async function forAllFrames(page, fn) {
  const frames = page.frames();
  for (const fr of frames) {
    try {
      if (await fn(fr)) return true;
    } catch {}
  }
  return false;
}

async function removeByPredicateInFrame(frame, predicateSource) {
  try {
    await frame.evaluate((src) => {
      const pred = eval(src);
      const list = document.querySelectorAll("*");
      const kill = [];
      for (let i = 0; i < list.length; i++) {
        const el = list[i];
        try {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const id = (el.id || "").toLowerCase();
          const cls = (el.className || "").toString().toLowerCase();
          const txt = (el.textContent || "").toLowerCase();
          if (pred({ el, s, r, id, cls, txt })) kill.push(el);
        } catch {}
      }
      for (let j = 0; j < kill.length; j++) {
        try {
          kill[j].remove();
        } catch {}
      }
    }, predicateSource.toString());
  } catch {}
}

// Close cookie banners - VERY SPECIFIC, ID-based selectors only
async function closeCookies(page) {
  // Only use highly specific cookie button selectors - BUTTONS ONLY, no links
  const cookieSelectors = [
    "button#onetrust-accept-btn-handler",
    "button[id='onetrust-accept-btn-handler']",
    "button#truste-consent-button",
    "button.accept-cookies",
    "button[data-testid='cookie-accept']",
  ];

  for (const sel of cookieSelectors) {
    try {
      const clicked = await forAllFrames(page, async (fr) => {
        const loc = fr.locator(sel).first();
        if (await loc.count()) {
          try {
            await loc.click({ force: true, timeout: 1000 });
            await sleep(500);
            return true;
          } catch {}
        }
        return false;
      });
      if (clicked) {
        await sleep(1000);
        break;
      }
    } catch {}
  }

  // Last resort: remove fixed cookie bars by ID/class only
  await forAllFrames(page, (fr) =>
    removeByPredicateInFrame(fr, ({ s, r, id, cls }) =>
      (s.position === "fixed" || s.position === "sticky") &&
      r.height > 50 && r.height < 250 &&
      (id.includes("onetrust") || cls.includes("onetrust") || id.includes("cookie-banner"))
    )
  );
}

// Close promo popups - ONLY close buttons, NO text matching
async function closePromos(page, brand) {
  // Extended list of close button selectors including X buttons
  const closeSel = [
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
    "svg[aria-label='Close']",
  ];

  // Try multiple times to catch late-appearing popups
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const sel of closeSel) {
      try {
        const clicked = await forAllFrames(page, async (fr) => {
          const loc = fr.locator(sel).first();
          if (await loc.count()) {
            try {
              await loc.click({ force: true, timeout: 1000 });
              await sleep(500);
              return true;
            } catch {}
          }
          return false;
        });
        if (clicked) {
          await sleep(1000);
        }
      } catch {}
    }
    await sleep(500);
  }

  // Remove modal overlays
  await forAllFrames(page, (fr) =>
    removeByPredicateInFrame(fr, ({ s, r, id, cls }) =>
      (s.position === "fixed" || s.position === "sticky") &&
      r.width > 250 && r.height > 150 &&
      ((s.zIndex && parseInt(s.zIndex) > 999) || cls.includes("modal") || id.includes("modal") ||
       cls.includes("popup") || cls.includes("newsletter") || id.includes("popup"))
    )
  );

  // Press Escape key multiple times
  try {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Escape");
      await sleep(400);
    }
  } catch {}
}

// Settle page thoroughly
async function settle(page, brand) {
  console.log("    Waiting for initial load...");

  // Give page extra time to load before any interaction
  await sleep(3000);

  console.log("    Closing popups...");

  // Multiple passes for popups
  for (let i = 0; i < 5; i++) {
    await closeCookies(page);
    await sleep(600);
    await closePromos(page, brand);
    await sleep(600);
  }

  // Scroll through page
  await primePage(page, 25000);

  // Final cleanup
  console.log("    Final cleanup...");
  await closeCookies(page);
  await sleep(500);
  await closePromos(page, brand);
  await sleep(1000);

  // Extra wait for lazy images to load
  console.log("    Waiting for images to load...");
  await sleep(3000);
}

// ---------- CAPTURE ----------
async function capture(browser, contextOptions, brand, url, outputPath) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();

  try {
    console.log(`    Loading ${url}...`);

    // Load page
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});

    // Wait for initial load
    try {
      await page.waitForLoadState("load", { timeout: 30000 });
    } catch {}

    await sleep(2000);

    // Handle popups and scroll
    await settle(page, brand);

    // Ensure we're at top
    await toTop(page);

    console.log("    Taking screenshot...");

    // Take screenshot
    await page.screenshot({ path: outputPath, fullPage: true });

    await ctx.close();
    return true;
  } catch (e) {
    await ctx.close();
    throw e;
  }
}

// ---------- MAIN ----------
(async () => {
  // Create output directory
  const outputDir = path.join(__dirname, "Home");
  await fs.ensureDir(outputDir);
  console.log(`📁 Output directory: ${outputDir}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-notifications", "--disable-blink-features=AutomationControlled"]
  });

  for (const { name, url } of BRANDS) {
    console.log(`\n→ ${name}:`);

    try {
      // Desktop screenshot
      const desktopPath = path.join(outputDir, `Homepage - ${name} - Desktop.png`);
      console.log(`  📱 Desktop:`);
      await capture(browser, DESKTOP, name, url, desktopPath);
      console.log(`  ✓ Desktop saved`);

      // Mobile screenshot
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
  console.log("\n✔ All screenshots captured!");
  console.log(`📂 Check the "Home" folder for your screenshots`);
})().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
