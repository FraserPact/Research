// capture-pdp.js — captures PDP (Product Detail Page) screenshots for all brands
// Output: Single "PDP" folder with naming: "PDP - {Brand} - {Desktop/Mobile}.png"

const { chromium, devices } = require("playwright");
const fs = require("fs-extra");
const path = require("path");

// ---------- BRANDS WITH PDP URLs ----------
const BRANDS = [
  { name: "Alo", url: "https://www.aloyoga.com/products/w1406r-alosoft-crop-finesse-short-sleeve-bone" },
  { name: "Bonobos", url: "https://bonobos.com/products/organic-cotton-tee?color=white" },
  { name: "Everlane", url: "https://www.everlane.com/products/womens-organic-cotton-box-cut-tee-faded-navy" },
  { name: "Faherty", url: "https://fahertybrand.com/collections/womens/products/sunwashed-essential-tee-harbor-haze-stripe/" },
  { name: "Gap", url: "https://www.gap.com/browse/product.do?pid=823321032&vid=1&pcid=17076&cid=17076#pdp-page-content" },
  { name: "Jcrew", url: "https://www.jcrew.com/m/womens/categories/clothing/tees-and-tanks/pointelle-short-sleeve-t-shirt-in-stripe/ME687?display=standard&fit=Classic&color_name=alexa-stripe-french-ivo&colorProductCode=CK325" },
  { name: "Jennikayne", url: "https://www.jennikayne.com/products/crosby-tee-navy" },
  { name: "Lululemon", url: "https://shop.lululemon.com/p/tops-short-sleeve/Love-Crew/_/prod8350092?color=35486" },
  { name: "Madewell", url: "https://www.madewell.com/p/womens/labels-we-love/dakota-for-madewell/the-dakota-perfect-crewneck-tee/NZ538/?ccode=WT0005" },
  { name: "Marinelayer", url: "https://www.marinelayer.com/collections/gals-tees-basics/products/lexi-rib-pointelle-tee" },
  { name: "Nike", url: "https://www.nike.com/t/dri-fit-womens-t-shirt-dM375qq5/DX0687-017" },
  { name: "Onrunning", url: "https://www.on.com/en-us/products/core-t-w-1we1058/womens/black-apparel-1WE10580553" },
  { name: "Outdoorvoices", url: "https://www.outdoorvoices.com/products/w-mustang-tee-orchid-dust" },
  { name: "Quince", url: "https://www.quince.com/women/tees/cotton-modal-crew-neck-tee?color=navy&gender=women&tracker=collection_page__%2Fwomen%2Ftees__Short%20Sleeve__0" },
  { name: "Skims", url: "https://skims.com/products/relaxed-tees-t-shirt-light-heather-grey" },
  { name: "Trueclassic", url: "https://www.trueclassictees.com/products/black-crew-neck-tee" },
  { name: "Comfrt", url: "https://comfrt.com/products/cloud-tee?variant=44721180999724" }
];

// ---------- VIEWPORTS ----------
const DESKTOP = {
  viewport: { width: 1920, height: 1080 },
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};
const MOBILE = { ...devices["iPhone 14 Pro"], viewport: { width: 390, height: 844 } };

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

// ---------- POPUP HELPERS (frames aware) ----------
async function clickByTextInFrame(frame, words, selectors = ["button", "a", "[role='button']", "div", "span"]) {
  for (const sel of selectors) {
    for (const word of words) {
      const loc = frame.locator(sel).filter({ hasText: new RegExp(word, "i") }).first();
      if (await loc.count()) {
        try {
          await loc.click({ force: true, timeout: 1000 });
          await sleep(300);
          return true;
        } catch {}
      }
    }
  }
  return false;
}

async function clickSelectorsInFrame(frame, selectors) {
  for (const sel of selectors) {
    const loc = frame.locator(sel).first();
    if (await loc.count()) {
      try {
        await loc.click({ force: true, timeout: 1000 });
        await sleep(300);
        return true;
      } catch {}
    }
  }
  return false;
}

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

// Close cookie banners AGGRESSIVELY
async function closeCookies(page) {
  const directSel = [
    "#onetrust-accept-btn-handler",
    "button#onetrust-accept-btn-handler",
    "#truste-consent-button",
    "button.cookie-accept",
    "button[aria-label*='accept' i]",
    "button[aria-label*='agree' i]",
    "button[title*='accept' i]",
    "[class*='accept'][class*='cookie']",
    "[class*='accept'][class*='consent']",
  ];
  const words = ["accept all", "accept cookies", "accept", "agree", "allow all", "allow", "ok", "okay", "got it", "continue", "i understand"];

  // Try direct selectors first
  const clicked1 = await forAllFrames(page, (fr) => clickSelectorsInFrame(fr, directSel));
  if (clicked1) await sleep(500);

  // Try text-based search
  const clicked2 = await forAllFrames(page, (fr) => clickByTextInFrame(fr, words));
  if (clicked2) await sleep(500);

  // Last resort: remove fixed/sticky cookie bars
  await forAllFrames(page, (fr) =>
    removeByPredicateInFrame(fr, ({ s, r, id, cls, txt }) =>
      (s.position === "fixed" || s.position === "sticky") &&
      r.height > 50 &&
      (txt.includes("cookie") || txt.includes("consent") || txt.includes("privacy") ||
       txt.includes("gdpr") || id.includes("consent") || cls.includes("consent") ||
       id.includes("onetrust") || cls.includes("onetrust") || cls.includes("cookie"))
    )
  );
}

// Close promo popups AGGRESSIVELY
async function closePromos(page, brand) {
  const declineWords = [
    "no thanks",
    "no, thanks",
    "not now",
    "maybe later",
    "decline",
    "no thank you",
    "close",
    "skip",
    "dismiss",
    "not interested"
  ];

  const closeSel = [
    "[aria-label='Close']",
    "[aria-label*='close' i]",
    "[aria-label*='dismiss' i]",
    "button[title*='close' i]",
    "button[class*='close']",
    ".close",
    ".modal-close",
    ".popup-close",
    ".icon-close",
    ".c-close",
    "[data-dismiss='modal']",
    "button.dismiss",
  ];

  // Try text-based close
  const clicked1 = await forAllFrames(page, (fr) => clickByTextInFrame(fr, declineWords));
  if (clicked1) await sleep(500);

  // Try selector-based close
  const clicked2 = await forAllFrames(page, (fr) => clickSelectorsInFrame(fr, closeSel));
  if (clicked2) await sleep(500);

  // Brand-specific handling
  if (brand.toLowerCase() === "skims" || brand.toLowerCase() === "faherty") {
    await forAllFrames(page, (fr) => clickByTextInFrame(fr, ["no thanks"]));
    await sleep(500);
  }

  // Last resort: remove big fixed modal overlays
  await forAllFrames(page, (fr) =>
    removeByPredicateInFrame(fr, ({ s, r, id, cls }) =>
      (s.position === "fixed" || s.position === "sticky") &&
      r.width > 250 && r.height > 150 &&
      ((s.zIndex && parseInt(s.zIndex) > 999) || cls.includes("modal") || id.includes("modal") ||
       cls.includes("popup") || cls.includes("newsletter") || cls.includes("promo") ||
       cls.includes("overlay") || id.includes("popup"))
    )
  );

  // Press Escape key
  try {
    await page.keyboard.press("Escape");
    await sleep(300);
  } catch {}
}

// Settle page thoroughly
async function settle(page, brand) {
  console.log("    Closing popups and cookies...");

  // Do MULTIPLE passes with longer waits
  for (let i = 0; i < 5; i++) {
    await closeCookies(page);
    await sleep(400);
    await closePromos(page, brand);
    await sleep(400);
  }

  // Scroll through page to load all content
  await primePage(page, 20000);

  // Final cleanup pass after scrolling
  console.log("    Final popup cleanup...");
  await closeCookies(page);
  await sleep(300);
  await closePromos(page, brand);
  await sleep(500);
}

// ---------- CAPTURE ----------
async function capture(browser, contextOptions, brand, url, outputPath) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();

  try {
    console.log(`    Loading ${url}...`);

    // Load page with longer timeout
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});

    // Wait for initial load
    try {
      await page.waitForLoadState("load", { timeout: 30000 });
    } catch {}

    await sleep(2000);

    // Handle all popups and scroll thoroughly
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
  const outputDir = path.join(__dirname, "PDP");
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
      const desktopPath = path.join(outputDir, `PDP - ${name} - Desktop.png`);
      console.log(`  📱 Desktop:`);
      await capture(browser, DESKTOP, name, url, desktopPath);
      console.log(`  ✓ Desktop saved`);

      // Mobile screenshot
      const mobilePath = path.join(outputDir, `PDP - ${name} - Mobile.png`);
      console.log(`  📱 Mobile:`);
      await capture(browser, MOBILE, name, url, mobilePath);
      console.log(`  ✓ Mobile saved`);

      console.log(`✓ ${name}: COMPLETE`);
    } catch (e) {
      console.log(`✗ ${name}: FAILED — ${e && e.message ? e.message : e}`);
    }
  }

  await browser.close();
  console.log("\n✔ All PDP screenshots captured!");
  console.log(`📂 Check the "PDP" folder for your screenshots`);
})().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
