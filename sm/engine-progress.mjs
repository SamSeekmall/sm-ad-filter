// Where the upstream engine is in its start-up, so the popup can say "starting: step N" instead of spinning,
// and so a start that never finishes leaves a trace in local storage for the diagnostics page.
// Numbers and fixed step names only: no URLs or rule text.
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export const engineProgress = { startedAtMs: Math.round(clock()), startedWall: Date.now(), phases: [], ready: false, error: null };
let persist = Promise.resolve();
function save() {
    const api = globalThis.chrome;
    if (!api?.storage?.local) return;
    const snapshot = JSON.parse(JSON.stringify(engineProgress));
    persist = persist.then(() => api.storage.local.set({ 'sm.engineStart': snapshot })).catch(() => {});
}
// Fast starts (the usual case) write nothing; a start still running after 1.5 s, or one that failed, is kept.
const SLOW_MS = 1500;
let slowTimer = setTimeout(() => { if (!engineProgress.ready) { engineProgress.slow = true; save(); } }, SLOW_MS);
export function smPhase(name) {
    engineProgress.phases.push({ name, atMs: Math.round(clock() - engineProgress.startedAtMs) });
    if (engineProgress.slow) save();
}
export function smEngineDone(error) {
    engineProgress.ready = !error;
    engineProgress.error = error ? String(error?.message ?? error).slice(0, 300) : null;
    engineProgress.phases.push({ name: error ? '启动失败' : '已就绪', atMs: Math.round(clock() - engineProgress.startedAtMs) });
    clearTimeout(slowTimer);
    if (error || engineProgress.slow) save();
}
export function progressSummary() {
    const last = engineProgress.phases.at(-1);
    return { ready: engineProgress.ready, error: engineProgress.error, phase: last?.name ?? '加载后台脚本', step: engineProgress.phases.length, elapsedMs: Math.round(clock() - engineProgress.startedAtMs) };
}
