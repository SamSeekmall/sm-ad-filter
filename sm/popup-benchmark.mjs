import {tmpdir} from 'node:os';
// Native popup benchmark: open from an extension page (not the worker), report each sample.
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('build/qa/browsers');
const {chromium}=await import('../build/qa/node_modules/playwright/index.mjs');
const channel=process.env.SM_BROWSER_CHANNEL||'chromium';
const server=createServer((req,res)=>res.end('<!doctype html><title>Fixture</title>Normal content'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const out=path.resolve(`build/qa-popup-performance-${channel}`);await mkdir(out,{recursive:true});
const report={scope:'Native popup; isolated profile; engine preloaded; 3 successive opens plus a forced worker-restart open. No daily profile or speed guarantee.',channel,runs:[]};
const save=()=>writeFile(path.join(out,'native-timing.json'),JSON.stringify(report,null,2));
async function measure(extension,label){
 const run={label,build:JSON.parse(await readFile(path.join(extension,'SM-BUILD.json'),'utf8')),samples:[]};report.runs.push(run);await save();
 const context=await chromium.launchPersistentContext(path.join(tmpdir(),`sm-ad-filter-bench-${label}-${crypto.randomUUID()}`),{channel,headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--host-resolver-rules=MAP example.com 127.0.0.1','--no-proxy-server']});
 context.setDefaultTimeout(60000);
 try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
 const driver=await context.newPage();await driver.goto(`chrome-extension://${id}/welcome.html`);await driver.bringToFront();await driver.locator('#status-refresh[data-state=success]').waitFor({state:'attached'});
 const fixture=await context.newPage();await fixture.goto(`http://example.com:${server.address().port}`);
 const cdp=await context.browser().newBrowserCDPSession();
 const sw=await context.newCDPSession(driver);let workerStopped=false;
 sw.on('ServiceWorker.workerVersionUpdated',e=>{if(e.versions.some(v=>v.scriptURL.includes(id)&&v.runningStatus==='stopped'))workerStopped=true;});
 await sw.send('ServiceWorker.enable');
 for(let index=0;index<4;index++){
  if(index===3){workerStopped=false;await sw.send('ServiceWorker.stopAllWorkers');for(let n=0;n<100&&!workerStopped;n++)await new Promise(r=>setTimeout(r,50));assert.ok(workerStopped,'worker stop confirmed');}

  await fixture.bringToFront();await new Promise(r=>setTimeout(r,300));const start=performance.now();
  await driver.evaluate(()=>chrome.action.openPopup());const openAckMs=performance.now()-start;
  const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/sm/popup.html'));assert.ok(target,'native popup');
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let seq=0;const pending=new Map();
  const listener=e=>{if(e.sessionId!==sessionId)return;const r=JSON.parse(e.message),p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}};cdp.on('Target.receivedMessageFromTarget',listener);
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++seq,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timed out'));},15000);pending.set(n,{resolve,reject,timer});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:n,method,params})}).catch(reject);});
  let data;const until=performance.now()+15000;
  do{const r=await send('Runtime.evaluate',{expression:`JSON.stringify({state:document.querySelector('#state')?.textContent,paint:performance.getEntriesByType('paint').map(x=>({name:x.name,ms:x.startTime})),marks:performance.getEntriesByType('mark').map(x=>({name:x.name,ms:x.startTime})),resources:performance.getEntriesByType('resource').map(x=>({name:x.name.split('/').pop(),duration:x.duration})),width:innerWidth})`,returnByValue:true});data=JSON.parse(r.result.value);if(data.state?.includes('已开启保护'))break;await new Promise(r=>setTimeout(r,50));}while(performance.now()<until);
  const sample={index,kind:index===3?'worker-restart':'warm',openAckMs,stateObservedMs:performance.now()-start,...data};run.samples.push(sample);await save();console.log(label,JSON.stringify(sample));assert.ok(data.state?.includes('已开启保护'));
  await send('Runtime.evaluate',{expression:'setTimeout(()=>window.close(),0)'});cdp.off('Target.receivedMessageFromTarget',listener);await new Promise(r=>setTimeout(r,400));
 }
 const sorted=run.samples.filter(s=>s.kind==='warm').map(s=>s.stateObservedMs).sort((a,b)=>a-b);run.medianMs=sorted[1];run.maxMs=sorted.at(-1);await save();
 }finally{await context.close();}
}
try{if(process.argv[2])await measure(path.resolve(process.argv[2]),'baseline');await measure(path.resolve('build/sm-ad-filter'),'current');report.status='COMPLETE';}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;console.error(error.stack);}finally{await save();await new Promise(r=>server.close(r));}
