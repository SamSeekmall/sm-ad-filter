import path from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('build/qa/browsers');
const {chromium}=await import('../build/qa/node_modules/playwright/index.mjs');
const channel=process.env.SM_BROWSER_CHANNEL||'chromium',out=path.resolve(`build/qa-native-${channel}`);await mkdir(out,{recursive:true});
const server=createServer((req,res)=>res.end('<!doctype html><title>Popup fixture</title><p>Normal content</p>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
let context;
try{
context=await chromium.launchPersistentContext(path.resolve(`build/qa/native-popup-${channel}-${crypto.randomUUID()}`),{channel,headless:true,args:[`--disable-extensions-except=${path.resolve('build/sm-ad-filter')}`,`--load-extension=${path.resolve('build/sm-ad-filter')}`]});
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
const page=await context.newPage();await page.goto(`http://localhost:${server.address().port}`);await page.bringToFront();
const cdp=await context.browser().newBrowserCDPSession();
await worker.evaluate(()=>chrome.action.openPopup());
const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/sm/popup.html'));assert.ok(target,'native toolbar popup target');
const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
let nextId=0;const pending=new Map();
cdp.on('Target.receivedMessageFromTarget',event=>{if(event.sessionId!==sessionId)return;const r=JSON.parse(event.message);const p=pending.get(r.id);if(p){pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
let metrics;
for(let i=0;i<30;i++){
 const r=await send('Runtime.evaluate',{expression:`JSON.stringify({width:innerWidth,height:innerHeight,bodyWidth:document.body?.getBoundingClientRect().width,scrollWidth:document.documentElement.scrollWidth,state:document.querySelector('#state')?.textContent,host:document.querySelector('#host')?.textContent,buttons:[...document.querySelectorAll('button')].map(b=>({id:b.id,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))})`,returnByValue:true});metrics=JSON.parse(r.result.value);
 if(metrics.state?.includes('当前：'))break;await new Promise(r=>setTimeout(r,100));
}
const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'native-popup.png'),Buffer.from(screenshot.data,'base64'));
const result={status:metrics.width>=375&&metrics.width<=400&&metrics.scrollWidth<=metrics.width?'PASS':'FAIL',browser:context.browser().version(),channel,entry:'chrome.action.openPopup()',build:JSON.parse(await readFile('build/sm-ad-filter/SM-BUILD.json','utf8')),metrics};await writeFile(path.join(out,'native-popup.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
assert.equal(result.status,'PASS');assert.match(metrics.state,/当前：/);assert.ok(metrics.buttons.every(b=>b.width>=50&&b.height<=65));
}finally{await context?.close();await new Promise(r=>server.close(r));}
