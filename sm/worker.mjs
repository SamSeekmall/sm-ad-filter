// SM control layer. All mutations are serialized; raw upstream APIs stay intact.
import { hostname, related, subtree, mergeSubtree, canonical, validateBackup, backupSummary, validateRepository } from './core.mjs';
import { stageLists } from './updates.mjs';
const api = chrome;
const read = async (key, fallback) => (await api.storage.local.get(key))[key] ?? fallback;
const write = (key, value) => api.storage.local.set({ [key]: value });
const changed = new Set(['setFilteringMode','setDefaultFilteringMode','setFilteringModeDetails','applyRulesets','addCustomFilters','addManyCustomFilters','removeCustomFilters','removeAllCustomFilters','setSandboxFilters']);

export function createController(engine, ready, parseDnr) {
    let chain = Promise.resolve();
    const serial = fn => { const next = chain.then(async () => { await ready; return fn(); }); chain = next.catch(() => {}); return next; };
    let session, releasePromise, updateJob, updateAbort;
    const staticActions = new Map();
    async function historyIndex() {
        const index = await read('sm.historyIndex',null);
        if (index) return index;
        const old = await read('sm.history',[]), next=[];
        for (const item of old) {
            const bytes=new TextEncoder().encode(JSON.stringify(item)).length;
            await write(`sm.history.${item.id}`,item);
            next.push({id:item.id,label:item.label,time:item.time,bytes});
        }
        let total=next.reduce((sum,x)=>sum+x.bytes,0);const removed=[];
        while(next.length>10||total>2000000){const item=next.pop();total-=item.bytes;removed.push(`sm.history.${item.id}`);}
        await write('sm.historyIndex',next);
        await api.storage.local.remove(['sm.history',...removed]);
        return next;
    }
    async function updateLists() {
        if(updateJob?.state==='downloading'||updateJob?.state==='committing') throw new Error('订阅更新正在进行');
        updateAbort=new AbortController();
        updateJob={state:'downloading',files:0,bytes:0};
        try {
            const entries=await stageLists(await engine({what:'getImportedLists'}),AbortSignal.any([updateAbort.signal,AbortSignal.timeout(90000)]),(files,bytes)=>Object.assign(updateJob,{files,bytes}));
            updateAbort.signal.throwIfAborted();
            return await serial(async()=>{
                updateAbort.signal.throwIfAborted(); updateJob.state='committing';
                await api.storage.session.set({'sm.stagedLists':entries});
                try { await engine({what:'updateImportedLists',force:true}); updateJob.state='complete'; return engine({what:'getImportedLists'}); }
                finally { await api.storage.session.remove('sm.stagedLists'); }
            });
        } catch(error) { updateJob.state=updateAbort.signal.aborted?'cancelled':'failed'; updateJob.error=error.message; throw error; }
    }
    async function snapshot() {
        const [config, modes, custom, sandbox, dnrRules, cookieReject, imported] = await Promise.all([
            engine({what:'getCurrentConfig'}), engine({what:'getFilteringModeDetails'}), engine({what:'getAllCustomFilters'}), engine({what:'getSandboxFilters'}), read('userDnrRules',''), read('sm.cookieReject',false), engine({what:'getImportedLists'}),
        ]);
        const settings = { enabledRulesets: [...config.enabledRulesets].sort(), importedLists:imported.map(x=>x.id).sort(), filteringModes: modes, customFilters: custom.sort((a,b) => a[0].localeCompare(b[0])), sandboxFilters: sandbox ?? '', dnrRules, cookieReject };
        for (const key of ['autoReload','showBlockedCount','strictBlockMode','popupBlockMode','developerMode']) settings[key] = config[key];
        for (const key of Object.keys(modes)) modes[key].sort();
        return { schema:2, product:'sm-ad-filter', createdAt: new Date().toISOString(), settings };
    }
    async function fingerprint() {
        const bytes = new TextEncoder().encode(canonical((await snapshot()).settings));
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
    async function validate(data) {
        if (data?.settings?.dnrRules) {
            if (!parseDnr || parseDnr(data.settings.dnrRules).bad.length) throw new Error('高级网络规则语法无效');
        }
        return validateBackup(data, api.runtime.getManifest().declarative_net_request.rule_resources.map(x => x.id));
    }
    async function apply(data) {
        const s = data.settings;
        const currentImports = await engine({what:'getImportedLists'});
        for (const url of s.importedLists) {
            if (!currentImports.some(x => x.id === url)) await engine({what:'importFilterList',url});
        }
        await engine({what:'applyRulesets',enabledRulesets:s.enabledRulesets,toRemove:currentImports.filter(x=>!s.importedLists.includes(x.id)).map(x=>x.id)});
        await engine({what:'setFilteringModeDetails',modes:s.filteringModes});
        for (const [key,what] of [['autoReload','setAutoReload'],['showBlockedCount','setShowBlockedCount'],['strictBlockMode','setStrictBlockMode'],['popupBlockMode','setPopupBlockMode'],['developerMode','setDeveloperMode']]) await engine({what,state:s[key]});
        await engine({what:'removeAllCustomFilters',hostname:'*'});
        if (s.customFilters.length) await engine({what:'addManyCustomFilters',entries:s.customFilters});
        await engine({what:'setSandboxFilters',text:s.sandboxFilters});
        await write('userDnrRules',s.dnrRules);
        const appliedRules = await engine({what:'updateUserDnrRules'});
        if (appliedRules?.errors?.length) throw new Error('浏览器拒绝了部分高级规则');
        await write('sm.cookieReject',s.cookieReject);
        const after = await snapshot();
        if (canonical(after.settings) !== canonical(s)) throw new Error('设置读回不一致（可能受浏览器权限或策略限制）');
    }
    async function remember(label,before,after) {
        if (canonical(before.settings) === canonical(after.settings)) return;
        const history = await historyIndex();
        const item={id:crypto.randomUUID(),label,time:Date.now(),before,after:after.settings};
        const bytes=new TextEncoder().encode(JSON.stringify(item)).length;
        if(bytes>2000000)return;
        await write(`sm.history.${item.id}`,item);
        history.unshift({id:item.id,label,time:item.time,bytes});
        let total=history.reduce((sum,x)=>sum+x.bytes,0); const removed=[];
        while(history.length>10||total>2000000){const old=history.pop();total-=old.bytes;removed.push(`sm.history.${old.id}`);}
        await write('sm.historyIndex',history);
        if(removed.length)await api.storage.local.remove(removed);
    }
    async function mutate(label,fn) {
        const before = await snapshot();
        await write('sm.recovery',before);
        let result;
        try { result = await fn(); }
        catch (error) { await remember(`${label}（未完成）`,before,await snapshot()); throw error; }
        await remember(label,before,await snapshot());
        return result;
    }
    async function resume(host, reload = false) {
        const pauses = await read('sm.pauses',{});
        const pause = pauses[host];
        if (!pause) return;
        const current = await engine({what:'getFilteringModeDetails'});
        if (canonical(subtree(current,host)) === canonical(pause.after)) {
            await engine({what:'setFilteringModeDetails',modes:mergeSubtree(current,pause.before,host)});
        }
        delete pauses[host];
        await write('sm.pauses',pauses);
        await api.alarms.clear(`sm:pause:${host}`);
        if (reload) await reloadHost(host);
    }
    async function reloadHost(host) {
        const tabs = await api.tabs.query({});
        for (const tab of tabs) try { if (tab.url && hostname(tab.url) === host) await api.tabs.reload(tab.id); } catch { /* Closed or protected tab. */ }
    }
    async function initialize() {
        await historyIndex();
        session = (await api.storage.session.get('sm.session'))['sm.session'];
        if (!session) { session = crypto.randomUUID(); await api.storage.session.set({'sm.session':session}); }
        const pauses = await read('sm.pauses',{});
        for (const [host,p] of Object.entries(pauses)) {
            if ((p.until && p.until <= Date.now()) || (!p.until && p.session !== session)) await resume(host);
            else if (p.until) await api.alarms.create(`sm:pause:${host}`,{when:p.until});
        }
    }
    const initialized = serial(initialize);
    initialized.catch(error => write('sm.startError',String(error)));
    api.alarms.onAlarm.addListener(alarm => {
        if (alarm.name.startsWith('sm:pause:')) serial(() => resume(alarm.name.slice(9),true)).catch(error => write('sm.startError',String(error)));
    });
    async function cancelOverlapping(host) {
        for (const key of Object.keys(await read('sm.pauses',{}))) if (!host || related(key,host)) await resume(key);
    }
    async function getStatus(request) {
        const [data,local] = await Promise.all([engine({what:'getOptionsPageData'}),api.storage.local.get(['sm.pauses','sm.cookieReject','sm.cookies','sm.repository','sm.syncEnabled','sm.startError'])]);
        let host = '', tab;
        if (Number.isInteger(request.tabId)) tab = await api.tabs.get(request.tabId).catch(() => undefined);
        if (tab?.url && /^https?:/.test(tab.url)) host = hostname(tab.url);
        if (tab?.url && /^https:\/\/(chromewebstore\.google\.com\/|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/.test(tab.url)) host = '';
        if (!host && request.hostname) host = hostname(request.hostname);
        let userScripts = false;
        try { await api.userScripts.getScripts(); userScripts = true; } catch { /* Permission unavailable. */ }
        const hasAccess = host ? await api.permissions.contains({origins:[`*://${host}/*`]}) : data.hasOmnipotence;
        return { ...data, hostname:host, tabId:tab?.id, level:host ? await engine({what:'getFilteringMode',hostname:host}) : data.defaultFilteringMode,
            hasAccess,userScripts,pauses:local['sm.pauses']??{}, cookieReject:local['sm.cookieReject']??false, cookies:host ? (local['sm.cookies']??{})[host] : null,
            release:await (releasePromise ??= fetch(api.runtime.getURL('sm/release.json')).then(r=>r.json()).catch(e=>{releasePromise=null;throw e;})), repository:local['sm.repository']??'', syncEnabled:local['sm.syncEnabled']??false, startError:local['sm.startError']??'' };
    }
    // Popup reads only its current site, not the dashboard's rule catalog or user scripts.
    async function popupStatus(request) {
        const tab=Number.isInteger(request.tabId)?await api.tabs.get(request.tabId).catch(()=>null):null;
        let host='';
        if(tab?.url && /^https?:/.test(tab.url) && !/^https:\/\/(chromewebstore\.google\.com\/|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/.test(tab.url))host=hostname(tab.url);
        if(!host)return {hostname:'',level:0,pauses:{},hasAccess:false};
        const [level,pauses,hasAccess]=await Promise.all([engine({what:'getFilteringMode',hostname:host}),read('sm.pauses',{}),api.permissions.contains({origins:[`*://${host}/*`]})]);
        return {hostname:host,level,pauses:pauses[host]?{[host]:pauses[host]}:{},hasAccess};
    }
    async function handle(r) {
        const host = r.hostname ? hostname(r.hostname) : '';
        switch(r.what) {
        case 'sm:status': return getStatus(r);
        case 'sm:popupStatus': return popupStatus(r);
        case 'sm:snapshot': return snapshot();
        case 'sm:preview': { const data = await validate(r.data); return {data,summary:backupSummary(data),baseRevision:await fingerprint()}; }
        case 'sm:restore': {
            const data = await validate(r.data);
            if (r.baseRevision && r.baseRevision !== await fingerprint()) throw new Error('预览后本机配置已变化，请重新预览');
            await cancelOverlapping();
            const before = await snapshot();
            await write('sm.recovery',before);
            try { await apply(data); }
            catch (error) { try { await apply(before); } catch { throw new Error(`导入失败且自动回退未完成；恢复快照已保存。${error.message}`); } throw new Error(`导入失败，已恢复原配置。${error.message}`); }
            await remember('导入配置',before,await snapshot());
            return true;
        }
        case 'sm:recovery': return read('sm.recovery',null);
        case 'sm:clearRecords': { const history=await historyIndex(); await write('sm.historyIndex',[]); await api.storage.local.remove(['sm.history','sm.recovery','sm.cookies',...history.map(x=>`sm.history.${x.id}`)]); return true; }
        case 'sm:setMode': {
            if (!host || ![0,1,2,3].includes(r.level)) throw new Error('站点或过滤模式无效');
            await cancelOverlapping(host);
            const value = await mutate('调整站点过滤',() => engine({what:'setFilteringMode',hostname:host,level:r.level}));
            if (value !== r.level) throw new Error('过滤模式未生效，请检查网站权限');
            await reloadHost(host); return value;
        }
        case 'sm:pause': {
            if (!host || !['10m','session'].includes(r.duration)) throw new Error('暂停参数无效');
            await cancelOverlapping(host);
            const before = subtree(await engine({what:'getFilteringModeDetails'}),host);
            if ((await engine({what:'getFilteringMode',hostname:host})) === 0) throw new Error('此站点已处于不过滤模式，无需临时暂停');
            const after = {none:[host],basic:[],optimal:[],complete:[]};
            const until = r.duration === '10m' ? Date.now()+600000 : null;
            const pauses = await read('sm.pauses',{});
            pauses[host] = {before,after,until,session};
            await write('sm.pauses',pauses);
            if (until) await api.alarms.create(`sm:pause:${host}`,{when:until});
            const current = await engine({what:'getFilteringModeDetails'});
            await engine({what:'setFilteringModeDetails',modes:mergeSubtree(current,after,host)});
            await reloadHost(host); return pauses[host];
        }
        case 'sm:resume': await resume(host,true); return true;
        case 'sm:preset': {
            const presets = { recommended:['chn-0','easylist','easyprivacy'], quiet:['chn-0','easylist','easyprivacy','annoyances-overlays','annoyances-notifications','annoyances-social'] };
            if (!presets[r.preset]) throw new Error('未知配置');
            return mutate('启用推荐规则',async () => {
                const old = await engine({what:'getEnabledRulesets'});
                const enabledRulesets = [...new Set([...old,...presets[r.preset]])];
                await engine({what:'applyRulesets',enabledRulesets});
                const after = await engine({what:'getEnabledRulesets'});
                if (!enabledRulesets.every(id => after.includes(id))) throw new Error('部分规则未启用，请检查规则限额');
                return after;
            });
        }
        case 'sm:history': return (await historyIndex()).map(({id,label,time}) => ({id,label,time}));
        case 'sm:undo': {
            const history = await historyIndex(); const item = history[0] ? await read(`sm.history.${history[0].id}`,null) : null;
            if (!item) throw new Error('没有可撤销的修改');
            if (Object.keys(await read('sm.pauses',{})).length) throw new Error('请先恢复临时暂停的网站');
            if (canonical((await snapshot()).settings) !== canonical(item.after)) throw new Error('配置已发生其他变化，请导出备份后使用恢复快照');
            await apply(item.before); history.shift(); await write('sm.historyIndex',history); await api.storage.local.remove(`sm.history.${item.id}`); return true;
        }
        case 'sm:filters': return engine({what:'getAllCustomFilters'});
        case 'sm:removeFilter': {
            if (!host || typeof r.selector !== 'string') throw new Error('规则无效');
            return mutate('删除自定义规则',() => engine({what:'removeCustomFilters',hostname:host,selectors:[r.selector]}));
        }
        case 'sm:cookieToggle': return mutate('切换 Cookie 自动拒绝',() => write('sm.cookieReject',r.enabled === true));
        case 'sm:repository': await write('sm.repository',validateRepository(r.url)); return true;
        case 'sm:lists': return engine({what:'getImportedLists'});
        case 'sm:updateLists': return updateLists();
        case 'sm:updateProgress': return updateJob ?? {state:'idle'};
        case 'sm:cancelUpdate': if(updateJob?.state==='downloading'){updateAbort.abort();return true;} throw new Error('已进入规则提交阶段，无法取消');
        case 'sm:syncEnable': await write('sm.syncEnabled',r.enabled === true); return true;
        case 'sm:syncRead': {
            if (!(await read('sm.syncEnabled',false))) throw new Error('请先开启可选同步');
            const cloud = (await api.storage.sync.get('sm.config'))['sm.config'] ?? null;
            if (cloud) await validate(cloud.data);
            return cloud;
        }
        case 'sm:syncWrite': {
            if (!(await read('sm.syncEnabled',false))) throw new Error('请先开启可选同步');
            if (Object.keys(await read('sm.pauses',{})).length) throw new Error('请先恢复临时暂停，避免同步临时例外');
            const old = (await api.storage.sync.get('sm.config'))['sm.config'];
            if ((old?.revision ?? null) !== (r.expectedRevision ?? null)) throw new Error('云端版本已变化，请重新读取和预览后再上传');
            const cloud = {revision:crypto.randomUUID(),data:await snapshot()};
            if (new TextEncoder().encode(JSON.stringify(cloud)).length > 7000) throw new Error('配置超过同步空间，请使用文件导出／导入');
            await api.storage.sync.set({'sm.config':cloud});
            const after = (await api.storage.sync.get('sm.config'))['sm.config'];
            if (after?.revision !== cloud.revision) throw new Error('同步读回冲突，请重新读取');
            return cloud;
        }
        case 'sm:syncDelete': await api.storage.sync.remove('sm.config'); return true;
        case 'sm:stats': {
            if (!Number.isInteger(r.tabId)) throw new Error('请从网站工具栏打开面板查看统计');
            const {rulesMatchedInfo} = await api.declarativeNetRequest.getMatchedRules({tabId:r.tabId});
            const rows = rulesMatchedInfo.slice(-50);
            const sources = new Map();
            for (const id of new Set(rows.map(x=>x.rule.rulesetId))) {
                if (id === '_dynamic') sources.set(id,await api.declarativeNetRequest.getDynamicRules());
                else if (id === '_session') sources.set(id,await api.declarativeNetRequest.getSessionRules());
                else {
                    const entry = api.runtime.getManifest().declarative_net_request.rule_resources.find(x=>x.id===id);
                    if (entry) { if(!staticActions.has(id)){const rules=await (await fetch(api.runtime.getURL(entry.path.replace(/^\//,'')))).json(); if(staticActions.size>=4)staticActions.delete(staticActions.keys().next().value); staticActions.set(id,new Map(rules.map(x=>[x.id,x.action?.type]))); } sources.set(id,staticActions.get(id)); }
                }
            }
            return rows.map(x => ({ruleId:x.rule.ruleId,rulesetId:x.rule.rulesetId,timeStamp:x.timeStamp,action:(sources.get(x.rule.rulesetId) instanceof Map ? sources.get(x.rule.rulesetId).get(x.rule.ruleId) : sources.get(x.rule.rulesetId)?.find(rule=>rule.id===x.rule.ruleId)?.action?.type) ?? 'unknown'}));
        }
        default: throw new Error('未知操作');
        }
    }
    api.runtime.onMessage.addListener((r,sender,reply) => {
        if (typeof r?.what !== 'string' || !r.what.startsWith('sm:')) return;
        const ownPage = sender.id === api.runtime.id && sender.url?.startsWith(api.runtime.getURL(''));
        // Content scripts may only ask whether to reject cookies and report an attempt.
        if (!ownPage) {
            if (!sender.tab || !['sm:cookieAllowed','sm:cookieResult'].includes(r.what)) { reply({ok:false,error:'无权执行此操作'}); return; }
            serial(async () => {
                const host = hostname(sender.url);
                const allowed = await read('sm.cookieReject',false) && (await engine({what:'getFilteringMode',hostname:host})) > 0;
                if (r.what === 'sm:cookieAllowed') return allowed;
                if (!allowed) return false;
                const cookies = await read('sm.cookies',{});
                if (!['OneTrust','Cookiebot'].includes(r.provider)) return false;
                cookies[host] = {provider:r.provider,result:r.closed === true ? '拒绝按钮已点击，提示已消失；未验证服务端同意记录' : '已点击拒绝按钮，提示仍存在',time:Date.now()};
                const entries = Object.entries(cookies).sort((a,b) => b[1].time-a[1].time).slice(0,100);
                await write('sm.cookies',Object.fromEntries(entries)); return true;
            }).then(data => reply({ok:true,data}),error => reply({ok:false,error:error.message}));
            return true;
        }
        const direct = ['sm:popupStatus','sm:status','sm:lists','sm:history','sm:updateLists','sm:updateProgress','sm:cancelUpdate','sm:stats'].includes(r.what);
        (direct ? initialized.then(()=>handle(r)) : serial(() => handle(r))).then(data => reply({ok:true,data}),error => reply({ok:false,error:error.message}));
        return true;
    });
    return { wrap(request,sender) {
        if (!changed.has(request.what)) return engine(request,sender);
        return serial(async () => {
            if (request.what.includes('FilteringMode')) await cancelOverlapping(request.hostname && request.hostname !== 'all-urls' ? request.hostname : undefined);
            return mutate('完整设置修改',() => engine(request,sender));
        });
    } };
}
