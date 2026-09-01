import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + join(__dirname, 'index.html');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

const logs = [];
page.on('console', msg => logs.push(`[console ${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => logs.push(`[pageerror] ${err.message} @ ${err.stack?.split('\n')[0]}`));

await page.goto(url);
await page.waitForTimeout(8000);

console.log('=== ALL LOGS ===');
for (const l of logs) console.log(l);

// 截图看看页面状态
await page.screenshot({ path: 'screenshot.png', fullPage: true });
console.log('screenshot saved: screenshot.png');

// 检查元素状态
const loaderVisible = await page.evaluate(() => {
  const l = document.getElementById('loader');
  return l ? (l.offsetParent !== null ? 'visible' : 'hidden') : 'removed';
});
const fallbackVisible = await page.evaluate(() => {
  const f = document.getElementById('fallback');
  return f ? f.style.display : 'missing';
});
const errBox = await page.evaluate(() => document.getElementById('errBox')?.textContent || 'no box');
const gameReady = await page.evaluate(() => window.__gameReady);
const gameVisible = await page.evaluate(() => {
  const c = document.getElementById('game');
  return c ? `${c.style.width}x${c.style.height} offset=${c.offsetParent?'visible':'hidden'}` : 'missing';
});

console.log('=== STATE ===');
console.log('loader:', loaderVisible);
console.log('fallback:', fallbackVisible);
console.log('errBox:', errBox);
console.log('__gameReady:', gameReady);
console.log('game canvas:', gameVisible);

// 也试试点开始游戏
await page.click('canvas#game');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshot2.png', fullPage: true });
console.log('=== AFTER CLICK ===');
console.log('logs total:', logs.length);

await browser.close();
