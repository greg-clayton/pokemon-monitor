const axios = require('axios');
const notifier = require('node-notifier');

// ─── Config ───────────────────────────────────────────────────────────────────
const TARGET_URL  = 'https://www.pokemoncenter.com/en-gb/';
const INTERVAL_MS = 10_000; // 10 seconds

// Queue-it detection patterns
const QUEUE_PATTERNS = [
  /queue-it\.net/i,
  /queueit/i,
  /waitingroom/i,
  /you are in the waiting room/i,
  /you['']re in the queue/i,
  /placed in a queue/i,
];

// ─── State ────────────────────────────────────────────────────────────────────
let queueActive       = false;
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

// ─── Queue Detection ──────────────────────────────────────────────────────────
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

// ─── Main Check ───────────────────────────────────────────────────────────────
async function checkSite() {
  checkCount++;

  let finalUrl = TARGET_URL;
  let body     = '';
  let headers  = {};

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
      },
      validateStatus: () => true,
    });

    finalUrl = response.request?.res?.responseUrl || TARGET_URL;
    body     = typeof response.data === 'string' ? response.data : '';
    headers  = response.headers || {};

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

  const isQueued = detectQueue(finalUrl, body, headers);

  if (isQueued && !queueActive) {
    queueActive = true;
    log('*** QUEUE DETECTED! ***');
    log(`Final URL: ${finalUrl}`);
    notifier.notify({
      title:   'Pokemon Center UK — Queue Active!',
      message: 'A waiting room queue is now live. Open your browser and join now!',
      sound:   true,
      wait:    false,
      appID:   'Pokemon Center Monitor',
    });

  } else if (!isQueued && queueActive) {
    queueActive = false;
    log('Queue cleared — site is back to normal.');

  } else {
    const status = isQueued ? 'QUEUE ACTIVE (already notified)' : 'No queue — site normal';
    log(`Check #${checkCount} — ${status}`);
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
console.log('='.repeat(60));
console.log('  Pokemon Center UK — Queue Monitor');
console.log(`  Target : ${TARGET_URL}`);
console.log(`  Interval: every ${INTERVAL_MS / 1000}s`);
console.log('='.repeat(60));
console.log('');

checkSite();
setInterval(checkSite, INTERVAL_MS);
