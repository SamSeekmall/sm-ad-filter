// Bounded undo history: 10 entries / 2 MB, metadata index separate from the stored snapshots.
import { canonical } from './core.mjs';
const encoder = new TextEncoder();
const size = value => encoder.encode(JSON.stringify(value)).length;

export function createHistory({ api, read, write, uuid = () => crypto.randomUUID(), now = () => Date.now() }) {
    async function index() {
        const stored = await read('sm.historyIndex', null);
        if (stored) return stored;
        // One-time migration from the 0.3 layout (full snapshots inside one array).
        const old = await read('sm.history', []), next = [];
        for (const item of old) {
            await write(`sm.history.${item.id}`, item);
            next.push({ id: item.id, label: item.label, time: item.time, bytes: size(item) });
        }
        let total = next.reduce((sum, x) => sum + x.bytes, 0); const removed = [];
        while (next.length > 10 || total > 2000000) { const item = next.pop(); total -= item.bytes; removed.push(`sm.history.${item.id}`); }
        await write('sm.historyIndex', next);
        await api.storage.local.remove(['sm.history', ...removed]);
        return next;
    }
    async function remember(label, before, after) {
        if (canonical(before.settings) === canonical(after.settings)) return;
        const history = await index();
        const item = { id: uuid(), label, time: now(), before, after: after.settings };
        const bytes = size(item);
        if (bytes > 2000000) return;
        await write(`sm.history.${item.id}`, item);
        history.unshift({ id: item.id, label, time: item.time, bytes });
        let total = history.reduce((sum, x) => sum + x.bytes, 0); const removed = [];
        while (history.length > 10 || total > 2000000) { const old = history.pop(); total -= old.bytes; removed.push(`sm.history.${old.id}`); }
        await write('sm.historyIndex', history);
        if (removed.length) await api.storage.local.remove(removed);
    }
    return {
        index, remember,
        list: async () => (await index()).map(({ id, label, time }) => ({ id, label, time })),
        latest: async () => { const history = await index(); return history[0] ? read(`sm.history.${history[0].id}`, null) : null; },
        async dropLatest(item) {
            const history = await index(); history.shift();
            await write('sm.historyIndex', history);
            await api.storage.local.remove(`sm.history.${item.id}`);
        },
        async clear() {
            const history = await index(); await write('sm.historyIndex', []);
            await api.storage.local.remove(['sm.history', 'sm.recovery', 'sm.cookies', 'sm.pendingRollback', 'sm.notice', 'sm.ops', ...history.map(x => `sm.history.${x.id}`)]);
        },
    };
}
