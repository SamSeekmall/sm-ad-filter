// Temporary per-site pauses. A pause changes the filtering-mode subtree of one host; its record keeps the
// previous subtree so it can be put back, but only if nobody changed that subtree in the meantime.
import { hostname, related, subtree, mergeSubtree, canonical } from './core.mjs';

// Fixed pause lengths; anything else lasts until the browser session ends.
export const DURATIONS = { '10m': 600000, '1h': 3600000 };

export function createPauses({ api, engine, read, write, now = () => Date.now(), uuid = () => crypto.randomUUID() }) {
    let session;
    const alarmName = host => `sm:pause:${host}`;
    async function reloadHost(host) {
        const tabs = await api.tabs.query({});
        for (const tab of tabs) try { if (tab.url && hostname(tab.url) === host) await api.tabs.reload(tab.id); } catch { /* Closed or protected tab. */ }
    }
    async function resume(host, reload = false) {
        const pauses = await read('sm.pauses', {});
        const pause = pauses[host];
        if (!pause) return;
        const current = await engine({ what: 'getFilteringModeDetails' });
        if (canonical(subtree(current, host)) === canonical(pause.after)) {
            await engine({ what: 'setFilteringModeDetails', modes: mergeSubtree(current, pause.before, host) });
        }
        delete pauses[host];
        await write('sm.pauses', pauses);
        await api.alarms.clear(alarmName(host));
        if (reload) await reloadHost(host);
    }
    async function cancelOverlapping(host) {
        for (const key of Object.keys(await read('sm.pauses', {}))) if (!host || related(key, host)) await resume(key);
    }
    async function start(host, duration) {
        await cancelOverlapping(host);
        const before = subtree(await engine({ what: 'getFilteringModeDetails' }), host);
        const level = await engine({ what: 'getFilteringMode', hostname: host });
        if (level === 0) throw new Error('此站点已处于不过滤模式，无需临时暂停');
        const after = { none: [host], basic: [], optimal: [], complete: [] };
        const until = DURATIONS[duration] ? now() + DURATIONS[duration] : null;
        const pauses = await read('sm.pauses', {});
        // `level` is the mode before the pause: the popup shows it as "after resume" instead of "不过滤".
        pauses[host] = { before, after, until, session, level };
        await write('sm.pauses', pauses);
        if (until) await api.alarms.create(alarmName(host), { when: until });
        const current = await engine({ what: 'getFilteringModeDetails' });
        await engine({ what: 'setFilteringModeDetails', modes: mergeSubtree(current, after, host) });
        await reloadHost(host);
        return pauses[host];
    }
    // Everything needed to put the pauses back exactly as they were, taken before any side effect.
    async function capture() {
        const pauses = await read('sm.pauses', {});
        if (!Object.keys(pauses).length) return { pauses: {} };
        const current = await engine({ what: 'getFilteringModeDetails' });
        return { pauses: Object.fromEntries(Object.entries(pauses).map(([host, record]) => [host, { record, intact: canonical(subtree(current, host)) === canonical(record.after) }])) };
    }
    // Re-establish captured pauses after a rollback. Expired deadlines and pauses of an ended browser
    // session stay ended; a pause whose subtree had already been changed by someone else stays dropped.
    async function reinstate(envelope) {
        const revived = [];
        for (const [host, { record, intact }] of Object.entries(envelope?.pauses ?? {})) {
            if (!intact) continue;
            if (record.until ? record.until <= now() : record.session !== session) continue;
            const current = await engine({ what: 'getFilteringModeDetails' });
            await engine({ what: 'setFilteringModeDetails', modes: mergeSubtree(current, record.after, host) });
            const pauses = await read('sm.pauses', {});
            pauses[host] = record;
            await write('sm.pauses', pauses);
            if (record.until) await api.alarms.create(alarmName(host), { when: record.until });
            revived.push(host);
        }
        return revived;
    }
    // Worker start: pick up the browser-session identity and settle pauses that ended while the worker was down.
    async function reconcile() {
        session = (await api.storage.session.get('sm.session'))['sm.session'];
        if (!session) { session = uuid(); await api.storage.session.set({ 'sm.session': session }); }
        const pauses = await read('sm.pauses', {});
        let details;
        for (const [host, p] of Object.entries(pauses)) {
            if ((p.until && p.until <= now()) || (!p.until && p.session !== session)) { await resume(host); continue; }
            // A pause record whose mode change never completed (worker stopped between the two writes).
            details ??= await engine({ what: 'getFilteringModeDetails' });
            if (canonical(subtree(details, host)) !== canonical(p.after)) { await resume(host); continue; }
            if (p.until) await api.alarms.create(alarmName(host), { when: p.until });
        }
    }
    return { start, resume, cancelOverlapping, capture, reinstate, reconcile, reloadHost, alarmName, getSession: () => session };
}
