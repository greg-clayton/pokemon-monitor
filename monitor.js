const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const notifier = require('node-notifier');
const { exec } = require('child_process');

puppeteer.use(StealthPlugin());

// ─── Config ───────────────────────────────────────────────────────────────────
const TARGET_URL     = 'https://www.pokemoncenter.com/en-gb/';
const INTERVAL_MS    = 10_000; // 10 seconds
const EDGE_PATH      = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

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

// ─── State ────────────────────────────────────────────────────────────────────
let queueActive = false;
let checkCount  = 0;
let browser     = null;

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

  // Windows toast notification
  notifier.notify({ title, message, sound: false, wait: false, appID: 'Pokemon Center Monitor' });

  // Play alarm WAV 3 times so it's hard to miss
  const playAlarm = () => exec('powershell -c "(New-Object System.Media.SoundPlayer \'C:\\Windows\\Media\\Alarm01.wav\').PlaySync()"');
  playAlarm();
  setTimeout(playAlarm, 2000);
  setTimeout(playAlarm, 4000);
}

// ─── Browser ──────────────────────────────────────────────────────────────────
async function getBrowser() {
  if (!browser || !browser.connected) {
    log('Launching Edge browser...');
    browser = await puppeteer.launch({
      executablePath: EDGE_PATH,
      headless: false,
      args: [
        '--start-minimized',
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    log('Edge ready.');
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

    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for JS redirects (Queue-it fires via JS)
    await new Promise(r => setTimeout(r, 4000));

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText || '');

    const isQueued = QUEUE_PATTERNS.some(p => p.test(finalUrl) || p.test(bodyText));

    if (isQueued && !queueActive) {
      queueActive = true;
      sendNotification(
        'Pokemon Center UK — Queue Active!',
        'A waiting room queue is now live. Open your browser and join now!'
      );

    } else if (!isQueued && queueActive) {
      queueActive = false;
      log('Queue cleared — site is back to normal.');

    } else {
      log(`Check #${checkCount} — ${isQueued ? 'QUEUE ACTIVE (already notified)' : 'No queue — site normal'}`);
    }

  } catch (err) {
    log(`Error on check #${checkCount}: ${err.message}`);
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
console.log('  Browser : Microsoft Edge (real browser)');
console.log('='.repeat(60));
console.log('');
log('Note: a minimised Edge window will appear in your taskbar — do not close it.');
console.log('');

checkSite();
setInterval(checkSite, INTERVAL_MS);
