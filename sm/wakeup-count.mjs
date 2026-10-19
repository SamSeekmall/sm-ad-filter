// How often does an ordinary page load wake a stopped service worker? Counts worker starts after stopAllWorkers.
//   node sm/wakeup-count.mjs <extension-dir> [loads]
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('build/qa/browsers');
const {chromium}=await import('../build/qa/node_modules/playwright/index.mjs');
const ext=path.resolve(process.argv[2]),loads=Number(process.argv[3]||10),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer((req,res)=>res.end('<!doctype html><title>Fixture</title><p>Normal content</p>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
const context=await chromium.launchPersistentContext(path.join(tmpdir(),`sm-wake-${crypto.randomUUID()}`),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--host-resolver-rules=MAP example.com 127.0.0.1','--no-proxy-server']});
try{
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
    const driver=await context.newPage();await driver.goto(`chrome-extension://${id}/welcome.html`);await driver.locator('#status').filter({hasText:'默认：'}).waitFor();
    const sw=await context.newCDPSession(driver);let state='unknown',starts=0;
    sw.on('ServiceWorker.workerVersionUpdated',e=>{for(const v of e.versions){if(!v.scriptURL.includes(id))continue;if(v.runningStatus==='running'&&state!=='running')starts++;state=v.runningStatus;}});
    await sw.send('ServiceWorker.enable');await sleep(500);
    const page=await context.newPage();const result=[];
    for(let i=0;i<loads;i++){
        starts=0;state='unknown';await sw.send('ServiceWorker.stopAllWorkers');await sleep(600);
        await page.goto(`http://example.com:${server.address().port}/?n=${i}`);await sleep(1800);   // idle-time content scripts have run by now
        result.push(starts);
    }
    console.log(JSON.stringify({extension:ext,loads,workerStartsPerLoad:result,loadsThatWokeWorker:result.filter(n=>n>0).length}));
}finally{await context.close();server.close();}
