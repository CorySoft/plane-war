const { chromium } = require('/usr/lib/node_modules/playwright/index.js');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

const srv = http.createServer((req, res) => {
  let fpath = path.join('/mnt/data/plane_war', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(fpath).toLowerCase();
  try {
    const data = fs.readFileSync(fpath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

srv.listen(18080, async () => {
  console.log('HTTP server on 18080');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell'
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));

  await page.goto('http://127.0.0.1:18080/');
  await page.waitForTimeout(10000);

  console.log('=== LOGS ===');
  for (const l of logs) console.log(l);

  const errBox = await page.evaluate(() => document.getElementById('errBox')?.textContent || 'no box');
  const gameReady = await page.evaluate(() => window.__gameReady);

  console.log('=== STATE ===');
  console.log('errBox:', errBox);
  console.log('__gameReady:', gameReady);

  await browser.close();
  srv.close();
});
