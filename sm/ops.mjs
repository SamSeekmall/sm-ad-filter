// Persistent operation log. A browser can stop the service worker at any time, and a UI timeout does not
// cancel work already handed to the worker. Each mutating request carries an opId so the outcome can be
// looked up (and never re-executed) instead of guessed.
export const validOpId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
const MAX_RESULT_BYTES = 20000;

export function createOps({ read, write, now = () => Date.now(), limit = 30 }) {
    const running = new Map();
    let chain = Promise.resolve();
    // Read-modify-write of one storage key must not interleave.
    const update = fn => {
        const run = chain.then(async () => {
            const ops = await read('sm.ops', {});
            const out = await fn(ops);
            const keep = Object.values(ops).sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
            await write('sm.ops', Object.fromEntries(keep.map(op => [op.id, op])));
            return out;
        });
        chain = run.catch(() => {});
        return run;
    };
    return {
        get: async id => (await read('sm.ops', {}))[id] ?? null,
        begin: (id, what) => update(ops => { ops[id] = { id, what, state: 'running', startedAt: now() }; }),
        finish: (id, state, patch = {}) => update(ops => { if (ops[id]) Object.assign(ops[id], { state, finishedAt: now() }, patch); }),
        // Requests still marked running that this worker is not executing were cut off by a worker stop.
        orphaned: async () => Object.values(await read('sm.ops', {})).filter(op => op.state === 'running' && !running.has(op.id)),
        // Join a duplicate that arrives while the first copy is still executing in this worker.
        once(id, factory) {
            if (running.has(id)) return running.get(id);
            const promise = factory();
            running.set(id, promise);
            const clear = () => running.delete(id);
            promise.then(clear, clear);
            return promise;
        },
        isRunningHere: id => running.has(id),
        compact: value => (value === undefined ? true : JSON.stringify(value)?.length <= MAX_RESULT_BYTES ? value : true),
    };
}
