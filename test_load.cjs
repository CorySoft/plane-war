const { chromium } = require('/usr/lib/node_modules/playwright/index.js');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell'
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));

  await page.goto('file:///mnt/data/plane_war/index.html');
  await page.waitForTimeout(10000);

  console.log('=== LOGS ===');
  for (const l of logs) console.log(l);

  const errBox = await page.evaluate(() => document.getElementById('errBox')?.textContent || 'no box');
  const gameReady = await page.evaluate(() => window.__gameReady);

  console.log('=== STATE ===');
  console.log('errBox:', errBox);
  console.log('__gameReady:', gameReady);

  await browser.close();
})();
