import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT="/mnt/data/work/projects/plane_war";
const MIME={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".png":"image/png",".json":"application/json",".woff2":"font/woff2",".css":"text/css"};
const server=http.createServer((q,r)=>{const u=new URL(q.url,"http://x");const f=path.join(ROOT,u.pathname==="/"?"index.html":decodeURIComponent(u.pathname));
if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404).end();return;}r.writeHead(200,{"content-type":MIME[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r);});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const PORT=server.address().port;
const br=await chromium.launch({headless:true});const ctx=await br.newContext({viewport:{width:480,height:720}});
await ctx.addInitScript(()=>{let s=20261108>>>0;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
window.__clock=1000;performance.now=()=>window.__clock;window.__rafQueue=[];window.requestAnimationFrame=cb=>{window.__rafQueue.push(cb);return 1;};window.cancelAnimationFrame=()=>{};});
const pg=await ctx.newPage();pg.on("pageerror",e=>console.log("PAGEERR",String(e).slice(0,200)));
await pg.goto(`http://127.0.0.1:${PORT}/index.html`,{waitUntil:"load"});await new Promise(r=>setTimeout(r,2500));
console.log(JSON.stringify(await pg.evaluate(async()=>{
 const meta=await import("/js/meta.js");const ui=await import("/js/ui.js");const bu=await import("/js/bullet.js");
 meta.getSettings().skipTutorial=true; if(ui.isHelpOpen())ui.closeHelp();
 const g=window.__game; g.resetGame();
 const snaps=[]; let frames=0;
 for(let f=0;f<900;f++){ window.__clock+=1000/60; const cb=window.__rafQueue.shift(); if(!cb)break; cb();
   if(g.state()!==1) { snaps.push({f,state:g.state()}); continue; }
   frames++;
   if(f%150===0) snaps.push({f,hostile:bu.getHostileBulletBudgetStats(),enemies:g.enemies.length,
     ys:g.enemies.slice(0,4).map(e=>+e.y.toFixed(0)), cds:g.enemies.slice(0,4).map(e=>+e.fireCd.toFixed(2)), score:g.getScore()});
 }
 // 手动注入一发敌弹，看它能否存活
 const p=g.getPlayer();
 const fake={x:240,y:300,r:20,type:"small"};
 const before=bu.getHostileBulletBudgetStats().active;
 const b=bu.spawnEnemyBullet(fake,p.x,p.y,1);
 let aliveAfterOne=null;
 window.__clock+=1000/60; const cb2=window.__rafQueue.shift(); if(cb2)cb2();
 aliveAfterOne=b?{present:g.bullets.includes(b),friendly:b.friendly,x:+b.x.toFixed(1),y:+b.y.toFixed(1),vx:+b.vx.toFixed(2),vy:+b.vy.toFixed(2),maxRange:b.maxRange,life:b.life}:null;
 return {frames,snaps,manual:{before,created:!!b,aliveAfterOne,stats:bu.getHostileBulletBudgetStats()}};
})),'\n');
await br.close();server.close();
