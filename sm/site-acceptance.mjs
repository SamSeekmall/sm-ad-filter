// Representative-site acceptance harness.
//   node sm/site-acceptance.mjs              public read-only loads, with and without the extension (needs network access)
//   node sm/site-acceptance.mjs --selftest   exercises the classification logic against local fixture pages (no internet)
// Automatic checks never log in, play, submit or buy. Manual tasks from sm/site-catalog.json are emitted as NOT_RUN
// rows in build/qa-sites/ACCEPTANCE-TRACKER.md for a person to complete; a page that merely loads is not a pass.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=process.cwd();process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'build/qa/browsers');
const {chromium}=await import('../build/qa/node_modules/playwright/index.mjs');
const selftest=process.argv.includes('--selftest'),channel=process.env.SM_BROWSER_CHANNEL||'chromium';
const catalog=JSON.parse(await readFile(new URL('./site-catalog.json',import.meta.url),'utf8'));
const out=path.join(root,selftest?'build/qa-sites-selftest':'build/qa-sites');await mkdir(out,{recursive:true});
const challenge=/captcha|verify you are human|access denied|unusual traffic|robot check|are you a robot|请完成验证|安全验证/i;
// Pure classification so it can be unit-checked: filtered page must still be a usable page relative to the baseline.
export function classify(base,filt){
    if(!base||base.error)return {verdict:'UNAVAILABLE',reason:base?.error||'baseline did not load'};
    if(base.challenge)return {verdict:'BASELINE_CHALLENGED',reason:'site served a verification page without the extension; not comparable'};
    if(!filt||filt.error)return {verdict:'FAIL',reason:`loads without the extension but not with it: ${filt?.error||'no result'}`};
    if(filt.challenge)return {verdict:'FAIL',reason:'verification page only appears with the extension'};
    const reasons=[];
    if(!(filt.http>=200&&filt.http<400))reasons.push(`HTTP ${filt.http}`);
    if(base.expectFound&&!filt.expectFound)reasons.push('expected element missing with the extension');
    if(base.chars>300&&filt.chars<base.chars*0.7)reasons.push(`visible text dropped to ${Math.round(100*filt.chars/base.chars)}% of baseline`);
    if(filt.pageErrors>base.pageErrors+2)reasons.push(`${filt.pageErrors-base.pageErrors} more page errors`);
    return reasons.length?{verdict:'REVIEW',reason:reasons.join('; ')}:{verdict:'AUTO_OK',reason:'public page loaded comparably; manual tasks still required'};
}
async function visit(context,site,timeout){
    const page=await context.newPage();let pageErrors=0,blocked=0;page.on('pageerror',()=>pageErrors++);page.on('requestfailed',r=>{if(/ERR_BLOCKED_BY_CLIENT/.test(r.failure()?.errorText||''))blocked++;});
    try{
        const response=await page.goto(site.url,{waitUntil:'domcontentloaded',timeout});
        await page.waitForTimeout(3000);
        const text=await page.locator('body').innerText({timeout:8000}).catch(()=>'');
        const expectFound=site.expect?await page.locator(site.expect).first().count().then(n=>n>0).catch(()=>false):true;
        return {http:response?.status(),title:await page.title(),chars:text.length,challenge:challenge.test(`${await page.title()} ${text.slice(0,1800)}`),expectFound,pageErrors,blockedRequests:blocked,finalHost:new URL(page.url()).host};
    }catch(error){return {error:error.message.split('\n')[0]};}
    finally{await page.close();}
}
async function session(filtered,sites,timeout){
    const ext=path.join(root,'build/sm-ad-filter');
    const context=await chromium.launchPersistentContext(path.join(tmpdir(),`sm-sites-${filtered}-${crypto.randomUUID()}`),{channel,headless:true,args:filtered?[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]:[]});
    try{
        if(filtered){const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:20000});const control=await context.newPage();await control.goto(`chrome-extension://${new URL(worker.url()).host}/welcome.html`);await control.locator('#status').filter({hasText:'默认：'}).waitFor({timeout:30000});}
        const results={};for(const site of sites)results[site.id]=await visit(context,site,timeout);return results;
    }finally{await context.close();}
}
let sites=catalog.sites,server;
if(selftest){
    server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');
        if(req.url==='/ok')return res.end(`<h1>ok</h1><main>${'content '.repeat(120)}</main>`);
        if(req.url==='/captcha')return res.end('<title>Access denied</title>Please verify you are human');
        res.statusCode=404;res.end('missing');});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
    sites=[{id:'fixture-ok',url:`${base}/ok`,expect:'main'},{id:'fixture-captcha',url:`${base}/captcha`,expect:'main'},{id:'fixture-404',url:`${base}/nope`,expect:'main'}];
}
const timeout=Number(process.env.SM_SITE_TIMEOUT_MS||25000);
try{
    const baseline=await session(false,sites,timeout),filtered=await session(true,sites,timeout);
    const rows=sites.map(site=>({id:site.id,category:site.category,url:site.url,baseline:baseline[site.id],filtered:filtered[site.id],...classify(baseline[site.id],filtered[site.id]),manualTasks:(site.manual||[]).map(task=>({task,status:'NOT_RUN'}))}));
    const summary=Object.fromEntries(['AUTO_OK','REVIEW','FAIL','UNAVAILABLE','BASELINE_CHALLENGED'].map(v=>[v,rows.filter(r=>r.verdict===v).length]));
    const report={schema:1,scope:selftest?'SELF-TEST on local fixtures only':'Public read-only loads, isolated profiles. AUTO_OK is not acceptance: manual tasks (login, playback, forms, checkout up to payment) are NOT_RUN.',channel,browser:null,summary,manualTasksNotRun:rows.reduce((n,r)=>n+r.manualTasks.length,0),rows};
    await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));
    const md=['# 代表站点验收记录','',selftest?'**自检（本地夹具），不是真实站点结果。**':'自动项只代表公开页面可读取；以下人工任务全部 NOT_RUN，完成前不得称为兼容性通过。','','| 站点 | 自动检查 | 说明 | 人工任务 | 结果 | 浏览器/构建 | 日期 | 执行人 |','|---|---|---|---|---|---|---|---|',...rows.flatMap(r=>(r.manualTasks.length?r.manualTasks:[{task:'（无）',status:''}]).map((t,i)=>`| ${i?'':r.id} | ${i?'':r.verdict} | ${i?'':r.reason} | ${t.task} | ${t.status} |  |  |  |`))].join('\n');
    await writeFile(path.join(out,'ACCEPTANCE-TRACKER.md'),md+'\n');
    console.log(JSON.stringify({summary,manualTasksNotRun:report.manualTasksNotRun,out},null,2));
    if(selftest){
        const by=Object.fromEntries(rows.map(r=>[r.id,r.verdict]));
        if(by['fixture-ok']!=='AUTO_OK'||by['fixture-captcha']!=='BASELINE_CHALLENGED'||by['fixture-404']!=='REVIEW'&&by['fixture-404']!=='UNAVAILABLE'){console.error('SELFTEST FAILED',by);process.exitCode=1;}
        else console.log('SELFTEST PASS',by);
    }
}finally{server?.close();}
