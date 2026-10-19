// Segment timing for the popup path. Numbers only: no URLs, host names or page content.
// All values are milliseconds on the service worker's own clock (performance.now()).
export function createTiming(clock = () => performance.now()) {
    const marks = { engineReady: null, smInitDone: null };
    return {
        mark(name) { if (marks[name] === null) marks[name] = Math.round(clock()); },
        // Called once per request: when it arrived, when initialization allowed it to run, when it finished.
        report(received, started, finished) {
            return {
                workerUptimeAtReceiptMs: Math.round(received),
                engineReadyAtMs: marks.engineReady,
                smInitDoneAtMs: marks.smInitDone,
                waitForInitMs: Math.max(0, Math.round(started - received)),
                handlerMs: Math.max(0, Math.round(finished - started)),
                // A request that reaches a worker younger than 3 s is, in practice, the one that woke it.
                wokeWorker: received < 3000,
            };
        },
        now: clock,
    };
}
