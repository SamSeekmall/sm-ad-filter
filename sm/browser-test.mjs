// Isolated browser integration suite. No daily user profile is touched.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'build/qa/browsers');
const {chromium}=await import('../build/qa/node_modules/playwright/index.mjs');
const browserChannel=process.env.SM_BROWSER_CHANNEL||'chromium';
const qa=path.join(root,browserChannel==='chromium'?'build/qa-v2':`build/qa-v2-${browserChannel}`);await mkdir(qa,{recursive:true});
const results=[];let adRequests=0,failList=false;
const buildMetadata=JSON.parse(await readFile(path.join(root,'build/sm-ad-filter/SM-BUILD.json'),'utf8'));
const server=createServer((req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    if(req.url.startsWith('/ad.js')){adRequests++;res.end('AD_FIXTURE');return;}
    if(req.url.startsWith('/list.txt')){res.writeHead(failList?503:200,{'Content-Type':'text/plain'});res.end(failList?'unavailable':'! Title: SM fixture\n! Expires: 1 day\n||fixture-ad.example^\nlocalhost##.sponsor');return;}
    res.setHeader('Content-Type','text/html');
    const label=req.url.includes('unsafe')?'Accept all':'Reject all';
    res.end(`<!doctype html><title>SM regression fixture</title><h1>Normal content</h1><div class="sponsor">Sponsor</div><form id="form"><label>Search <input id="search" required></label><button>Submit</button></form><p id="result"></p><div id="onetrust-banner-sdk"><button id="onetrust-reject-all-handler">${label}</button></div><script>document.querySelector('#form').onsubmit=e=>{e.preventDefault();document.querySelector('#result').textContent=document.querySelector('#search').value};document.querySelector('#onetrust-reject-all-handler').onclick=()=>{window.rejected=true;document.querySelector('#onetrust-banner-sdk').remove()};</script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
const profile=path.join(root,`build/qa/profile-v2-${Date.now()}`);
const options={channel:browserChannel,headless:true,args:[`--disable-extensions-except=${path.join(root,'build/sm-ad-filter')}`,`--load-extension=${path.join(root,'build/sm-ad-filter')}`,'--host-resolver-rules=MAP doubleclick.net 127.0.0.1','--no-proxy-server']};
let context,page,fixture,id;const errors=[];
async function launch(){
    context=await chromium.launchPersistentContext(profile,options);
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');id=new URL(worker.url()).host;
    page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`chrome-extension://${id}/welcome.html`);
    try { await page.locator('#status').filter({hasText:'默认：'}).waitFor({timeout:15000}); }
    catch(error) { console.log(await page.locator('body').innerText()); console.log('Page errors',errors); throw error; }
    fixture=await context.newPage();await fixture.goto(`http://localhost:${port}/`);
}
const sm=(what,args={})=>page.evaluate(async r=>{const a=await chrome.runtime.sendMessage(r);if(!a?.ok)throw new Error(a?.error||'No reply');return a.data;},{what,...args});
const upstream=(what,args={})=>page.evaluate(r=>chrome.runtime.sendMessage(r),{what,...args});
async function scenario(name,fn){await fn();results.push({name,status:'PASS'});console.log(`PASS ${name}`);}
async function eventually(fn){let last;for(let i=0;i<30;i++){try{return await fn();}catch(e){last=e;await new Promise(r=>setTimeout(r,150));}}throw last;}
const request=()=>eventually(()=>fixture.evaluate(async url=>{try{const r=await fetch(url);return {url:r.url,text:await r.text()};}catch{return {blocked:true}}},`http://doubleclick.net:${port}/ad.js?t=${Date.now()}`));
const reloadAction=action=>Promise.all([fixture.waitForEvent('load'),action()]);
try{
    await launch();
    await scenario('UI, Chinese rules, and permissions diagnostics',async()=>{
        await page.bringToFront();
        await page.locator('#enable').click();await page.locator('#notice').filter({hasText:'操作完成'}).waitFor();
        const status=await sm('sm:status',{hostname:'localhost'});assert.ok(status.enabledRulesets.includes('chn-0'));assert.equal(status.hasAccess,true);
        await page.screenshot({path:path.join(qa,'01-control-center.png'),fullPage:true});
        await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        await page.screenshot({path:path.join(qa,'02-narrow-layout.png'),fullPage:true});await page.setViewportSize({width:1280,height:900});
    });
    await scenario('Network filter, timed pause, resume, normal form',async()=>{
        const blocked=await request();assert.ok(blocked.blocked||blocked.url.startsWith('chrome-extension://'));assert.equal(adRequests,0);
        await reloadAction(()=>sm('sm:pause',{hostname:'localhost',duration:'10m'}));assert.equal((await request()).text,'AD_FIXTURE');
        await reloadAction(()=>sm('sm:resume',{hostname:'localhost'}));const restored=await request();assert.ok(restored.blocked||restored.url.startsWith('chrome-extension://'));
        await fixture.locator('#search').fill('normal form still works');await fixture.locator('#form button').click();assert.equal(await fixture.locator('#result').textContent(),'normal form still works');
    });
    await scenario('Alarm restores expired pause',async()=>{
        await reloadAction(()=>sm('sm:pause',{hostname:'localhost',duration:'10m'}));
        await page.evaluate(()=>chrome.alarms.create('sm:pause:localhost',{when:Date.now()+100}));
        await eventually(async()=>assert.equal((await sm('sm:status',{hostname:'localhost'})).level,2));
    });
    await scenario('Custom element hide, delete and undo',async()=>{
        await upstream('addCustomFilters',{hostname:'localhost',selectors:['.sponsor']});await fixture.reload();await fixture.locator('.sponsor').waitFor({state:'hidden'});
        await sm('sm:removeFilter',{hostname:'localhost',selector:'.sponsor'});await fixture.reload();await fixture.locator('.sponsor').waitFor({state:'visible'});
        await sm('sm:undo');await fixture.reload();await fixture.locator('.sponsor').waitFor({state:'hidden'});
    });
    await scenario('Migration validation, restore readback and undo',async()=>{
        const baseline=await sm('sm:snapshot');const data=structuredClone(baseline);data.settings.filteringModes.none.push('example.com');
        await sm('sm:preview',{data});await sm('sm:restore',{data});assert.equal((await upstream('getFilteringMode',{hostname:'example.com'})),0);
        const bad=structuredClone(data);bad.settings.enabledRulesets=['made-up'];await assert.rejects(()=>sm('sm:restore',{data:bad}));
        await sm('sm:undo');assert.equal((await upstream('getFilteringMode',{hostname:'example.com'})),2);
    });
    await scenario('Cookie reject opt-in, off mode and unsafe label',async()=>{
        await sm('sm:cookieToggle',{enabled:true});await fixture.goto(`http://localhost:${port}/cookie`);await fixture.locator('#onetrust-banner-sdk').waitFor({state:'detached'});
        await eventually(async()=>assert.match((await sm('sm:status',{hostname:'localhost'})).cookies.result,/已点击|已消失/));
        await fixture.goto(`http://localhost:${port}/unsafe`);await fixture.waitForTimeout(1200);assert.equal(await fixture.evaluate(()=>window.rejected===true),false);
        await reloadAction(()=>sm('sm:setMode',{hostname:'localhost',level:0}));await fixture.goto(`http://localhost:${port}/cookie-disabled`);await fixture.waitForTimeout(1200);
        assert.equal(await fixture.locator('#onetrust-banner-sdk').count(),1);await reloadAction(()=>sm('sm:setMode',{hostname:'localhost',level:2}));
    });
    await scenario('Sync opt-in, conflict detection, preview and deletion',async()=>{
        await assert.rejects(()=>sm('sm:syncRead'));await sm('sm:syncEnable',{enabled:true});
        const cloud=await sm('sm:syncWrite',{expectedRevision:null});assert.ok(cloud.revision);
        await assert.rejects(()=>sm('sm:syncWrite',{expectedRevision:null}));assert.equal((await sm('sm:syncRead')).revision,cloud.revision);
        await sm('sm:preview',{data:cloud.data});await sm('sm:syncDelete');assert.equal(await sm('sm:syncRead'),null);await sm('sm:syncEnable',{enabled:false});
    });
    await scenario('Imported list success, failure status and cache retained',async()=>{
        const url=`http://localhost:${port}/list.txt`;await upstream('importFilterList',{url});
        let lists=await sm('sm:lists');const list=lists.find(x=>x.id===url);assert.ok(list.smSuccessAt);
        const cached=await page.evaluate(url=>chrome.storage.local.get(`rulesets.imported.compiled.${url}`),url);
        failList=true;await sm('sm:updateLists');lists=await sm('sm:lists');const failed=lists.find(x=>x.id===url);
        assert.equal(failed.smSuccessAt,list.smSuccessAt);assert.ok(failed.smError);
        const after=await page.evaluate(url=>chrome.storage.local.get(`rulesets.imported.compiled.${url}`),url);assert.deepEqual(after,cached);
        // Remove the local test subscription before subsequent scenarios.
        const enabled=await upstream('getEnabledRulesets');await upstream('applyRulesets',{enabledRulesets:enabled.filter(x=>x!==url),toRemove:[url]});
    });
    await scenario('Session pause restored after complete browser restart',async()=>{
        await reloadAction(()=>sm('sm:pause',{hostname:'localhost',duration:'session'}));await context.close();await launch();
        assert.equal((await sm('sm:status',{hostname:'localhost'})).level,2);assert.deepEqual((await sm('sm:status')).pauses,{});
    });
    await scenario('Popup and owned feedback entry',async()=>{
        await page.goto(`chrome-extension://${id}/sm/popup.html`);await page.locator('#center').waitFor();await page.screenshot({path:path.join(qa,'03-popup.png')});
        await page.goto(`chrome-extension://${id}/report.html`);await page.waitForURL('**/welcome.html#feedback');
        assert.deepEqual(errors,[]);
    });
    await writeFile(path.join(qa,'browser-test.json'),JSON.stringify({status:'PASS',browser:context.browser().version(),browserChannel,buildMetadata,results,pageErrors:errors,crossDeviceSync:'NOT_TESTED',liveConsentServices:'NOT_TESTED'},null,2));
}catch(error){await writeFile(path.join(qa,'browser-test.json'),JSON.stringify({status:'FAIL',results,error:error.stack,pageErrors:errors},null,2));throw error;}
finally{await context?.close();await new Promise(resolve=>server.close(resolve));}
