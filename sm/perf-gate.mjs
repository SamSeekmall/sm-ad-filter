// Release gate for popup latency. Usage:
//   node sm/perf-gate.mjs <native-timing.json> [more.json ...] [--commit <sha>] [--out receipt.json]
// Exit 0 only when every browser report is COMPLETE, bound to the commit, and every group is MET.
// A report that merely finished running is not a passed gate.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from './perf-stats.mjs';
const argv = process.argv.slice(2);
const take = flag => { const i = argv.indexOf(flag); return i < 0 ? null : argv.splice(i, 2)[1]; };
const commit = take('--commit'), outFile = take('--out');
const gates = JSON.parse(await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'perf-gates.json'), 'utf8'));
const results = [];
for (const file of argv) {
    const report = JSON.parse(await readFile(file, 'utf8'));
    const current = report.runs?.find(run => run.label === 'current');
    const problems = [];
    if (report.schema !== 3) problems.push('report is not schema 3 (segment timings, percentile groups)');
    if (report.status !== 'COMPLETE') problems.push(`harness status ${report.status}`);
    if (commit && current?.build?.localCommit !== commit) problems.push('report was produced for another commit');
    const evaluation = current ? evaluate(current.groups ?? {}, gates) : { overall: 'INSUFFICIENT_SAMPLES', groups: {} };
    results.push({ file, channel: report.channel, load: report.config?.load, device: report.system?.cpuModel, problems, ...evaluation, overall: problems.length ? 'NOT_MET' : evaluation.overall });
}
const overall = results.length && results.every(r => r.overall === 'MET') ? 'MET' : results.some(r => r.overall === 'NOT_MET') ? 'NOT_MET' : 'INSUFFICIENT_SAMPLES';
const receipt = { gateStatus: gates.status, overall, results };
if (outFile) await writeFile(outFile, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
process.exit(overall === 'MET' ? 0 : 1);
