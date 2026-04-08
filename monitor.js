const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const notifier = require('node-notifier');

puppeteer.use(StealthPlugin());

// ─── Config ───────────────────────────────────────────────────────────────────
const TARGET_URL  = 'https://www.pokemoncenter.com/en-gb/';
const INTERVAL_MS = 10_000; // 10 seconds

// Queue-it / waiting room patterns (checked against final URL and page content)
const QUEUE_PATTERNS = [
  /queue-it\.net/i,
  /queueit/i,
  /you are in the waiting room/i,
  /you['']re in the queue/i,
  /placed in a queue/i,
  /your position in the queue/i,
  /waiting room/i,
];

// Bot challenge patterns (PerimeterX, Cloudflare, etc.)
const CHALLENGE_PATTERNS = [
  /just a moment/i,
  /checking if the site connection is secure/i,
  /enable javascript and cookies to continue/i,
  /please verify you are a human/i,
  /are you a human/i,
  /access to this page has been denied/i,
  /NOINDEX, NOFOLLOW/,
];

// ─── State ────────────────────────────────────────────────────────────────────
let queueActive     = false;
let challengeActive = false;
let checkCount      = 0;
let browser         = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}

function sendNotification(title, message) {
  log(`*** ${title} ***`);
  notifier.notify({ title, message, sound: true, wait: false, appID: 'Pokemon Center Monitor' });
}

// ─── Browser setup ────────────────────────────────────────────────────────────
async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browser;
}

// ─── Main Check ───────────────────────────────────────────────────────────────
async function checkSite() {
  checkCount++;
  let page = null;

  try {
    const b = await getBrowser();
    page = await b.newPage();

    // Set a realistic viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait briefly for any JS redirects to fire
    await new Promise(r => setTimeout(r, 3000));

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const pageHtml = await page.evaluate(() => document.documentElement?.innerHTML || '');

    const isQueued = QUEUE_PATTERNS.some(p => p.test(finalUrl) || p.test(bodyText));
    const isChallenge = !isQueued && CHALLENGE_PATTERNS.some(p => p.test(bodyText) || p.test(pageHtml));

    if (isQueued && !queueActive) {
      queueActive     = true;
      challengeActive = false;
      sendNotification(
        'Pokemon Center UK — Queue Active!',
        'A waiting room queue is now live. Open your browser and join now!'
      );

    } else if (!isQueued && queueActive) {
      queueActive = false;
      log('Queue cleared — site is back to normal.');

    } else if (isChallenge && !challengeActive) {
      challengeActive = true;
      sendNotification(
        'Pokemon Center UK — High Traffic Alert!',
        'The site is showing a challenge page — a queue may be forming. Open your browser now!'
      );

    } else if (!isChallenge && challengeActive && !isQueued) {
      challengeActive = false;
      log('Challenge cleared — site is back to normal.');

    } else {
      const state = isQueued
        ? 'QUEUE ACTIVE (already notified)'
        : isChallenge
          ? 'CHALLENGE ACTIVE (already notified)'
          : 'No queue — site normal';
      log(`Check #${checkCount} — ${state}`);
    }

  } catch (err) {
    log(`Error on check #${checkCount}: ${err.message}`);
    // Reset browser on error so next check gets a fresh one
    if (browser) { await browser.close().catch(() => {}); browser = null; }

  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
console.log('='.repeat(60));
console.log('  Pokemon Center UK — Queue Monitor');
console.log(`  Target  : ${TARGET_URL}`);
console.log(`  Interval: every ${INTERVAL_MS / 1000}s`);
console.log('  Mode    : headless browser (stealth)');
console.log('='.repeat(60));
console.log('');

checkSite();
setInterval(checkSite, INTERVAL_MS);
