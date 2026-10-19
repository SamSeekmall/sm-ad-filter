// Native popup latency benchmark, schema 3. Opens the real toolbar popup from an extension page and records, per sample,
// the browser's open acknowledgement, the time until the protection state is visible, and the worker-side segments
// reported by the popup itself (wait for init, handler time, whether the open woke a stopped worker).
//   node sm/popup-benchmark.mjs [baseline-extension-dir]
// Env: SM_BROWSER_CHANNEL (chromium|chrome|msedge), SM_SAMPLES (warm, default 30), SM_WAKE_SAMPLES (default = SM_SAMPLES),
//      SM_RESTART_SAMPLES (default 5), SM_LOAD (normal|high), SM_SAMPLE_TIMEOUT_MS (default 15000).
// The baseline build (0.4.2) predates in-popup segment timing, so only its end-to-end time is recorded.
// Slow or failed samples are reported, never dropped or retried. A finished run is not a passed gate: see sm/perf-gate.mjs.
import {tmpdir,cpus,loadavg,totalmem,freemem,platform,release} from 'node:os';
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {summarize} from './perf-stats.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('build/qa/browsers');
const {chromium}=await import('../build/qa/node_modules/playwright/index.mjs');
const channel=process.env.SM_BROWSER_CHANNEL||'chromium';
const warmN=Number(process.env.SM_SAMPLES||30),wakeN=Number(process.env.SM_WAKE_SAMPLES||warmN),restartN=Number(process.env.SM_RESTART_SAMPLES||5);
const load=process.env.SM_LOAD||'normal',timeoutMs=Number(process.env.SM_SAMPLE_TIMEOUT_MS||15000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer((req,res)=>res.end('<!doctype html><title>Fixture</title>Normal content'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const out=path.resolve(`build/qa-popup-performance-${channel}`);await mkdir(out,{recursive:true});
const baselineDir=process.argv[2]?path.resolve(process.argv[2]):null;
const report={schema:3,scope:'Native toolbar popup, isolated profiles, interleaved builds, failures and timeouts counted. Not a daily-profile measurement and not a speed guarantee.',channel,config:{samples:warmN,wakeSamples:wakeN,restartSamples:restartN,load,timeoutMs,interleaved:Boolean(baselineDir)},system:{platform:platform(),release:release(),cpuModel:cpus()[0]?.model,cpuCount:cpus().length,totalMemMB:Math.round(totalmem()/1048576),loadAvgStart:loadavg(),node:process.version},runs:[]};
const save=()=>writeFile(path.join(out,'native-timing.json'),JSON.stringify(report,null,2));
const burners=[];
function startLoad(){if(load!=='high')return;for(let i=0;i<cpus().length;i++)burners.push(spawn(process.execPath,['-e','for(;;){}'],{stdio:'ignore'}));report.system.syntheticLoad=`${burners.length} busy-loop processes`;}
const stopLoad=()=>{for(const b of burners)b.kill('SIGKILL');};
const args=dir=>[`--disable-extensions-except=${dir}`,`--load-extension=${dir}`,'--host-resolver-rules=MAP example.com 127.0.0.1','--no-proxy-server'];
async function launch(rig){
    rig.context=await chromium.launchPersistentContext(rig.profile,{channel,headless:true,args:args(rig.extension)});
    rig.context.setDefaultTimeout(60000);
    const worker=rig.context.serviceWorkers()[0]||await rig.context.waitForEvent('serviceworker');rig.id=new URL(worker.url()).host;
    rig.fixture=await rig.context.newPage();await rig.fixture.goto(`http://example.com:${server.address().port}`);
    rig.driver=await rig.context.newPage();
    // After a browser restart drive from a static extension file so the driver itself does not wake the worker.
    rig.driverKind=rig.restarted?'static-extension-file':'control-center';
    if(rig.restarted){await rig.driver.goto(`chrome-extension://${rig.id}/sm/TABLER-LICENSE.txt`);if(!await rig.driver.evaluate(()=>typeof chrome?.action?.openPopup==='function')){rig.driverKind='control-center';await rig.driver.goto(`chrome-extension://${rig.id}/welcome.html`);}}
    else{await rig.driver.goto(`chrome-extension://${rig.id}/welcome.html`);await rig.driver.locator('#status-refresh[data-state=success]').waitFor({state:'attached'});}
    rig.cdp=await rig.context.browser().newBrowserCDPSession();rig.sw=await rig.context.newCDPSession(rig.driver);rig.stopped=false;
    rig.sw.on('ServiceWorker.workerVersionUpdated',e=>{if(e.versions.some(v=>v.scriptURL.includes(rig.id)&&v.runningStatus==='stopped'))rig.stopped=true;});
    await rig.sw.send('ServiceWorker.enable');
}
async function stopWorker(rig){rig.stopped=false;await rig.sw.send('ServiceWorker.stopAllWorkers');for(let n=0;n<100&&!rig.stopped;n++)await sleep(50);if(!rig.stopped)throw new Error('worker stop not confirmed');}
async function popupTarget(rig){for(let n=0;n<60;n++){const t=(await rig.cdp.send('Target.getTargets')).targetInfos.find(x=>x.url.endsWith('/sm/popup.html'));if(t)return t;await sleep(50);}throw new Error('popup target did not appear');}
async function sample(rig,kind){
    const record={kind,ok:false};let closeId;
    try{
        if(kind!=='warm')await stopWorker(rig);
        await rig.fixture.bringToFront();await sleep(300);
        const start=performance.now();
        await rig.driver.evaluate(()=>chrome.action.openPopup());record.openAckMs=Math.round(performance.now()-start);
        const target=await popupTarget(rig);closeId=target.targetId;
        const {sessionId}=await rig.cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
        let seq=0;const pending=new Map();
        const listener=e=>{if(e.sessionId!==sessionId)return;const r=JSON.parse(e.message),p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}};rig.cdp.on('Target.receivedMessageFromTarget',listener);
        const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++seq,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timed out'));},5000);pending.set(n,{resolve,reject,timer});rig.cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:n,method,params})}).catch(reject);});
        try{
            let data;const deadline=start+timeoutMs;
            do{const r=await call('Runtime.evaluate',{expression:`JSON.stringify({state:document.querySelector('#state')?.textContent,timing:document.documentElement.dataset.timing||null,width:innerWidth})`,returnByValue:true});data=JSON.parse(r.result.value);if(data.state?.includes('已开启保护')&&(data.timing||!rig.reportsTiming))break;await sleep(25);}while(performance.now()<deadline);
            record.stateObservedMs=Math.round(performance.now()-start);record.width=data.width;
            if(data.timing)record.timing=JSON.parse(data.timing);
            record.ok=Boolean(data.state?.includes('已开启保护')&&(data.timing||!rig.reportsTiming));
            if(!record.ok){record.timedOut=true;record.error=`protection state not visible within ${timeoutMs} ms (state: ${data.state})`;}
        }finally{rig.cdp.off('Target.receivedMessageFromTarget',listener);}
    }catch(error){record.error=String(error.message||error);record.timedOut=/time(d)? ?out|did not appear/i.test(record.error);}
    finally{if(closeId)await rig.cdp.send('Target.closeTarget',{targetId:closeId}).catch(()=>{});await sleep(250);}
    return record;
}
async function relaunch(rig){await rig.context.close();rig.restarted=true;await launch(rig);}
async function main(){
    const rigs=[];
    if(baselineDir)rigs.push({label:'baseline',extension:baselineDir});
    rigs.push({label:'current',extension:path.resolve('build/sm-ad-filter')});
    for(const rig of rigs){rig.profile=path.join(tmpdir(),`sm-ad-filter-bench-${rig.label}-${crypto.randomUUID()}`);rig.build=JSON.parse(await readFile(path.join(rig.extension,'SM-BUILD.json'),'utf8'));rig.reportsTiming=rig.label==='current';rig.run={label:rig.label,build:rig.build,samples:[],groups:{}};report.runs.push(rig.run);await launch(rig);}
    report.browserVersion=rigs[0].context.browser().version();await save();
    startLoad();
    try{
        for(const [kind,count] of [['warm',warmN],['wake',wakeN],['restart',restartN]]){
            for(let i=0;i<count;i++){
                // Alternate which build goes first so order and drift are not charged to one of them.
                for(const rig of (i%2?[...rigs].reverse():rigs)){
                    if(kind==='restart')await relaunch(rig);
                    const s=await sample(rig,kind);s.index=i;rig.run.samples.push(s);rig.run.groups[kind]=summarize(rig.run.samples.filter(x=>x.kind===kind));
                    console.log(rig.label,kind,i,s.ok?`${s.stateObservedMs} ms (ack ${s.openAckMs}, wait-init ${s.timing?.worker?.waitForInitMs}, handler ${s.timing?.worker?.handlerMs}, woke ${s.timing?.worker?.wokeWorker})`:`FAILED ${s.error}`);
                }
                if(i%5===4)await save();
            }
        }
        report.system.loadAvgEnd=loadavg();report.system.freeMemMBEnd=Math.round(freemem()/1048576);
        report.status='COMPLETE';
    }finally{stopLoad();for(const rig of rigs)await rig.context.close().catch(()=>{});}
}
try{await main();}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{await save();await new Promise(r=>server.close(r));}
