import { readFile, access, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'sm-ad-filter');
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const manifest = await json('manifest.json');
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'SM 净览');
const resources = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, manifest.storage.managed_schema, ...Object.values(manifest.icons), ...manifest.web_accessible_resources.flatMap(item => item.resources), ...(manifest.content_scripts||[]).flatMap(item=>item.js||[]), 'sm/core.mjs','sm/updates.mjs','sm/worker.mjs','sm/timing.mjs','sm/ops.mjs','sm/history.mjs','sm/pauses.mjs','sm/config.mjs','SM-FILES.json','SM-BUILD.json','sm/welcome.js','sm/welcome.css','sm/popup.js','sm/popup.css','sm/brand.png','sm/TABLER-LICENSE.txt','sm/release.json','PRIVACY-SM.md'];
let totalRules = 0;
for (const ruleset of manifest.declarative_net_request.rule_resources) {
    resources.push(ruleset.path);
    const rules = await json(ruleset.path);
    assert.equal(new Set(rules.map(rule => rule.id)).size, rules.length, `duplicate rule IDs: ${ruleset.id}`);
    for (const rule of rules) { assert.ok(rule.id > 0 && rule.action && rule.condition); }
    totalRules += rules.length;
}
for (const file of resources) await access(path.join(root, file));
let count = 0;
async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isDirectory()) await walk(file);
        else if (file.endsWith('.json')) { JSON.parse(await readFile(file, 'utf8')); count++; }
    }
}
await walk(root);
for (const file of ['sm/welcome.js','sm/popup.js','sm/worker.mjs','sm/timing.mjs','sm/ops.mjs','sm/history.mjs','sm/pauses.mjs','sm/config.mjs','sm/core.mjs','sm/cookies.js','js/background.js','js/background.bundle.js','js/imported-lists.js','js/offscreen/compile-filters.js','js/offscreen/fetch-list.js','sm/updates.mjs']) execFileSync(process.execPath, ['--check', path.join(root, file)]);
// Exact package contents: nothing missing, nothing left over from an older build, nothing altered since the build.
const listed = (await json('SM-FILES.json')).entries;
const actual = [];
async function collect(dir, base = '') {
    for (const item of await readdir(dir, { withFileTypes: true })) {
        const rel = base ? `${base}/${item.name}` : item.name;
        if (item.isDirectory()) await collect(path.join(dir, item.name), rel); else actual.push(rel);
    }
}
await collect(root);
const expected = new Set([...Object.keys(listed), 'SM-FILES.json']);
const extra = actual.filter(f => !expected.has(f)), missing = [...expected].filter(f => !actual.includes(f));
assert.deepEqual({ extra, missing }, { extra: [], missing: [] }, 'package file set differs from SM-FILES.json');
for (const [rel, info] of Object.entries(listed)) {
    assert.equal((await stat(path.join(root, rel))).size, info.bytes, `size changed: ${rel}`);
    assert.equal(createHash('sha256').update(await readFile(path.join(root, rel))).digest('hex'), info.sha256, `content changed: ${rel}`);
}
const build = await json('SM-BUILD.json');
assert.ok(build.upstreamSeams.length >= 20 && build.upstreamSeams.every(x => x.matches >= 1), 'upstream seam contract recorded');
assert.match(build.toolchain.esbuild, /^\d+\.\d+\.\d+$/);
console.log(JSON.stringify({ status: 'PASS', packageFiles: Object.keys(listed).length + 1, toolchain: build.toolchain, upstreamSeams: build.upstreamSeams.length, manifestResources: resources.length, jsonFiles: count, rulesets: manifest.declarative_net_request.rule_resources.length, totalRules, browserRuntime: 'NOT_TESTED_BY_THIS_SCRIPT' }, null, 2));
