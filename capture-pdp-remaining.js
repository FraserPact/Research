// capture-pdp-remaining.js — Capture remaining PDP screenshots
// Missing brands: Jennikayne, Lululemon, Madewell, Marinelayer, Nike, Onrunning, Outdoorvoices, Quince, Skims, Trueclassic, Comfrt

const { chromium, devices } = require("playwright");
const fs = require("fs-extra");
const path = require("path");

// ---------- REMAINING BRANDS ----------
const BRANDS = [
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
  { name: "Comfrt", url: "https://comfrt.com/products/cloud-tee?variant=44721180999724" },
];

// ---------- VIEWPORTS ----------
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

async function primePage(page, ms = 25000) {
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

          window.scrollBy(0, 150);
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

  try {
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  } catch {}

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

async function closeCookies(page) {
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

  await forAllFrames(page, (fr) =>
    removeByPredicateInFrame(fr, ({ s, r, id, cls }) =>
      (s.position === "fixed" || s.position === "sticky") &&
      r.height > 50 && r.height < 250 &&
      (id.includes("onetrust") || cls.includes("onetrust") || id.includes("cookie-banner"))
    )
  );
}

async function closePromos(page, brand) {
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

  await forAllFrames(page, (fr) =>
    removeByPredicateInFrame(fr, ({ s, r, id, cls }) =>
      (s.position === "fixed" || s.position === "sticky") &&
      r.width > 250 && r.height > 150 &&
      ((s.zIndex && parseInt(s.zIndex) > 999) || cls.includes("modal") || id.includes("modal") ||
       cls.includes("popup") || cls.includes("newsletter") || id.includes("popup"))
    )
  );

  try {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Escape");
      await sleep(400);
    }
  } catch {}
}

async function settle(page, brand) {
  console.log("    Waiting for initial load...");
  await sleep(3000);

  console.log("    Closing popups...");
  for (let i = 0; i < 5; i++) {
    await closeCookies(page);
    await sleep(600);
    await closePromos(page, brand);
    await sleep(600);
  }

  await primePage(page, 25000);

  console.log("    Final cleanup...");
  await closeCookies(page);
  await sleep(500);
  await closePromos(page, brand);
  await sleep(1000);

  console.log("    Waiting for images to load...");
  await sleep(3000);
}

async function capture(browser, contextOptions, brand, url, outputPath) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();

  try {
    console.log(`    Loading ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});

    try {
      await page.waitForLoadState("load", { timeout: 30000 });
    } catch {}

    await sleep(2000);
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

// ---------- MAIN ----------
(async () => {
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
      const desktopPath = path.join(outputDir, `PDP - ${name} - Desktop.png`);
      console.log(`  📱 Desktop:`);
      await capture(browser, DESKTOP, name, url, desktopPath);
      console.log(`  ✓ Desktop saved`);

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
  console.log("\n✔ All screenshots captured!");
  console.log(`📂 Check the "PDP" folder for your screenshots`);
})().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
