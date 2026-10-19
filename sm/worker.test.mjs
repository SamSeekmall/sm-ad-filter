import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const store={},sessionStore={},syncStore={},listeners=[],alarms=new Map();
const area=data=>({async get(key){if(key===null)return {...data};if(Array.isArray(key))return Object.fromEntries(key.map(k=>[k,data[k]]));return {[key]:data[key]};},async set(value){Object.assign(data,structuredClone(value));},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete data[k];}});
let modes={none:[],basic:[],optimal:['all-urls'],complete:[]},custom=[],enabled=['easylist'],ignoreNextMode=false;
// Fault / timing injection shared by the engine double below.
const faults=new Map(),hangOnce=new Set(),engineLog=[],realNow=Date.now;let skew=0;Date.now=()=>realNow()+skew;
const fail=(what,times=1,hook)=>faults.set(what,{times,hook});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let delay=0;
const config={enabledRulesets:enabled,autoReload:true,showBlockedCount:true,strictBlockMode:true,popupBlockMode:true,developerMode:false};
globalThis.chrome={storage:{local:area(store),session:area(sessionStore),sync:area(syncStore)},runtime:{id:'test',getURL:p=>`chrome-extension://test/${p}`,getManifest:()=>({declarative_net_request:{rule_resources:[{id:'easylist'},{id:'chn-0'}]}}),onMessage:{addListener:fn=>listeners.push(fn)}},alarms:{onAlarm:{addListener(){}},async create(k,v){alarms.set(k,v)},async clear(k){alarms.delete(k)}},tabs:{async query(){return []}}};
const {createController}=await import(process.env.SM_WORKER||'./worker.mjs');
const engine=async r=>{
    engineLog.push(r.what);
    const fault=faults.get(r.what);if(fault?.times>0){fault.times--;fault.hook?.();throw new Error(`injected ${r.what}`);}
    if(hangOnce.delete(r.what))return new Promise(()=>{});
    if(delay)await sleep(delay);
    switch(r.what){
        case 'getEnabledRulesets':return [...enabled];
        case 'setFilteringMode':{for(const k of Object.keys(modes))modes[k]=modes[k].filter(h=>h!==r.hostname);modes[['none','basic','optimal','complete'][r.level]].push(r.hostname);return r.level;}
        case 'removeCustomFilters':return;
        case 'importFilterList':return;
        case 'getCurrentConfig':return {...config,enabledRulesets:enabled};
        case 'getFilteringModeDetails':return structuredClone(modes);
        case 'setFilteringModeDetails':if(ignoreNextMode){ignoreNextMode=false;return;}modes=structuredClone(r.modes);return;
        case 'getFilteringMode':return modes.none.includes(r.hostname)?0:2;
        case 'getAllCustomFilters':return structuredClone(custom);
        case 'getSandboxFilters':return store.sandbox||'';
        case 'getImportedLists':return [];
        case 'applyRulesets':enabled=r.enabledRulesets;return;
        case 'setSandboxFilters':store.sandbox=r.text;return;
        case 'removeAllCustomFilters':custom=[];return;
        case 'addManyCustomFilters':custom=r.entries;return;
        case 'updateUserDnrRules':return;
        default:if(r.what.startsWith('set')){const key=r.what.slice(3);config[key[0].toLowerCase()+key.slice(1)]=r.state;return;}throw new Error(r.what);
    }
};
let ctl=createController(engine,Promise.resolve(),undefined,{retryDelays:[0,0]});
const send=r=>new Promise(resolve=>listeners.at(-1)(r,{id:'test',url:'chrome-extension://test/welcome.html'},resolve));
test('pause restores subtree, preserves unrelated changes, handles restart',async()=>{
    modes.basic=['example.com'];modes.complete=['child.shop.example.com'];
    assert.equal((await send({what:'sm:pause',hostname:'shop.example.com',duration:'session'})).ok,true);
    modes.basic.push('other.com');
    delete sessionStore['sm.session'];ctl=createController(engine,Promise.resolve(),undefined,{retryDelays:[0,0]});
    await send({what:'sm:snapshot'});
    assert.deepEqual(modes.none,[]);assert.deepEqual(modes.basic,['example.com','other.com']);assert.deepEqual(modes.complete,['child.shop.example.com']);
});
test('backup rejected before mutation and failed readback is rolled back',async()=>{
    const original=(await send({what:'sm:snapshot'})).data;
    const malformed=structuredClone(original);malformed.settings.filteringModes.none='invalid';
    assert.equal((await send({what:'sm:restore',data:malformed})).ok,false);
    assert.deepEqual((await send({what:'sm:snapshot'})).data.settings,original.settings);
    const changed=structuredClone(original);changed.settings.filteringModes.none.push('new.example.com');ignoreNextMode=true;
    const failed=await send({what:'sm:restore',data:changed});assert.equal(failed.ok,false);assert.match(failed.error,/已恢复原配置/);
    assert.deepEqual((await send({what:'sm:snapshot'})).data.settings,original.settings);
});
test('sync opt-in and stale revision gate prevent accidental overwrite',async()=>{
    assert.equal((await send({what:'sm:syncWrite'})).ok,false);
    await send({what:'sm:syncEnable',enabled:true});
    const first=await send({what:'sm:syncWrite',expectedRevision:null});assert.equal(first.ok,true);
    assert.equal((await send({what:'sm:syncWrite',expectedRevision:null})).ok,false);
    assert.equal(syncStore['sm.config'].revision,first.data.revision);
    store.sandbox='x'.repeat(8000);
    assert.equal((await send({what:'sm:syncWrite',expectedRevision:first.data.revision})).ok,false);
    assert.equal(syncStore['sm.config'].revision,first.data.revision);store.sandbox='';
});
test('stale import preview refuses to overwrite intervening local changes',async()=>{
    const data=(await send({what:'sm:snapshot'})).data;
    const preview=(await send({what:'sm:preview',data})).data;
    config.popupBlockMode=!config.popupBlockMode;
    const result=await send({what:'sm:restore',data,baseRevision:preview.baseRevision});assert.equal(result.ok,false);assert.match(result.error,/配置已变化/);
});
test('content script cannot export or change configuration',async()=>{
    const denied=await new Promise(resolve=>listeners.at(-1)({what:'sm:snapshot'},{id:'test',tab:{id:1},url:'https://example.com'},resolve));assert.equal(denied.ok,false);
});
test('diagnostic matches distinguish blocked, allowed, and unknown actions',async()=>{
    chrome.declarativeNetRequest={
        async getMatchedRules(){return {rulesMatchedInfo:[{rule:{rulesetId:'_dynamic',ruleId:1},timeStamp:1},{rule:{rulesetId:'_session',ruleId:2},timeStamp:2},{rule:{rulesetId:'missing',ruleId:3},timeStamp:3}]};},
        async getDynamicRules(){return [{id:1,action:{type:'block'}}];},
        async getSessionRules(){return [{id:2,action:{type:'allowAllRequests'}}];}
    };
    const result=await send({what:'sm:stats',tabId:1});assert.equal(result.ok,true);
    assert.deepEqual(result.data.map(x=>x.action),['block','allowAllRequests','unknown']);
    assert.equal(result.data.some(x=>'url' in x),false);
});

test('history migrates once and metadata does not contain full snapshots',async()=>{
    await send({what:'sm:clearRecords'});delete store['sm.historyIndex'];
    const before=(await send({what:'sm:snapshot'})).data;
    store['sm.history']=[{id:'legacy',label:'old',time:1,before,after:before.settings}];
    const index=(await send({what:'sm:history'})).data;
    assert.deepEqual(index,[{id:'legacy',label:'old',time:1}]);
    assert.equal(store['sm.history'],undefined);assert.ok(store['sm.history.legacy'].before);
    assert.ok(store['sm.historyIndex'][0].bytes>0);
    await send({what:'sm:undo'});assert.equal(store['sm.history.legacy'],undefined);
});

test('popup status uses site-only data and rejects protected tabs',async()=>{
    chrome.tabs.get=async()=>({id:1,url:'https://example.com/path?q=private'});
    chrome.permissions={contains:async()=>true};
    const result=await send({what:'sm:popupStatus',tabId:1});
    assert.equal(result.ok,true);assert.equal(result.data.hostname,'example.com');
    assert.equal(result.data.level,2);assert.equal(result.data.hasAccess,true);
    assert.deepEqual(Object.keys(result.data).sort(),['hasAccess','hostname','level','pauses','tabId','timing']);
    assert.deepEqual(Object.keys(result.data.timing).sort(),['engineReadyAtMs','handlerMs','smInitDoneAtMs','waitForInitMs','wokeWorker','workerUptimeAtReceiptMs']);
    assert.doesNotMatch(JSON.stringify(result.data.timing),/example|https?:/);
    chrome.tabs.get=async()=>({id:1,url:'https://chromewebstore.google.com/detail/test'});
    assert.equal((await send({what:'sm:popupStatus',tabId:1})).data.hostname,'');
});

test('popup resolves active tab once without UI round trip',async()=>{let queries=0;chrome.tabs.query=async options=>{queries++;assert.deepEqual(options,{active:true,currentWindow:true});return[{id:42,url:'https://example.com/'}];};const r=await send({what:'sm:popupStatus'});assert.equal(r.ok,true);assert.equal(r.data.tabId,42);assert.equal(r.data.hostname,'example.com');assert.equal(queries,1);chrome.tabs.query=async()=>[];assert.equal((await send({what:'sm:popupStatus'})).data.hostname,'');});

// ---- 0.4.3 regression suite: pause-safe rollback, single write boundary, idempotency, interruption ----------
async function resetWorld(){
    modes={none:[],basic:[],optimal:['all-urls'],complete:[]};custom=[];enabled=['easylist'];store.sandbox='';
    Object.assign(config,{autoReload:true,showBlockedCount:true,strictBlockMode:true,popupBlockMode:true,developerMode:false});
    for(const k of Object.keys(store))if(k!=='sm.syncEnabled')delete store[k];
    alarms.clear();faults.clear();hangOnce.clear();skew=0;delay=0;engineLog.length=0;
    ctl=createController(engine,Promise.resolve(),undefined,{retryDelays:[0,0]});
    await send({what:'sm:snapshot'});
}
const importTarget=async mutate=>{const data=structuredClone((await send({what:'sm:snapshot'})).data);mutate(data.settings);return data;};

test('failed import restores a running 10-minute pause: record, alarm, deadline and subdomain exception',async()=>{
    await resetWorld();
    modes.basic=['example.com'];modes.complete=['child.shop.example.com'];
    const paused=await send({what:'sm:pause',hostname:'shop.example.com',duration:'10m'});assert.equal(paused.ok,true);
    const record=structuredClone(store['sm.pauses']['shop.example.com']);const pausedModes=structuredClone(modes);
    const target=await importTarget(s=>{s.popupBlockMode=false;});
    fail('updateUserDnrRules');
    const result=await send({what:'sm:restore',data:target});
    assert.equal(result.ok,false);assert.match(result.error,/已恢复原配置和仍在有效期内的临时暂停/);
    assert.deepEqual(store['sm.pauses']['shop.example.com'],record,'same record, same deadline');
    assert.equal(alarms.get('sm:pause:shop.example.com').when,record.until,'alarm re-armed for the original deadline');
    assert.deepEqual(modes,pausedModes);assert.equal(config.popupBlockMode,true);
    assert.equal(store['sm.pendingRollback'],undefined);
    await send({what:'sm:resume',hostname:'shop.example.com'});
    assert.deepEqual(modes.complete,['child.shop.example.com'],'subdomain exception returns after resume');assert.deepEqual(modes.none,[]);
});

test('failed import: a pause that expired while importing stays ended and its modes are restored',async()=>{
    await resetWorld();
    modes.complete=['child.shop.example.com'];
    await send({what:'sm:pause',hostname:'shop.example.com',duration:'10m'});
    const target=await importTarget(s=>{s.autoReload=false;});
    fail('updateUserDnrRules',1,()=>{skew+=11*60000;});
    const result=await send({what:'sm:restore',data:target});assert.equal(result.ok,false);
    assert.equal(store['sm.pauses']['shop.example.com'],undefined);assert.equal(alarms.has('sm:pause:shop.example.com'),false);
    assert.deepEqual(modes.complete,['child.shop.example.com']);assert.deepEqual(modes.none,[]);assert.equal(config.autoReload,true);
});

test('failed import: session pause survives; rollback that itself fails keeps the recovery marker',async()=>{
    await resetWorld();
    await send({what:'sm:pause',hostname:'a.example.com',duration:'session'});
    const record=structuredClone(store['sm.pauses']['a.example.com']);
    const target=await importTarget(s=>{s.showBlockedCount=false;});
    fail('updateUserDnrRules');
    assert.match((await send({what:'sm:restore',data:target})).error,/已恢复原配置/);
    assert.deepEqual(store['sm.pauses']['a.example.com'],record);
    await send({what:'sm:resume',hostname:'a.example.com'});
    // Now make the rollback fail too: the marker and the recovery snapshot must stay for the next start.
    const target2=await importTarget(s=>{s.showBlockedCount=false;});
    fail('updateUserDnrRules',2);
    const hard=await send({what:'sm:restore',data:target2});assert.equal(hard.ok,false);assert.match(hard.error,/自动回退未完成/);
    assert.ok(store['sm.pendingRollback']);assert.ok(store['sm.recovery']);
});

test('successful import ends temporary pauses (documented contract) and clears the marker',async()=>{
    await resetWorld();
    modes.basic=['example.com'];
    await send({what:'sm:pause',hostname:'shop.example.com',duration:'10m'});
    const target=await importTarget(s=>{s.autoReload=false;s.filteringModes.none=s.filteringModes.none.filter(h=>h!=='shop.example.com');});
    assert.equal((await send({what:'sm:restore',data:target})).ok,true);
    assert.deepEqual(store['sm.pauses'],{});assert.equal(alarms.size,0);assert.equal(store['sm.pendingRollback'],undefined);assert.equal(config.autoReload,false);
});

test('every full-settings write is queued behind an import: no interleaving inside the transaction',async()=>{
    await resetWorld();
    delay=5;
    let inside=false;const violations=[];
    const watched=async r=>{
        if(r.what==='applyRulesets')inside=true;
        if(inside&&r.__external)violations.push(r.what);
        const out=await engine(r);if(r.what==='updateUserDnrRules')inside=false;return out;
    };
    ctl=createController(watched,Promise.resolve(),undefined,{retryDelays:[0,0]});
    const target=await importTarget(s=>{s.autoReload=false;s.popupBlockMode=false;});
    const restoring=send({what:'sm:restore',data:target});
    while(!inside)await sleep(1);                      // the import is now between its first and last engine step
    const outside=['setAutoReload','setShowBlockedCount','setStrictBlockMode','setPopupBlockMode','setDeveloperMode','importFilterList','updateUserDnrRules'].map(what=>ctl.wrap({what,state:true,url:'https://example.com/list.txt',__external:true}));
    const results=await Promise.all([restoring,...outside]);
    assert.equal(results[0].ok,true);assert.deepEqual(violations,[],'external writes must wait for the import');
    assert.equal(config.popupBlockMode,true,'the later toggle won, in order');
});

test('rule editor save goes through the queue, is recorded in history and reports engine feedback',async()=>{
    await resetWorld();
    const before=(await send({what:'sm:history'})).data.length;
    const saved=await send({what:'sm:setUserDnrRules',text:'  ||ads.example^$important  '});assert.equal(saved.ok,true);
    assert.equal(store.userDnrRules,'||ads.example^$important');assert.equal((await send({what:'sm:history'})).data.length,before+1);
    assert.equal((await send({what:'sm:setUserDnrRules',text:''})).ok,true);assert.equal('userDnrRules' in store,false);
    assert.equal((await send({what:'sm:setUserDnrRules',text:'x'.repeat(200001)})).ok,false);
    assert.equal((await send({what:'sm:setUserDnrRules',text:5})).ok,false);
});

test('upstream settings toggles are recorded in history and undoable',async()=>{
    await resetWorld();
    for(const [what,key] of [['setAutoReload','autoReload'],['setShowBlockedCount','showBlockedCount'],['setStrictBlockMode','strictBlockMode'],['setPopupBlockMode','popupBlockMode'],['setDeveloperMode','developerMode']]){
        const before=(await send({what:'sm:history'})).data.length;
        await ctl.wrap({what,state:!config[key]});
        assert.equal((await send({what:'sm:history'})).data.length,before+1,what);
    }
    assert.equal((await send({what:'sm:undo'})).ok,true);assert.equal(config.developerMode,false);
});

test('a repeated operation id replays the recorded result instead of running twice',async()=>{
    await resetWorld();
    const opId='op-aaaaaaaa-0001';
    const first=await send({what:'sm:pause',hostname:'dup.example.com',duration:'10m',opId});assert.equal(first.ok,true);
    const calls=engineLog.length;
    const second=await send({what:'sm:pause',hostname:'dup.example.com',duration:'10m',opId});
    assert.deepEqual(second,first);assert.equal(engineLog.length,calls,'no engine call on replay');
    assert.equal((await send({what:'sm:opStatus',opId})).data.state,'done');
    // Concurrent duplicates join the first execution.
    const id2='op-bbbbbbbb-0002';delay=5;
    const [a,b]=await Promise.all([send({what:'sm:preset',preset:'recommended',opId:id2}),send({what:'sm:preset',preset:'recommended',opId:id2})]);
    assert.deepEqual(a,b);assert.equal(engineLog.filter(w=>w==='applyRulesets').length,1);
    // A failure is replayed as a failure, not silently retried.
    fail('setFilteringMode');
    const id3='op-cccccccc-0003';const bad=await send({what:'sm:setMode',hostname:'x.example.com',level:1,opId:id3});assert.equal(bad.ok,false);
    const again=await send({what:'sm:setMode',hostname:'x.example.com',level:1,opId:id3});assert.equal(again.ok,false);assert.equal(again.error,bad.error);
    assert.equal((await send({what:'sm:opStatus',opId:'bad id'})).ok,false);
});

test('worker stopped mid-import: next start rolls back to the pre-import configuration and reports it',async()=>{
    await resetWorld();
    modes.basic=['example.com'];
    const original=structuredClone((await send({what:'sm:snapshot'})).data.settings);
    const target=await importTarget(s=>{s.autoReload=false;s.sandboxFilters='example.com##.x';s.filteringModes.basic=[];});
    hangOnce.add('setSandboxFilters');
    send({what:'sm:restore',data:target,opId:'op-dddddddd-0004'});              // never answers: this worker is "killed"
    await sleep(60);
    assert.equal(store['sm.pendingRollback'].stage,'applying');assert.equal(config.autoReload,false,'half applied');
    ctl=createController(engine,Promise.resolve(),undefined,{retryDelays:[0,0]});   // browser starts a fresh worker
    const state=(await send({what:'sm:opStatus',opId:'op-dddddddd-0004'})).data;
    assert.equal(state.state,'rolledBack');assert.match(state.message,/已自动恢复/);
    assert.deepEqual((await send({what:'sm:snapshot'})).data.settings,original);
    assert.equal(store['sm.pendingRollback'],undefined);
    assert.equal(store['sm.notice'].kind,'rolledBack');
    // The UI can acknowledge the notice once.
    const status=await send({what:'sm:ackNotice'});assert.equal(status.ok,true);assert.equal('sm.notice' in store,false);
    // Retrying the same id never re-executes.
    const calls=engineLog.length;const replay=await send({what:'sm:restore',data:target,opId:'op-dddddddd-0004'});
    assert.equal(replay.ok,false);assert.equal(engineLog.length,calls);
});

test('worker stopped after the import finished but before it was confirmed: detected as completed, not rolled back',async()=>{
    await resetWorld();
    const before=(await send({what:'sm:snapshot'})).data;
    const target=await importTarget(s=>{s.autoReload=false;});
    assert.equal((await send({what:'sm:restore',data:target})).ok,true);        // config now equals target
    const {canonical}=await import('./core.mjs');
    const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(v))))).map(b=>b.toString(16).padStart(2,'0')).join('');
    store['sm.recovery']=before;                                                // as if the final cleanup never ran
    store['sm.pendingRollback']={what:'restore',stage:'applying',envelope:{pauses:{}},startedAt:Date.now(),targetFp:await digest(target.settings)};
    ctl=createController(engine,Promise.resolve(),undefined,{retryDelays:[0,0]});
    await send({what:'sm:snapshot'});
    assert.equal(config.autoReload,false,'completed import is kept');assert.equal(store['sm.notice'].kind,'completed');assert.equal('sm.pendingRollback' in store,false);
});

test('worker stopped between writing a pause record and changing modes: stale record is dropped on start',async()=>{
    await resetWorld();
    store['sm.pauses']={'half.example.com':{before:{none:[],basic:[],optimal:[],complete:[]},after:{none:['half.example.com'],basic:[],optimal:[],complete:[]},until:Date.now()+600000,session:'x'}};
    ctl=createController(engine,Promise.resolve(),undefined,{retryDelays:[0,0]});
    await send({what:'sm:snapshot'});
    assert.deepEqual(store['sm.pauses'],{});assert.equal(alarms.has('sm:pause:half.example.com'),false);
});

test('initialization retries a bounded number of times and can recover on a later request',async()=>{
    await resetWorld();
    store['sm.pauses']={'z.example.com':{before:{none:[],basic:[],optimal:[],complete:[]},after:{none:['z.example.com'],basic:[],optimal:[],complete:[]},until:Date.now()+600000,session:'s'}};
    store['sm.startError']='old';
    chrome.tabs.query=async()=>[{id:1,url:'https://example.com/'}];chrome.permissions={contains:async()=>true};
    fail('getFilteringModeDetails',2);                       // two failed attempts, third succeeds
    ctl=createController(engine,Promise.resolve(),undefined,{retryDelays:[0,0]});
    const ok=await send({what:'sm:popupStatus'});assert.equal(ok.ok,true);assert.equal('sm.startError' in store,false,'stale error cleared');
    // Exhausted retries reject the request but do not poison the next one.
    await resetWorld();store['sm.pauses']={'z.example.com':{before:{none:[],basic:[],optimal:[],complete:[]},after:{none:['z.example.com'],basic:[],optimal:[],complete:[]},until:Date.now()+600000,session:'s'}};
    fail('getFilteringModeDetails',3);
    ctl=createController(engine,Promise.resolve(),undefined,{retryDelays:[0,0]});
    const bad=await send({what:'sm:popupStatus'});assert.equal(bad.ok,false);assert.match(store['sm.startError'],/injected/);
    const later=await send({what:'sm:popupStatus'});assert.equal(later.ok,true);
    chrome.tabs.query=async()=>[];
});

test('popup status carries segment timings without any page address',async()=>{
    await resetWorld();
    chrome.tabs.get=async()=>({id:1,url:'https://secret.example.org/private/path?token=1'});chrome.permissions={contains:async()=>true};
    const r=await send({what:'sm:popupStatus',tabId:1});
    assert.equal(r.ok,true);const t=r.data.timing;
    for(const k of ['workerUptimeAtReceiptMs','waitForInitMs','handlerMs'])assert.ok(Number.isInteger(t[k])&&t[k]>=0,k);
    assert.equal(typeof t.wokeWorker,'boolean');
    assert.doesNotMatch(JSON.stringify(t),/secret|token|private/);
});

test('clearing local records also clears the operation log and notices',async()=>{
    await resetWorld();
    await send({what:'sm:pause',hostname:'logged.example.com',duration:'10m',opId:'op-eeeeeeee-0005'});
    assert.ok(store['sm.ops']['op-eeeeeeee-0005']);store['sm.notice']={kind:'rolledBack',message:'x',time:1};
    assert.equal((await send({what:'sm:clearRecords'})).ok,true);
    assert.equal('sm.ops' in store,false);assert.equal('sm.notice' in store,false);
});

test('pause records the mode it returns to and supports a 1-hour duration',async()=>{
    await resetWorld();
    modes.complete=['long.example.com'];
    const before=Date.now();
    const paused=await send({what:'sm:pause',hostname:'long.example.com',duration:'1h'});assert.equal(paused.ok,true);
    const record=store['sm.pauses']['long.example.com'];
    assert.equal(record.level,2,'level before the pause (mock engine reports 2) is kept for the popup');
    assert.ok(record.until>=before+3600000-1000&&record.until<=Date.now()+3600000+1000,'deadline one hour out');
    assert.equal(alarms.get('sm:pause:long.example.com').when,record.until);
    const status=await send({what:'sm:popupStatus',tabId:undefined});assert.equal(status.ok,true);
    assert.equal((await send({what:'sm:pause',hostname:'long.example.com',duration:'2h'})).ok,false,'unknown durations are refused');
    await send({what:'sm:resume',hostname:'long.example.com'});assert.deepEqual(modes.complete,['long.example.com']);
});

test('status requests answer "engine starting" instead of hanging while the upstream engine is still starting',async()=>{
    await resetWorld();
    let finish;const ready=new Promise(r=>{finish=r;});let state={ready:false,error:null,phase:'启用过滤规则（首次需编译，可能较慢）',step:3,elapsedMs:4200};
    createController(engine,ready,undefined,{retryDelays:[0,0],progress:()=>state,startingWaitMs:20});
    const t=Date.now();const first=await send({what:'sm:popupStatus'});
    assert.equal(first.ok,true);assert.equal(first.data.engineStarting,true);assert.equal(first.data.step,3);assert.ok(Date.now()-t<1000,'answered quickly');
    assert.equal((await send({what:'sm:status'})).data.engineStarting,true);
    state={...state,ready:true};finish();
    const after=await send({what:'sm:popupStatus'});assert.equal(after.ok,true);assert.equal(after.data.engineStarting,undefined);
    ctl=createController(engine,Promise.resolve(),undefined,{retryDelays:[0,0]});
});
