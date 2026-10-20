// SM control layer: message routing and the single write boundary. Raw upstream APIs stay intact.
// Every configuration write — SM's own and the upstream full-settings page — goes through `serial`.
// Engine internals (offscreen compile callbacks) must never be queued here, or the queue would wait on itself.
import { hostname, subtree, canonical, backupSummary, validateRepository } from './core.mjs';
import { stageLists } from './updates.mjs';
import { createTiming } from './timing.mjs';
import { createOps, validOpId } from './ops.mjs';
import { createHistory } from './history.mjs';
import { createPauses } from './pauses.mjs';
import { createConfig } from './config.mjs';
const api = chrome;
const read = async (key, fallback) => (await api.storage.local.get(key))[key] ?? fallback;
const write = (key, value) => api.storage.local.set({ [key]: value });
// Engine messages that change persisted configuration, with the label shown in the undo history.
const changed = new Map([
    ['setFilteringMode'], ['setDefaultFilteringMode'], ['setFilteringModeDetails'], ['applyRulesets'], ['addCustomFilters'], ['addManyCustomFilters'], ['removeCustomFilters'], ['removeAllCustomFilters'], ['setSandboxFilters'],
    ['setAutoReload', '修改自动刷新'], ['setShowBlockedCount', '修改拦截计数'], ['setStrictBlockMode', '修改严格拦截'], ['setPopupBlockMode', '修改弹窗拦截'], ['setDeveloperMode', '修改开发者模式'],
    ['importFilterList', '添加订阅'], ['updateUserDnrRules', '更新高级网络规则'],
]);
// Answered without waiting behind a mutation (but still after initialization).
const direct = new Set(['sm:popupStatus', 'sm:status', 'sm:lists', 'sm:history', 'sm:updateLists', 'sm:updateProgress', 'sm:cancelUpdate', 'sm:stats', 'sm:opStatus', 'sm:ackNotice']);
const NOTICES = {
    completed: '上次操作在确认前被浏览器中断，已核对：新配置已完整生效（本次未记入撤销历史）。',
    rolledBack: '上次导入／撤销被浏览器中断，已自动恢复到操作前的配置。',
    rollbackFailed: '上次导入／撤销被中断，自动恢复未完成。请下载恢复快照检查配置；下次启动会再次尝试。',
    interrupted: '上一项操作被浏览器中断。已核对暂停状态；请确认结果后再决定是否重试，勿重复提交。',
};

export function createController(engine, ready, parseDnr, options = {}) {
    const retryDelays = options.retryDelays ?? [300, 1200];
    const timing = createTiming(options.clock);
    ready.then(() => timing.mark('engineReady'), () => {});
    let chain = Promise.resolve();
    const serial = fn => { const next = chain.then(async () => { await ready; return fn(); }); chain = next.catch(() => {}); return next; };
    let releasePromise, updateJob, updateAbort;
    const staticActions = new Map();
    const ops = createOps({ read, write });
    const history = createHistory({ api, read, write });
    const pauses = createPauses({ api, engine, read, write });
    const config = createConfig({ api, engine, read, write, parseDnr, history });

    async function updateLists() {
        if (updateJob?.state === 'downloading' || updateJob?.state === 'committing') throw new Error('订阅更新正在进行');
        updateAbort = new AbortController();
        updateJob = { state: 'downloading', files: 0, bytes: 0 };
        try {
            const entries = await stageLists(await engine({ what: 'getImportedLists' }), AbortSignal.any([updateAbort.signal, AbortSignal.timeout(90000)]), (files, bytes) => Object.assign(updateJob, { files, bytes }));
            updateAbort.signal.throwIfAborted();
            return await serial(async () => {
                updateAbort.signal.throwIfAborted(); updateJob.state = 'committing';
                await api.storage.session.set({ 'sm.stagedLists': entries });
                try { await engine({ what: 'updateImportedLists', force: true }); updateJob.state = 'complete'; return engine({ what: 'getImportedLists' }); }
                finally { await api.storage.session.remove('sm.stagedLists'); }
            });
        } catch (error) { updateJob.state = updateAbort.signal.aborted ? 'cancelled' : 'failed'; updateJob.error = error.message; throw error; }
    }

    // ---- interrupted-work recovery -------------------------------------------------------------------------
    const setNotice = (kind, what) => write('sm.notice', { kind, what, message: NOTICES[kind], time: Date.now() });
    async function settleOrphans(state, message) {
        for (const op of await ops.orphaned()) await ops.finish(op.id, state, { message });
    }
    // A worker stop between "pending" and "done" leaves a marker. Verify what actually happened, then either
    // accept the finished result or roll back to the pre-operation snapshot — never leave half a configuration.
    async function recoverInterrupted() {
        const pending = await read('sm.pendingRollback', null);
        if (!pending) {
            const orphans = await ops.orphaned();
            if (orphans.length) { await settleOrphans('interrupted', NOTICES.interrupted); await setNotice('interrupted', orphans[0].what); }
            return;
        }
        let kind;
        try {
            if (pending.stage === 'applying') {
                const current = await config.snapshot();
                if (pending.targetFp && await config.digest(current.settings) === pending.targetFp) kind = 'completed';
                else {
                    const snap = await read('sm.recovery', null);
                    if (!snap) throw new Error('缺少恢复快照');
                    await config.apply(snap);
                    await pauses.reinstate(pending.envelope);
                    kind = 'rolledBack';
                }
            } else { await pauses.reinstate(pending.envelope); kind = 'rolledBack'; }
            await api.storage.local.remove('sm.pendingRollback');
        } catch (error) { kind = 'rollbackFailed'; await write('sm.startError', `中断恢复未完成：${error.message}`); }
        await settleOrphans(kind === 'completed' ? 'done' : kind, NOTICES[kind]);
        await setNotice(kind, pending.what);
    }
    async function initialize() {
        await pauses.reconcile();
        await recoverInterrupted();
    }
    // Initialization may be retried a bounded number of times; a failed attempt never poisons later requests.
    let initPromise;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    function ensureInit() {
        return initPromise ??= (async () => {
            let last;
            for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
                if (attempt) await sleep(retryDelays[attempt - 1]);
                try {
                    await serial(initialize);
                    await api.storage.local.remove('sm.startError');
                    timing.mark('smInitDone');
                    // Legacy history migration is not needed to show site status; do it once the queue is idle.
                    serial(() => history.index()).catch(() => {});
                    return;
                } catch (error) { last = error; await write('sm.startError', String(error)); }
            }
            throw last;
        })().catch(error => { initPromise = null; throw error; });
    }
    ensureInit().catch(() => {});
    api.alarms.onAlarm.addListener(alarm => {
        if (alarm.name.startsWith('sm:pause:')) serial(() => pauses.resume(alarm.name.slice(9), true)).catch(error => write('sm.startError', String(error)));
    });

    // ---- status ---------------------------------------------------------------------------------------------
    async function getStatus(request) {
        const [data, local] = await Promise.all([engine({ what: 'getOptionsPageData' }), api.storage.local.get(['sm.pauses', 'sm.cookieReject', 'sm.cookies', 'sm.repository', 'sm.syncEnabled', 'sm.startError', 'sm.notice'])]);
        let host = '', tab;
        if (Number.isInteger(request.tabId)) tab = await api.tabs.get(request.tabId).catch(() => undefined);
        if (tab?.url && /^https?:/.test(tab.url)) host = hostname(tab.url);
        if (tab?.url && /^https:\/\/(chromewebstore\.google\.com\/|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/.test(tab.url)) host = '';
        if (!host && request.hostname) host = hostname(request.hostname);
        let userScripts = false;
        try { await api.userScripts.getScripts(); userScripts = true; } catch { /* Permission unavailable. */ }
        const hasAccess = host ? await api.permissions.contains({ origins: [`*://${host}/*`] }) : data.hasOmnipotence;
        return { ...data, hostname: host, tabId: tab?.id, level: host ? await engine({ what: 'getFilteringMode', hostname: host }) : data.defaultFilteringMode,
            hasAccess, userScripts, pauses: local['sm.pauses'] ?? {}, cookieReject: local['sm.cookieReject'] ?? false, cookies: host ? (local['sm.cookies'] ?? {})[host] : null,
            release: await (releasePromise ??= fetch(api.runtime.getURL('sm/release.json')).then(r => r.json()).catch(e => { releasePromise = null; throw e; })), repository: local['sm.repository'] ?? '', syncEnabled: local['sm.syncEnabled'] ?? false, startError: local['sm.startError'] ?? '', notice: local['sm.notice'] ?? null };
    }
    // Popup reads only its current site, not the dashboard's rule catalog or user scripts.
    async function popupStatus(request) {
        const tab = Number.isInteger(request.tabId) ? await api.tabs.get(request.tabId).catch(() => null) : (await api.tabs.query({ active: true, currentWindow: true }))[0];
        let host = '';
        if (tab?.url && /^https?:/.test(tab.url) && !/^https:\/\/(chromewebstore\.google\.com\/|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/.test(tab.url)) host = hostname(tab.url);
        if (!host) return { hostname: '', level: 0, pauses: {}, hasAccess: false };
        const [level, stored, hasAccess] = await Promise.all([engine({ what: 'getFilteringMode', hostname: host }), read('sm.pauses', {}), api.permissions.contains({ origins: [`*://${host}/*`] })]);
        return { hostname: host, tabId: tab.id, level, pauses: stored[host] ? { [host]: stored[host] } : {}, hasAccess };
    }

    // ---- request handling -----------------------------------------------------------------------------------
    async function restore(r) {
        const data = await config.validate(r.data);
        if (r.baseRevision && r.baseRevision !== await config.fingerprint()) throw new Error('预览后本机配置已变化，请重新预览');
        // Everything needed to undo the attempt is saved before the first side effect.
        const envelope = await pauses.capture();
        const startedAt = Date.now();
        await write('sm.pendingRollback', { what: 'restore', stage: 'preparing', envelope, startedAt });
        await pauses.cancelOverlapping();
        const before = await config.snapshot();
        await write('sm.recovery', before);
        await write('sm.pendingRollback', { what: 'restore', stage: 'applying', envelope, startedAt, targetFp: await config.digest(data.settings) });
        try { await config.apply(data); }
        catch (error) {
            try { await config.apply(before); await pauses.reinstate(envelope); await api.storage.local.remove('sm.pendingRollback'); }
            catch { throw new Error(`导入失败且自动回退未完成；恢复快照已保存，下次启动会再次尝试恢复。${error.message}`); }
            throw new Error(`导入失败，已恢复原配置${Object.keys(envelope.pauses).length ? '和仍在有效期内的临时暂停' : ''}。${error.message}`);
        }
        await api.storage.local.remove('sm.pendingRollback');
        await history.remember('导入配置', before, await config.snapshot());
        return true;
    }
    async function undo() {
        const item = await history.latest();
        if (!item) throw new Error('没有可撤销的修改');
        if (Object.keys(await read('sm.pauses', {})).length) throw new Error('请先恢复临时暂停的网站');
        const current = await config.snapshot();
        if (canonical(current.settings) !== canonical(item.after)) throw new Error('配置已发生其他变化，请导出备份后使用恢复快照');
        await write('sm.recovery', current);
        await write('sm.pendingRollback', { what: 'undo', stage: 'applying', envelope: { pauses: {} }, startedAt: Date.now(), targetFp: await config.digest(item.before.settings) });
        try { await config.apply(item.before); }
        catch (error) {
            try { await config.apply(current); await api.storage.local.remove('sm.pendingRollback'); }
            catch { throw new Error(`撤销失败且自动回退未完成；恢复快照已保存，下次启动会再次尝试恢复。${error.message}`); }
            throw new Error(`撤销失败，已恢复撤销前的配置。${error.message}`);
        }
        await api.storage.local.remove('sm.pendingRollback');
        await history.dropLatest(item);
        return true;
    }
    async function handle(r) {
        const host = r.hostname ? hostname(r.hostname) : '';
        switch (r.what) {
        case 'sm:status': return getStatus(r);
        case 'sm:popupStatus': return popupStatus(r);
        case 'sm:snapshot': return config.snapshot();
        case 'sm:preview': { const data = await config.validate(r.data); return { data, summary: backupSummary(data), baseRevision: await config.fingerprint() }; }
        case 'sm:restore': return restore(r);
        case 'sm:recovery': return read('sm.recovery', null);
        case 'sm:clearRecords': await history.clear(); return true;
        case 'sm:setMode': {
            if (!host || ![0, 1, 2, 3].includes(r.level)) throw new Error('站点或过滤模式无效');
            await pauses.cancelOverlapping(host);
            const value = await config.mutate('调整站点过滤', () => engine({ what: 'setFilteringMode', hostname: host, level: r.level }));
            if (value !== r.level) throw new Error('过滤模式未生效，请检查网站权限');
            await pauses.reloadHost(host); return value;
        }
        case 'sm:pause': {
            if (!host || !['10m', '1h', 'session'].includes(r.duration)) throw new Error('暂停参数无效');
            return pauses.start(host, r.duration);
        }
        case 'sm:resume': await pauses.resume(host, true); return true;
        case 'sm:preset': {
            // 'recommended' and 'quiet' only ever add (first-run buttons); 'chinese' and 'annoyances' are the switches on the rules page.
            const presets = {
                recommended: { ids: ['chn-0', 'easylist', 'easyprivacy'], on: '启用推荐规则' },
                quiet: { ids: ['chn-0', 'easylist', 'easyprivacy', 'annoyances-overlays', 'annoyances-notifications', 'annoyances-social'], on: '启用推荐规则' },
                chinese: { ids: ['chn-0'], on: '启用中文网站规则', off: '关闭中文网站规则' },
                annoyances: { ids: ['annoyances-overlays', 'annoyances-notifications', 'annoyances-social'], on: '启用减少骚扰', off: '关闭减少骚扰' },
            };
            const preset = presets[r.preset];
            if (!preset) throw new Error('未知配置');
            const enable = r.enabled !== false;
            if (!enable && !preset.off) throw new Error('这组规则不能在这里关闭');
            return config.mutate(enable ? preset.on : preset.off, async () => {
                const old = await engine({ what: 'getEnabledRulesets' });
                const enabledRulesets = enable ? [...new Set([...old, ...preset.ids])] : old.filter(id => !preset.ids.includes(id));
                await engine({ what: 'applyRulesets', enabledRulesets });
                const after = await engine({ what: 'getEnabledRulesets' });
                if (enable && !preset.ids.every(id => after.includes(id))) throw new Error('部分规则未启用，请检查规则限额');
                if (!enable && preset.ids.some(id => after.includes(id))) throw new Error('部分规则未能关闭，请刷新后重试');
                return after;
            });
        }
        case 'sm:history': return history.list();
        case 'sm:undo': return undo();
        case 'sm:filters': return engine({ what: 'getAllCustomFilters' });
        case 'sm:removeFilter': {
            if (!host || typeof r.selector !== 'string') throw new Error('规则无效');
            return config.mutate('删除自定义规则', () => engine({ what: 'removeCustomFilters', hostname: host, selectors: [r.selector] }));
        }
        case 'sm:setUserDnrRules': {
            // The upstream rule editor used to write storage first and ask the engine afterwards, outside every queue.
            if (typeof r.text !== 'string' || r.text.length > 200000) throw new Error('高级网络规则无效或过长');
            return config.mutate('编辑高级网络规则', async () => {
                const text = r.text.trim();
                await (text ? write('userDnrRules', text) : api.storage.local.remove('userDnrRules'));
                return engine({ what: 'updateUserDnrRules' });
            });
        }
        case 'sm:cookieToggle': return config.mutate('切换 Cookie 自动拒绝', () => write('sm.cookieReject', r.enabled === true));
        case 'sm:repository': await write('sm.repository', validateRepository(r.url)); return true;
        case 'sm:lists': return engine({ what: 'getImportedLists' });
        case 'sm:updateLists': return updateLists();
        case 'sm:updateProgress': return updateJob ?? { state: 'idle' };
        case 'sm:cancelUpdate': if (updateJob?.state === 'downloading') { updateAbort.abort(); return true; } throw new Error('已进入规则提交阶段，无法取消');
        case 'sm:opStatus': {
            if (!validOpId(r.opId)) throw new Error('操作编号无效');
            const op = await ops.get(r.opId);
            if (!op) return { state: ops.isRunningHere(r.opId) ? 'running' : 'unknown' };
            return { state: op.state === 'running' && !ops.isRunningHere(r.opId) ? 'interrupted' : op.state, error: op.error, message: op.message, result: op.result };
        }
        case 'sm:ackNotice': await api.storage.local.remove('sm.notice'); return true;
        case 'sm:syncEnable': await write('sm.syncEnabled', r.enabled === true); return true;
        case 'sm:syncRead': {
            if (!(await read('sm.syncEnabled', false))) throw new Error('请先开启可选同步');
            const cloud = (await api.storage.sync.get('sm.config'))['sm.config'] ?? null;
            if (cloud) await config.validate(cloud.data);
            return cloud;
        }
        case 'sm:syncWrite': {
            if (!(await read('sm.syncEnabled', false))) throw new Error('请先开启可选同步');
            if (Object.keys(await read('sm.pauses', {})).length) throw new Error('请先恢复临时暂停，避免同步临时例外');
            const old = (await api.storage.sync.get('sm.config'))['sm.config'];
            if ((old?.revision ?? null) !== (r.expectedRevision ?? null)) throw new Error('云端版本已变化，请重新读取和预览后再上传');
            const cloud = { revision: crypto.randomUUID(), data: await config.snapshot() };
            if (new TextEncoder().encode(JSON.stringify(cloud)).length > 7000) throw new Error('配置超过同步空间，请使用文件导出／导入');
            await api.storage.sync.set({ 'sm.config': cloud });
            const after = (await api.storage.sync.get('sm.config'))['sm.config'];
            if (after?.revision !== cloud.revision) throw new Error('同步读回冲突，请重新读取');
            return cloud;
        }
        case 'sm:syncDelete': await api.storage.sync.remove('sm.config'); return true;
        case 'sm:stats': {
            if (!Number.isInteger(r.tabId)) throw new Error('请从网站工具栏打开面板查看统计');
            const { rulesMatchedInfo } = await api.declarativeNetRequest.getMatchedRules({ tabId: r.tabId });
            const rows = rulesMatchedInfo.slice(-50);
            const sources = new Map();
            for (const id of new Set(rows.map(x => x.rule.rulesetId))) {
                if (id === '_dynamic') sources.set(id, await api.declarativeNetRequest.getDynamicRules());
                else if (id === '_session') sources.set(id, await api.declarativeNetRequest.getSessionRules());
                else {
                    const entry = api.runtime.getManifest().declarative_net_request.rule_resources.find(x => x.id === id);
                    if (entry) { if (!staticActions.has(id)) { const rules = await (await fetch(api.runtime.getURL(entry.path.replace(/^\//, '')))).json(); if (staticActions.size >= 4) staticActions.delete(staticActions.keys().next().value); staticActions.set(id, new Map(rules.map(x => [x.id, x.action?.type]))); } sources.set(id, staticActions.get(id)); }
                }
            }
            return rows.map(x => ({ ruleId: x.rule.ruleId, rulesetId: x.rule.rulesetId, timeStamp: x.timeStamp, action: (sources.get(x.rule.rulesetId) instanceof Map ? sources.get(x.rule.rulesetId).get(x.rule.ruleId) : sources.get(x.rule.rulesetId)?.find(rule => rule.id === x.rule.ruleId)?.action?.type) ?? 'unknown' }));
        }
        default: throw new Error('未知操作');
        }
    }
    // Replays the recorded outcome when an operation id was already executed (client retry after a timeout).
    async function runOp(r) {
        if (!validOpId(r.opId)) return handle(r);
        const prior = await ops.get(r.opId);
        if (prior) {
            if (prior.state === 'done') return prior.result ?? true;
            if (prior.state === 'failed') throw new Error(prior.error || '操作失败');
            throw new Error(prior.message || NOTICES.interrupted);
        }
        await ops.begin(r.opId, r.what);
        try { const result = await handle(r); await ops.finish(r.opId, 'done', { result: ops.compact(result) }); return result; }
        catch (error) { await ops.finish(r.opId, 'failed', { error: error.message }).catch(() => {}); throw error; }
    }
    // While the upstream engine is still starting, status requests get an honest "still starting" answer after
    // a short wait instead of hanging until the page gives up; the page polls again.
    const STARTING = new Set(['sm:popupStatus', 'sm:status']);
    async function starting(r) {
        if (!options.progress || !STARTING.has(r.what)) return null;
        let state = options.progress();
        if (state.ready) return null;
        const settled = await Promise.race([ready.then(() => true, () => true), sleep(options.startingWaitMs ?? 2500).then(() => false)]);
        if (settled) return null;
        state = options.progress();
        if (state.ready) return null;
        return { engineStarting: true, ...state, startError: await read('sm.startError', '') };
    }
    function dispatch(r) {
        const received = timing.now();
        if (STARTING.has(r.what) && options.progress && !options.progress().ready) return starting(r).then(answer => answer ?? dispatchNow(r, received));
        return dispatchNow(r, received);
    }
    function dispatchNow(r, received) {
        if (direct.has(r.what)) return ensureInit().then(async () => {
            const started = timing.now();
            const data = await handle(r);
            return r.what === 'sm:popupStatus' ? { ...data, timing: timing.report(received, started, timing.now()) } : data;
        });
        const run = () => ensureInit().then(() => serial(() => runOp(r)));
        return validOpId(r.opId) ? ops.once(r.opId, run) : run();
    }
    api.runtime.onMessage.addListener((r, sender, reply) => {
        if (typeof r?.what !== 'string' || !r.what.startsWith('sm:')) return;
        const ownPage = sender.id === api.runtime.id && sender.url?.startsWith(api.runtime.getURL(''));
        // Content scripts may only ask whether to reject cookies and report an attempt.
        if (!ownPage) {
            if (!sender.tab || !['sm:cookieAllowed', 'sm:cookieResult'].includes(r.what)) { reply({ ok: false, error: '无权执行此操作' }); return; }
            serial(async () => {
                const host = hostname(sender.url);
                const allowed = await read('sm.cookieReject', false) && (await engine({ what: 'getFilteringMode', hostname: host })) > 0;
                if (r.what === 'sm:cookieAllowed') return allowed;
                if (!allowed) return false;
                const cookies = await read('sm.cookies', {});
                if (!['OneTrust', 'Cookiebot'].includes(r.provider)) return false;
                cookies[host] = { provider: r.provider, result: r.closed === true ? '拒绝按钮已点击，提示已消失；未验证服务端同意记录' : '已点击拒绝按钮，提示仍存在', time: Date.now() };
                const entries = Object.entries(cookies).sort((a, b) => b[1].time - a[1].time).slice(0, 100);
                await write('sm.cookies', Object.fromEntries(entries)); return true;
            }).then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message }));
            return true;
        }
        dispatch(r).then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message }));
        return true;
    });
    return { wrap(request, sender) {
        if (!changed.has(request.what)) return engine(request, sender);
        return serial(async () => {
            if (request.what.includes('FilteringMode')) await pauses.cancelOverlapping(request.hostname && request.hostname !== 'all-urls' ? request.hostname : undefined);
            return config.mutate(changed.get(request.what) ?? '完整设置修改', () => engine(request, sender));
        });
    } };
}
