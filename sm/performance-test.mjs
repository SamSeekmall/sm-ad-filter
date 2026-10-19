import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.resolve(root,'build/qa-v3-performance');
await mkdir(out,{recursive:true});
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'build/qa/browsers');
const {chromium}=await import('../build/qa/node_modules/playwright/index.mjs');
let slow=false,listRequests=0;
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');if(req.url==='/list.txt'){listRequests++;res.setHeader('Content-Type','text/plain');const finish=()=>res.end('! Title: Audit fixture\n! Expires: 1 day\n||audit-ad.invalid^');if(slow)setTimeout(finish,2000);else finish();return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Audit fixture</title><h1>Audit content</h1><p>Normal page for isolated extension profiling.</p>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
const report={date:'2026-10-19',build:JSON.parse(await readFile('build/sm-ad-filter/SM-BUILD.json','utf8')),scope:'isolated Chromium; no daily profile; UI render and runtime messages; not native toolbar or real-site efficacy',samples:{},screens:[]};
let context;
const begin=performance.now();
try{
context=await chromium.launchPersistentContext(path.join(tmpdir(),`sm-ad-filter-audit-${crypto.randomUUID()}`),{channel:'chromium',headless:true,viewport:{width:1280,height:900},args:[`--disable-extensions-except=${path.join(root,'build/sm-ad-filter')}`,`--load-extension=${path.join(root,'build/sm-ad-filter')}`]});
context.setDefaultTimeout(45000);report.browser=context.browser().version();
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
const page=await context.newPage();await page.goto(`chrome-extension://${id}/welcome.html`);await page.bringToFront();await page.locator('#status').filter({hasText:'默认：'}).waitFor();report.coldLaunchToReadyMs=performance.now()-begin;
const sample=async(what,n=20)=>{await page.bringToFront();return page.evaluate(async({what,n})=>{const times=[];for(let i=0;i<n;i++){const start=performance.now();const r=await chrome.runtime.sendMessage({what});if(!r?.ok)throw Error(r?.error);times.push(performance.now()-start);}const sorted=[...times].sort((a,b)=>a-b);return {n,p50:sorted[Math.floor(n*.5)],p95:sorted[Math.min(n-1,Math.ceil(n*.95)-1)],max:sorted.at(-1),raw:times};},{what,n});};
report.samples.status=await sample('sm:status');report.samples.historyEmpty=await sample('sm:history');report.samples.snapshot=await sample('sm:snapshot');
const nav=[];for(let i=0;i<5;i++){const t=performance.now();await page.reload();await page.locator('#status-refresh[data-state=success]').waitFor({state:'attached'});nav.push({wallReadyMs:performance.now()-t,...await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,resources:performance.getEntriesByType('resource').length};})});}report.warmNavigations=nav;
async function shot(name,fullPage=false){await page.bringToFront();await page.screenshot({path:path.join(out,name),fullPage});report.screens.push(name);}
await shot('01-control-desktop.png');
report.layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,buttons:document.querySelectorAll('button').length,heroHeight:document.querySelector('.hero').getBoundingClientRect().height,protectionTop:document.querySelector('#protection').getBoundingClientRect().top,smallTargets:[...document.querySelectorAll('a,button,input,select')].map(e=>({text:(e.innerText||e.id).slice(0,40),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})).filter(x=>x.w&&x.h&&(x.w<24||x.h<24))}));
assert.equal(await page.locator('#sendReport').isDisabled(),true);await page.locator('#repository').fill('https://invalid.example/repo');await page.locator('#saveRepository').click();await page.locator('#feedback .actionStatus').filter({hasText:'未完成'}).waitFor();
report.errorFeedback=await page.evaluate(()=>({message:document.querySelector('#feedback .actionStatus').textContent,noticeTop:document.querySelector('#feedback .actionStatus').getBoundingClientRect().top,viewportHeight:innerHeight,focused:document.activeElement.id,ariaInvalid:document.querySelector('#repository').getAttribute('aria-invalid')}));assert.equal(report.errorFeedback.ariaInvalid,'true');assert.ok(report.errorFeedback.noticeTop>=0&&report.errorFeedback.noticeTop<report.errorFeedback.viewportHeight);await shot('02-feedback-error.png');
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await shot('03-control-narrow.png',true);
report.narrow390=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,height:document.documentElement.scrollHeight}));
await page.setViewportSize({width:320,height:720});report.narrow320=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,height:document.documentElement.scrollHeight}));
await page.setViewportSize({width:1280,height:900});await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>scrollTo(0,0));await shot('04-control-dark.png');
report.colors=await page.evaluate(()=>['body','.panel','button','.secondary','input','#notice'].map(selector=>{const e=document.querySelector(selector),s=getComputedStyle(e);return{selector,color:s.color,background:s.backgroundColor,border:s.borderColor,font:s.fontSize};}));await page.emulateMedia({colorScheme:'light'});
const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');report.frontendMetrics=(await cdp.send('Performance.getMetrics')).metrics.filter(x=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','LayoutCount','RecalcStyleCount','ScriptDuration','TaskDuration'].includes(x.name));
report.storageBefore=await page.evaluate(async()=>({bytes:await chrome.storage.local.getBytesInUse(null),keys:Object.keys(await chrome.storage.local.get(null)).length}));
const snapshot=await page.evaluate(async()=>(await chrome.runtime.sendMessage({what:'sm:snapshot'})).data);
await page.evaluate(async snapshot=>{const history=Array.from({length:10},(_,i)=>{const before=structuredClone(snapshot);before.settings.sandboxFilters='! audit synthetic data\n'+'x'.repeat(80000);return{id:String(i),label:'synthetic performance fixture',time:Date.now(),before,after:before.settings};});const index=history.map(({id,label,time,...rest})=>({id,label,time,bytes:new TextEncoder().encode(JSON.stringify(rest)).length}));await chrome.storage.local.set({'sm.historyIndex':index,...Object.fromEntries(history.map(x=>['sm.history.'+x.id,x]))});},snapshot);
report.historyFixtureBytes=await page.evaluate(()=>chrome.storage.local.getBytesInUse(['sm.historyIndex',...Array.from({length:10},(_,i)=>'sm.history.'+i)]));report.samples.historyLoaded=await sample('sm:history');report.samples.statusLoaded=await sample('sm:status');await page.evaluate(()=>chrome.runtime.sendMessage({what:'sm:clearRecords'}));
console.log('PASS loading, message timing, storage workload, control screenshots');
const listURL=`http://localhost:${port}/list.txt`;await page.evaluate(url=>chrome.runtime.sendMessage({what:'importFilterList',url}),listURL);slow=true;
report.slowSubscription=await page.evaluate(async()=>{
const start=performance.now();const update=chrome.runtime.sendMessage({what:'sm:updateLists'}).then(r=>({elapsed:performance.now()-start,ok:r?.ok,error:r?.error}));
await new Promise(r=>setTimeout(r,100));const times=[];
for(let i=0;i<20;i++){const t=performance.now();const r=await chrome.runtime.sendMessage({what:'sm:status'});if(!r.ok)throw Error(r.error);times.push(performance.now()-t);}
const pauseStart=performance.now();const pause=await chrome.runtime.sendMessage({what:'sm:pause',hostname:'audit.example',duration:'10m'});const pauseAckMs=performance.now()-pauseStart;
const resumeStart=performance.now();const resume=await chrome.runtime.sendMessage({what:'sm:resume',hostname:'audit.example'});const resumeAckMs=performance.now()-resumeStart;
const sorted=[...times].sort((a,b)=>a-b);return{update:await update,statusP95:sorted[18],statusRaw:times,pauseAckMs,resumeAckMs,pauseOk:pause.ok,resumeOk:resume.ok};});
assert.ok(report.slowSubscription.update.ok);assert.ok(report.slowSubscription.pauseOk&&report.slowSubscription.resumeOk);assert.ok(report.slowSubscription.statusP95<200,'slow download status p95 budget');
report.slowSubscription.requests=listRequests;
report.cancel=await page.evaluate(async()=>{const update=chrome.runtime.sendMessage({what:'sm:updateLists'});await new Promise(r=>setTimeout(r,100));const cancel=await chrome.runtime.sendMessage({what:'sm:cancelUpdate'});const result=await update;return{cancel,result,progress:(await chrome.runtime.sendMessage({what:'sm:updateProgress'})).data};});
assert.equal(report.cancel.cancel.ok,true);assert.equal(report.cancel.progress.state,'cancelled');slow=false;
console.log('PASS slow subscription head-of-line benchmark');
const fixture=await context.newPage();await fixture.goto(`http://localhost:${port}/`);const popup=await context.newPage();await popup.setViewportSize({width:380,height:640});await fixture.bringToFront();await popup.goto(`chrome-extension://${id}/sm/popup.html`);await popup.locator('#state').filter({hasText:'已开启保护'}).waitFor({state:'attached'});await popup.bringToFront();await popup.screenshot({path:path.join(out,'05-popup.png')});report.screens.push('05-popup.png');
report.popup=await popup.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,mode:document.querySelector('#state').textContent}));
await page.bringToFront();
try{await page.evaluate(async()=>{const tab=await chrome.tabs.getCurrent();await chrome.tabs.setZoom(tab.id,2);});report.zoom200=await page.evaluate(()=>({zoomWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(report.zoom200.scrollWidth<=report.zoom200.zoomWidth);await page.screenshot({path:path.join(out,'06-zoom-200.png')});await page.evaluate(async()=>{const tab=await chrome.tabs.getCurrent();await chrome.tabs.setZoom(tab.id,1);});}catch(error){report.zoom200={status:'NOT_VERIFIED',error:error.message};}
await popup.bringToFront();await popup.setViewportSize({width:320,height:640});report.popup320=await popup.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
// Native desktop action popup has a 380 px intrinsic width; a 320 px tab is not its host.
assert.equal(report.popup320.scrollWidth,380);
report.status='COMPLETE';
}catch(error){process.exitCode=1;report.status='PARTIAL';report.error=error.stack;console.error(error.stack);}finally{await writeFile(path.join(out,'measurements.json'),JSON.stringify(report,null,2));await context?.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({status:report.status,out,samples:report.samples,slowSubscription:report.slowSubscription,cold:report.coldLaunchToReadyMs},null,2));
