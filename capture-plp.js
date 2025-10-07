// PLP (Product Listing Pages) capture script
const { chromium, devices } = require("playwright");
const fs = require("fs-extra");
const path = require("path");

const BRANDS = [
  { name: "Alo", url: "https://www.aloyoga.com/collections/womens-shop-all?Product+Type=Women%3ATops%3ATanks" },
  { name: "Bonobos", url: "https://bonobos.com/shop/clothing/tees?shirt-fit=Slim&shirt-size=L&base-color=Navy%20Blue" },
  { name: "Faherty", url: "https://fahertybrand.com/collections/womens?page=1&filters%5Btag_gender%5D=Women&filters%5Btag_category%5D=T-shirts+Tanks+Henleys+Polos&filters%5Btag_style%5D=Crewnecks" },
  { name: "Jcrew", url: "https://www.jcrew.com/plp/womens/categories/clothing/tees-and-tanks?sub-categories=tees-and-tanks-tops" },
  { name: "Lululemon", url: "https://shop.lululemon.com/c/women-grey-t-shirts/n16lm0z93tyzwx7w" },
  { name: "Madewell", url: "https://www.madewell.com/womens/clothing/tops-shirts/?r_size=L&r_sleeveLength=Short%20Sleeve" },
  { name: "Marinelayer", url: "https://www.marinelayer.com/collections/gals-tees-basics?filter.p.m.custom.product_category=gid%3A%2F%2Fshopify%2FMetaobject%2F172895469642" },
  { name: "Nike", url: "https://www.nike.com/w/womens-tops-t-shirts-2qo0bz3wdkxz5e1x6z8dhfrz9om13" },
  { name: "Onrunning", url: "https://www.on.com/en-us/shop/womens/apparel/tops-tshirts/road-running/womens-size-l" },
  { name: "Outdoorvoices", url: "https://www.outdoorvoices.com/collections/womens-tops" },
  { name: "Quince", url: "https://www.quince.com/women/tees/short-sleeve?jumplink=true&filter=colors%3DWhite" },
  { name: "Skims", url: "https://skims.com/collections/short-sleeve-tops?direction=next&cursor=eyJsYXN0X3ZhbHVlIjoiMTEiLCJsYXN0X2lkIjo3MTExNjkxMzA1MDkyLCJvZmZzZXQiOjExfQ%3D%3D" },
  { name: "Trueclassic", url: "https://www.trueclassictees.com/collections/new-arrival" },
  { name: "Comfrt", url: "https://comfrt.com/collections/new-arrivals" },
  { name: "Gap", url: "https://www.gap.com/browse/women/t-shirts-and-tanks?cid=17076&nav=meganav%3AWomen%3ACategories%3AT-Shirts+%26+Tanks#department=136&color=1020" },
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

async function primePage(page, ms = 25000) {
  try {
    await page.evaluate((timeout) => {
      return new Promise((resolve) => {
        const start = Date.now();
        const step = () => {
          const currentHeight = document.documentElement.scrollHeight;
          const scrolledToBottom = window.scrollY + window.innerHeight >= currentHeight - 10;
          const timeExpired = Date.now() - start > timeout;
          if (scrolledToBottom || timeExpired) return resolve();
          window.scrollBy(0, 150);
          setTimeout(step, 400);
        };
        step();
      });
    }, ms);
    await sleep(3000);
  } catch (e) {}
  await toTop(page);
  try { await page.waitForLoadState("networkidle", { timeout: 5000 }); } catch {}
  await sleep(1500);
}

async function forAllFrames(page, fn) {
  const frames = page.frames();
  for (const fr of frames) {
    try { if (await fn(fr)) return true; } catch {}
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
          if (pred({ el, s, r, id, cls })) kill.push(el);
        } catch {}
      }
      for (let j = 0; j < kill.length; j++) { try { kill[j].remove(); } catch {} }
    }, predicateSource.toString());
  } catch {}
}

async function closeCookies(page) {
  const cookieSelectors = ["button#onetrust-accept-btn-handler", "button[id='onetrust-accept-btn-handler']", "button#truste-consent-button"];
  for (const sel of cookieSelectors) {
    try {
      const clicked = await forAllFrames(page, async (fr) => {
        const loc = fr.locator(sel).first();
        if (await loc.count()) {
          try { await loc.click({ force: true, timeout: 1000 }); await sleep(500); return true; } catch {}
        }
        return false;
      });
      if (clicked) { await sleep(1000); break; }
    } catch {}
  }
  await forAllFrames(page, (fr) =>
    removeByPredicateInFrame(fr, ({ s, r, id, cls }) =>
      (s.position === "fixed" || s.position === "sticky") && r.height > 50 && r.height < 250 &&
      (id.includes("onetrust") || cls.includes("onetrust") || id.includes("cookie-banner"))
    )
  );
}

async function closePromos(page) {
  const closeSel = ["button[aria-label='Close']", "button[title='Close']", "button.close"];
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const sel of closeSel) {
      try {
        const clicked = await forAllFrames(page, async (fr) => {
          const loc = fr.locator(sel).first();
          if (await loc.count()) {
            try { await loc.click({ force: true, timeout: 1000 }); await sleep(500); return true; } catch {}
          }
          return false;
        });
        if (clicked) await sleep(1000);
      } catch {}
    }
    await sleep(500);
  }
  await forAllFrames(page, (fr) =>
    removeByPredicateInFrame(fr, ({ s, r, id, cls }) =>
      (s.position === "fixed" || s.position === "sticky") && r.width > 250 && r.height > 150 &&
      ((s.zIndex && parseInt(s.zIndex) > 999) || cls.includes("modal") || cls.includes("popup"))
    )
  );
  try { for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape"); await sleep(400); } } catch {}
}

async function settle(page) {
  await sleep(3000);
  for (let i = 0; i < 5; i++) { await closeCookies(page); await sleep(600); await closePromos(page); await sleep(600); }
  await primePage(page, 25000);
  await closeCookies(page); await sleep(500); await closePromos(page); await sleep(1000);
  await sleep(3000);
}

async function capture(browser, contextOptions, brand, url, outputPath) {
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
    return true;
  } catch (e) { await ctx.close(); throw e; }
}

(async () => {
  const outputDir = path.join(__dirname, "PLP");
  await fs.ensureDir(outputDir);
  const browser = await chromium.launch({ headless: true });
  for (const { name, url } of BRANDS) {
    console.log(`→ ${name}`);
    try {
      await capture(browser, DESKTOP, name, url, path.join(outputDir, `PLP - ${name} - Desktop.png`));
      console.log(`  ✓ Desktop`);
      await capture(browser, MOBILE, name, url, path.join(outputDir, `PLP - ${name} - Mobile.png`));
      console.log(`  ✓ Mobile`);
    } catch (e) { console.log(`✗ ${name}: ${e.message}`); }
  }
  await browser.close();
  console.log("\n✔ All done!");
})().catch((e) => { console.error(e); process.exit(1); });
