const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3001;

let monitorProcess = null;

function isRunning() {
  return monitorProcess !== null && !monitorProcess.killed;
}

function startMonitor() {
  if (isRunning()) return;
  monitorProcess = spawn('node', [path.join(__dirname, 'monitor.js')], {
    cwd: __dirname,
    stdio: 'inherit',
  });
  monitorProcess.on('exit', () => { monitorProcess = null; });
}

function stopMonitor() {
  if (isRunning()) {
    monitorProcess.kill();
    monitorProcess = null;
  }
}

const server = http.createServer((req, res) => {
  // Allow requests from the local Purrfect Suite file
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/status') {
    res.end(JSON.stringify({ running: isRunning() }));

  } else if (req.url === '/start' && req.method === 'POST') {
    startMonitor();
    res.end(JSON.stringify({ running: true }));

  } else if (req.url === '/stop' && req.method === 'POST') {
    stopMonitor();
    res.end(JSON.stringify({ running: false }));

  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Pokemon Monitor control server running on http://localhost:${PORT}`);
  console.log('Use the Purrfect Suite button to start/stop monitoring.');
});
