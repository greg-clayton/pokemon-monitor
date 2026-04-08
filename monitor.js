const axios = require('axios');
const notifier = require('node-notifier');

// ─── Config ───────────────────────────────────────────────────────────────────
const TARGET_URL  = 'https://www.pokemoncenter.com/en-gb/';
const INTERVAL_MS = 10_000; // 10 seconds

// Queue-it waiting room patterns
const QUEUE_PATTERNS = [
  /queue-it\.net/i,
  /queueit/i,
  /waitingroom/i,
  /you are in the waiting room/i,
  /you['']re in the queue/i,
  /placed in a queue/i,
];

// Cloudflare challenge patterns (appears before the queue when traffic spikes)
const CLOUDFLARE_PATTERNS = [
  /just a moment/i,
  /checking if the site connection is secure/i,
  /enable javascript and cookies to continue/i,
  /cf-browser-verification/i,
  /cloudflare ray id/i,
  /please wait while we verify/i,
];

// ─── State ────────────────────────────────────────────────────────────────────
let queueActive       = false;
let challengeActive   = false;
let checkCount        = 0;
let consecutiveErrors = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toLocaleString('en-GB', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}

// ─── Detection ────────────────────────────────────────────────────────────────
function detectQueue(finalUrl, body, headers) {
  if (/queue-it\.net/i.test(finalUrl)) return true;

  const hasQueueHeader = Object.keys(headers).some(h =>
    h.toLowerCase().startsWith('x-queueit') ||
    h.toLowerCase().includes('queueit')
  );
  if (hasQueueHeader) return true;

  if (typeof body === 'string') {
    for (const pattern of QUEUE_PATTERNS) {
      if (pattern.test(body)) return true;
    }
  }

  return false;
}

function detectCloudflareChallenge(body, headers, status) {
  // cf-mitigated header is set when Cloudflare is actively challenging
  if (headers['cf-mitigated']) return true;

  // 403 from Cloudflare
  if (status === 403 && headers['cf-ray']) return true;

  if (typeof body === 'string') {
    for (const pattern of CLOUDFLARE_PATTERNS) {
      if (pattern.test(body)) return true;
    }
  }

  return false;
}

// ─── Notify ───────────────────────────────────────────────────────────────────
function sendNotification(title, message) {
  log(`*** ${title} ***`);
  notifier.notify({
    title,
    message,
    sound: true,
    wait:  false,
    appID: 'Pokemon Center Monitor',
  });
}

// ─── Main Check ───────────────────────────────────────────────────────────────
async function checkSite() {
  checkCount++;

  let finalUrl = TARGET_URL;
  let body     = '';
  let headers  = {};
  let status   = 200;

  try {
    const response = await axios.get(TARGET_URL, {
      timeout: 20_000,
      maxRedirects: 10,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control':   'no-cache',
        'Pragma':          'no-cache',
      },
      validateStatus: () => true,
    });

    finalUrl = response.request?.res?.responseUrl || TARGET_URL;
    body     = typeof response.data === 'string' ? response.data : '';
    headers  = response.headers || {};
    status   = response.status;

    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    log(`Network error (${consecutiveErrors}): ${err.message}`);
    const errUrl = err.response?.request?.res?.responseUrl || '';
    if (/queue-it\.net/i.test(errUrl)) {
      finalUrl = errUrl;
    } else if (consecutiveErrors < 3) {
      return;
    }
  }

  const isQueued    = detectQueue(finalUrl, body, headers);
  const isChallenge = !isQueued && detectCloudflareChallenge(body, headers, status);

  // ── Queue detected ──
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

  // ── Cloudflare challenge detected (traffic spike, queue likely incoming) ──
  } else if (isChallenge && !challengeActive) {
    challengeActive = true;
    sendNotification(
      'Pokemon Center UK — High Traffic Alert!',
      'The site is showing a bot challenge — a queue may be forming. Open your browser now!'
    );

  } else if (!isChallenge && challengeActive && !isQueued) {
    challengeActive = false;
    log('Cloudflare challenge cleared — site is back to normal.');

  } else {
    const state = isQueued
      ? 'QUEUE ACTIVE (already notified)'
      : isChallenge
        ? 'CLOUDFLARE CHALLENGE (already notified)'
        : 'No queue — site normal';
    log(`Check #${checkCount} — ${state}`);
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
console.log('='.repeat(60));
console.log('  Pokemon Center UK — Queue Monitor');
console.log(`  Target : ${TARGET_URL}`);
console.log(`  Interval: every ${INTERVAL_MS / 1000}s`);
console.log('  Detects: Queue-it waiting room + Cloudflare challenge');
console.log('='.repeat(60));
console.log('');

checkSite();
setInterval(checkSite, INTERVAL_MS);
