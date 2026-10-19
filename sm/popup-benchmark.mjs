// Compare native action popups in isolated profiles, never ordinary tab projections.
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('build/qa/browsers');
const {chromium}=await import('../build/qa/node_modules/playwright/index.mjs');
const server=createServer((req,res)=>res.end('<!doctype html><title>Popup timing</title><p>Normal content</p>'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const out=path.resolve('build/qa-popup-performance');await mkdir(out,{recursive:true});
const report={scope:'Isolated Chromium; first open plus four warm opens per version; no daily profile; timings are local observations',runs:[]};
async function measure(extension,label){
 const context=await chromium.launchPersistentContext(path.resolve(`build/qa/timing-${label}-${crypto.randomUUID()}`),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--host-resolver-rules=MAP example.com 127.0.0.1','--no-proxy-server']});
 try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const page=await context.newPage();await page.goto(`http://example.com:${server.address().port}`);
 const cdp=await context.browser().newBrowserCDPSession(),samples=[];
 for(let index=0;index<5;index++){
  await page.bringToFront();await worker.evaluate(async()=>{const w=await chrome.windows.getLastFocused();await chrome.windows.update(w.id,{focused:true});});await new Promise(r=>setTimeout(r,500));const start=performance.now();await worker.evaluate(()=>chrome.action.openPopup());const openAckMs=performance.now()-start;
  const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/sm/popup.html'));assert.ok(target);
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let seq=0;const pending=new Map();
  const listener=event=>{if(event.sessionId!==sessionId)return;const r=JSON.parse(event.message),p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}};cdp.on('Target.receivedMessageFromTarget',listener);
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error('CDP timeout')),15000);pending.set(id,{resolve,reject,timer});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
  let data;
  const until=performance.now()+15000;
  do{
   const r=await send('Runtime.evaluate',{expression:`JSON.stringify({state:document.querySelector('#state')?.textContent,paint:performance.getEntriesByType('paint').map(x=>({name:x.name,ms:x.startTime})),marks:performance.getEntriesByType('mark').map(x=>({name:x.name,ms:x.startTime})),width:innerWidth})`,returnByValue:true});data=JSON.parse(r.result.value);
   if(/当前：|已开启保护/.test(data.state))break;await new Promise(r=>setTimeout(r,25));
  }while(performance.now()<until);
  const ready=/当前：|已开启保护/.test(data.state);samples.push({kind:index===0?'first-open':'warm',openAckMs,stateObservedMs:performance.now()-start,ready,...data});
  cdp.off('Target.receivedMessageFromTarget',listener);await send('Runtime.evaluate',{expression:'window.close()'}).catch(()=>{});await new Promise(r=>setTimeout(r,500));
  assert.ok(ready,`${label} popup did not become ready`);
 }
 const warm=samples.slice(1).map(x=>x.stateObservedMs).sort((a,b)=>a-b);
 return{label,build:JSON.parse(await readFile(path.join(extension,'SM-BUILD.json'),'utf8')),samples,warmMedianMs:(warm[1]+warm[2])/2};
 }finally{await context.close();}
}
try{
 if(process.argv[2])report.runs.push(await measure(path.resolve(process.argv[2]),'baseline'));
 report.runs.push(await measure(path.resolve('build/sm-ad-filter'),'current'));report.status='COMPLETE';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await writeFile(path.join(out,'native-timing.json'),JSON.stringify(report,null,2));await new Promise(r=>server.close(r));console.log(JSON.stringify(report));}
