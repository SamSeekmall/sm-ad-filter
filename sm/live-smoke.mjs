// Public, read-only smoke checks in isolated profiles. No login, posts or purchases.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'build/qa/browsers');
const {chromium}=await import('../build/qa/node_modules/playwright/index.mjs');
const out=path.join(root,'build/qa-v2/live');await mkdir(out,{recursive:true});
const sites=[['wikipedia','https://www.wikipedia.org/'],['bing','https://www.bing.com/search?q=browser+extensions'],['bbc','https://www.bbc.com/'],['youtube','https://www.youtube.com/'],['amazon','https://www.amazon.com/']];
const results=[];
for(const filtered of [false,true]){
    const context=await chromium.launchPersistentContext(path.join(root,`build/qa/live-${filtered}-${Date.now()}`),{channel:'chromium',headless:true,args:filtered?[`--disable-extensions-except=${path.join(root,'build/sm-ad-filter')}`,`--load-extension=${path.join(root,'build/sm-ad-filter')}`]:[]});
    try{
        if(filtered){const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:20000});const id=new URL(worker.url()).host;const control=await context.newPage();await control.goto(`chrome-extension://${id}/welcome.html`);await control.locator('#status').filter({hasText:'默认：'}).waitFor();await control.close();}
        for(const [name,url] of sites){
            const page=await context.newPage();let requests=0,failures=0;page.on('request',()=>requests++);page.on('requestfailed',()=>failures++);const started=Date.now();
            try{
                const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
                const domReadyMs=Date.now()-started;
                await page.waitForFunction(()=>document.body?.innerText.length>300,{},{timeout:5000}).catch(()=>{});
                const content=await page.locator('body').innerText({timeout:8000});const title=await page.title();
                const blocked=/captcha|verify you are human|access denied|unusual traffic|robot check/i.test(title+' '+content.slice(0,1800));
                const record={name,url,filtered,http:response?.status(),title,bodyCharacters:content.length,requests,failedRequests:failures,domReadyMs,observationMs:Date.now()-started,classification:blocked?'CHALLENGE_OR_DENIAL':response?.ok()&&content.length>300?'PAGE_LOADED':'REQUIRES_REVIEW',adEffectiveness:'NOT_ASSESSED',loginCheckoutPlayback:'NOT_TESTED'};
                results.push(record);await page.screenshot({path:path.join(out,`${name}-${filtered?'filtered':'baseline'}.png`)});console.log(JSON.stringify(record));
            }catch(error){const record={name,url,filtered,classification:'UNAVAILABLE',error:error.message.split('\n')[0]};results.push(record);console.log(JSON.stringify(record));}
            finally{await page.close();}
        }
    }finally{await context.close();}
}
await writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Public-page read-only smoke, not ad efficacy or user acceptance',results},null,2));
