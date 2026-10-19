import {tmpdir} from 'node:os';
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
context=await chromium.launchPersistentContext(path.join(tmpdir(),`sm-ad-filter-native-${channel}-${crypto.randomUUID()}`),{channel,headless:true,args:[`--disable-extensions-except=${path.resolve('build/sm-ad-filter')}`,`--load-extension=${path.resolve('build/sm-ad-filter')}`,'--host-resolver-rules=MAP example.com 127.0.0.1','--no-proxy-server']});
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
const driver=await context.newPage();await driver.goto(`chrome-extension://${new URL(worker.url()).host}/welcome.html`);await driver.bringToFront();await driver.locator('#status-refresh[data-state=success]').waitFor({state:'attached',timeout:60000});
const page=await context.newPage();await page.goto(`http://example.com:${server.address().port}`);await page.bringToFront();
const cdp=await context.browser().newBrowserCDPSession();
const openedAt=performance.now();await driver.evaluate(()=>chrome.action.openPopup());const openAckMs=performance.now()-openedAt;
const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/sm/popup.html'));assert.ok(target,'native toolbar popup target');
const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
let nextId=0;const pending=new Map();
cdp.on('Target.receivedMessageFromTarget',event=>{if(event.sessionId!==sessionId)return;const r=JSON.parse(event.message);const p=pending.get(r.id);if(p){pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
let metrics;
for(let i=0;i<150;i++){
 const r=await send('Runtime.evaluate',{expression:`JSON.stringify({width:innerWidth,height:innerHeight,bodyWidth:document.body?.getBoundingClientRect().width,scrollWidth:document.documentElement.scrollWidth,state:document.querySelector('#state')?.textContent,host:document.querySelector('#host')?.textContent,buttons:[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>({id:b.id,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))})`,returnByValue:true});metrics=JSON.parse(r.result.value);
 if(metrics.state?.includes('已开启保护'))break;await new Promise(r=>setTimeout(r,100));
}
const stateObservedMs=performance.now()-openedAt;const timingResult=await send('Runtime.evaluate',{expression:'JSON.stringify({paint:performance.getEntriesByType("paint").map(x=>({name:x.name,ms:x.startTime})),marks:performance.getEntriesByType("mark").map(x=>({name:x.name,ms:x.startTime})),domReady:performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd})',returnByValue:true});const timing={openAckMs,stateObservedMs,page:JSON.parse(timingResult.result.value)};
assert.match(metrics.state,/已开启保护/);assert.ok(metrics.width>=375&&metrics.width<=400&&metrics.scrollWidth<=metrics.width);
const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'native-popup.png'),Buffer.from(screenshot.data,'base64'));
const result={status:metrics.width>=375&&metrics.width<=400&&metrics.scrollWidth<=metrics.width?'PASS':'FAIL',browser:context.browser().version(),channel,entry:'chrome.action.openPopup() from extension page, engine preloaded; cold wake tested separately',timing,build:JSON.parse(await readFile('build/sm-ad-filter/SM-BUILD.json','utf8')),metrics};await writeFile(path.join(out,'native-popup.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
assert.equal(result.status,'PASS');assert.match(metrics.state,/已开启保护/);assert.ok(metrics.buttons.every(b=>b.width>=50&&b.height<=65));
// Navigate through the real element-tools link and explicit return link.
await send('Runtime.evaluate',{expression:"setTimeout(()=>document.querySelector('#elements').click(),0)"});
async function waitExpression(expression){for(let i=0;i<150;i++){try{const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.result.value)return;}catch(e){if(!/context|Cannot find/i.test(e.message))throw e;}await new Promise(r=>setTimeout(r,100));}throw Error('Navigation condition failed: '+expression);}
await waitExpression("Boolean(document.querySelector('#smBack'))&&!document.body.classList.contains('loading')&&!document.body.classList.contains('busy')");
const toolsShot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'element-tools.png'),Buffer.from(toolsShot.data,'base64'));
const backRect=await send('Runtime.evaluate',{expression:"JSON.stringify((()=>{const r=document.querySelector('#smBack').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})())",returnByValue:true});
const backPoint=JSON.parse(backRect.result.value);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...backPoint});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...backPoint});
await waitExpression("document.querySelector('#state')?.textContent.includes('已开启保护')&&!document.querySelector('#pause')?.disabled");
result.navigation='elements -> explicit back -> ready PASS';
// Exercise native popup controls through the same renderer.
await send('Runtime.evaluate',{expression:`document.querySelector('#modeDetails').open=true; document.querySelector('#mode').value='1';document.querySelector('#apply').click();`});
for(let i=0;i<150;i++){const r=await send('Runtime.evaluate',{expression:`document.querySelector('#modeLabel').textContent==='基础'&&!document.querySelector('#pause').disabled`,returnByValue:true});if(r.result.value)break;if(i===149)throw Error('Mode UI did not apply');await new Promise(r=>setTimeout(r,100));}
await send('Runtime.evaluate',{expression:`document.querySelector('#pause').click()`});
for(let i=0;i<150;i++){const r=await send('Runtime.evaluate',{expression:`document.querySelector('#pauseLabel').textContent==='恢复保护'&&!document.querySelector('#pause').disabled`,returnByValue:true});if(r.result.value)break;if(i===149)throw Error('Pause UI did not apply');await new Promise(r=>setTimeout(r,100));}
await send('Runtime.evaluate',{expression:`document.querySelector('#pause').click()`});
for(let i=0;i<150;i++){const r=await send('Runtime.evaluate',{expression:`document.querySelector('#state').textContent.includes('已开启保护')&&!document.querySelector('#pause').disabled`,returnByValue:true});if(r.result.value)break;if(i===149)throw Error('Resume UI did not apply');await new Promise(r=>setTimeout(r,100));}
result.interactions='mode, pause and resume PASS';await writeFile(path.join(out,'native-popup.json'),JSON.stringify(result,null,2));
}catch(error){await writeFile(path.join(out,'native-popup.json'),JSON.stringify({status:'FAIL',error:error.stack}));throw error;}finally{await context?.close();await new Promise(r=>server.close(r));}
