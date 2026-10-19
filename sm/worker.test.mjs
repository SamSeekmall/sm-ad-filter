import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const store={},sessionStore={},syncStore={},listeners=[],alarms=new Map();
const area=data=>({async get(key){if(key===null)return {...data};if(Array.isArray(key))return Object.fromEntries(key.map(k=>[k,data[k]]));return {[key]:data[key]};},async set(value){Object.assign(data,structuredClone(value));},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete data[k];}});
let modes={none:[],basic:[],optimal:['all-urls'],complete:[]},custom=[],enabled=['easylist'],ignoreNextMode=false;
const config={enabledRulesets:enabled,autoReload:true,showBlockedCount:true,strictBlockMode:true,popupBlockMode:true,developerMode:false};
globalThis.chrome={storage:{local:area(store),session:area(sessionStore),sync:area(syncStore)},runtime:{id:'test',getURL:p=>`chrome-extension://test/${p}`,getManifest:()=>({declarative_net_request:{rule_resources:[{id:'easylist'},{id:'chn-0'}]}}),onMessage:{addListener:fn=>listeners.push(fn)}},alarms:{onAlarm:{addListener(){}},async create(k,v){alarms.set(k,v)},async clear(k){alarms.delete(k)}},tabs:{async query(){return []}}};
const {createController}=await import('./worker.mjs');
const engine=async r=>{
    switch(r.what){
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
createController(engine,Promise.resolve());
const send=r=>new Promise(resolve=>listeners.at(-1)(r,{id:'test',url:'chrome-extension://test/welcome.html'},resolve));
test('pause restores subtree, preserves unrelated changes, handles restart',async()=>{
    modes.basic=['example.com'];modes.complete=['child.shop.example.com'];
    assert.equal((await send({what:'sm:pause',hostname:'shop.example.com',duration:'session'})).ok,true);
    modes.basic.push('other.com');
    delete sessionStore['sm.session'];createController(engine,Promise.resolve());
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
