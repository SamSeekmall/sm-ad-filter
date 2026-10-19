// Shared percentile math and gate evaluation for popup timing reports. Pure functions, unit tested.
export const percentile = (sortedAscending, p) => {
    if (!sortedAscending.length) return null;
    return sortedAscending[Math.min(sortedAscending.length - 1, Math.max(0, Math.ceil(p * sortedAscending.length) - 1))];
};
// Failures and timeouts are counted, never dropped: a sample that never reached "state visible" is a result.
export function summarize(samples) {
    const ok = samples.filter(s => s.ok).map(s => s.stateObservedMs).sort((a, b) => a - b);
    const round = value => value === null ? null : Math.round(value);
    return {
        n: samples.length, failures: samples.filter(s => !s.ok).length, timeouts: samples.filter(s => s.timedOut).length,
        min: round(ok[0] ?? null), median: round(percentile(ok, 0.5)), p90: round(percentile(ok, 0.9)), p95: round(percentile(ok, 0.95)), max: round(ok.at(-1) ?? null),
    };
}
// Each group ends MET, NOT_MET or INSUFFICIENT_SAMPLES. A tail percentile needs enough samples to mean anything.
export function evaluate(groups, gates) {
    const verdicts = {};
    for (const [name, limit] of Object.entries(gates.limits)) {
        const g = groups[name], need = gates.minimumSamples[name] ?? 0, reasons = [];
        if (!g) { verdicts[name] = { verdict: 'INSUFFICIENT_SAMPLES', reasons: ['no samples recorded'] }; continue; }
        if (g.n < need) reasons.push(`only ${g.n} samples, ${need} required`);
        const failureRate = g.n ? g.failures / g.n : 1;
        const hard = [];
        if (failureRate > gates.maxFailureRate) hard.push(`${g.failures} of ${g.n} samples failed or timed out`);
        if (limit.p95Ms !== undefined && g.p95 !== null && g.p95 > limit.p95Ms) hard.push(`p95 ${g.p95} ms exceeds ${limit.p95Ms} ms`);
        if (limit.maxMs !== undefined && g.max !== null && g.max > limit.maxMs) hard.push(`max ${g.max} ms exceeds ${limit.maxMs} ms`);
        verdicts[name] = hard.length ? { verdict: 'NOT_MET', reasons: [...hard, ...reasons] } : reasons.length ? { verdict: 'INSUFFICIENT_SAMPLES', reasons } : { verdict: 'MET', reasons: [] };
    }
    const all = Object.values(verdicts).map(v => v.verdict);
    return { overall: all.includes('NOT_MET') ? 'NOT_MET' : all.includes('INSUFFICIENT_SAMPLES') ? 'INSUFFICIENT_SAMPLES' : 'MET', groups: verdicts };
}
