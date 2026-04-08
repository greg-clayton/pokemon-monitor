const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const notifier = require('node-notifier');
const { exec } = require('child_process');

puppeteer.use(StealthPlugin());

// ─── Config ───────────────────────────────────────────────────────────────────
const TARGET_URL  = 'https://www.pokemoncenter.com/en-gb/';
const INTERVAL_MS = 10_000; // 10 seconds
const EDGE_PATH   = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

// Queue-it / waiting room patterns
const QUEUE_PATTERNS = [
  /queue-it\.net/i,
  /queueit/i,
  /you are in the waiting room/i,
  /you['']re in the queue/i,
  /placed in a queue/i,
  /your position in the queue/i,
  /waiting room/i,
];

// Bot challenge / human verification patterns (PerimeterX, Cloudflare, etc.)
const CHALLENGE_PATTERNS = [
  /px-captcha/i,
  /perimeterx/i,
  /human verification/i,
  /press.*hold/i,
  /just a moment/i,
  /checking if the site connection is secure/i,
  /enable javascript and cookies to continue/i,
  /verify.*human/i,
  /NOINDEX, NOFOLLOW/,
];

// ─── State ────────────────────────────────────────────────────────────────────
let queueActive     = false;
let challengeActive = false;
let checkCount      = 0;
let browser         = null;
let page            = null;

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

function playAlarm() {
  const cmd = `powershell -c "(New-Object System.Media.SoundPlayer 'C:\\Windows\\Media\\Alarm01.wav').PlaySync()"`;
  exec(cmd);
  setTimeout(() => exec(cmd), 2000);
  setTimeout(() => exec(cmd), 4000);
}

function sendNotification(title, message) {
  log(`*** ${title} ***`);
  notifier.notify({ title, message, sound: false, wait: false, appID: 'Pokemon Center Monitor' });
  playAlarm();
}

// ─── Browser setup ────────────────────────────────────────────────────────────
async function setup() {
  browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: [
      '--start-minimized',
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  // Use the first tab that Edge opens — keep it forever
  const pages = await browser.pages();
  page = pages[0] || await browser.newPage();

  await page.setViewport({ width: 1280, height: 800 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

  log('Edge ready — monitoring started.');
}

// ─── Main Check ───────────────────────────────────────────────────────────────
async function checkSite() {
  checkCount++;

  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for JS redirects / challenges to render
    await new Promise(r => setTimeout(r, 4000));

    const finalUrl = page.url();
    const bodyHtml = await page.evaluate(() => document.documentElement?.innerHTML || '');
    const bodyText = await page.evaluate(() => document.body?.innerText || '');

    const isQueued    = QUEUE_PATTERNS.some(p => p.test(finalUrl) || p.test(bodyText));
    const isChallenge = !isQueued && CHALLENGE_PATTERNS.some(p => p.test(bodyHtml) || p.test(bodyText));

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
        'Site is showing a human verification challenge — queue may be forming. Open your browser!'
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
    // Reconnect browser on error
    try { await browser.close(); } catch (_) {}
    browser = null;
    page    = null;
    await setup();
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
console.log('='.repeat(60));
console.log('  Pokemon Center UK — Queue Monitor');
console.log(`  Target  : ${TARGET_URL}`);
console.log(`  Interval: every ${INTERVAL_MS / 1000}s`);
console.log('  Browser : Microsoft Edge (minimised in taskbar)');
console.log('='.repeat(60));
console.log('');

(async () => {
  await setup();
  await checkSite();
  setInterval(checkSite, INTERVAL_MS);
})();
