import { readFile, access, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'sm-ad-filter');
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const manifest = await json('manifest.json');
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'SM 净览');
const resources = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, manifest.storage.managed_schema, ...Object.values(manifest.icons), ...manifest.web_accessible_resources.flatMap(item => item.resources), ...(manifest.content_scripts||[]).flatMap(item=>item.js||[]), 'sm/core.mjs','sm/updates.mjs','sm/worker.mjs','sm/welcome.js','sm/welcome.css','sm/popup.js','sm/popup.css','sm/brand.png','sm/TABLER-LICENSE.txt','sm/release.json','PRIVACY-SM.md'];
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
for (const file of ['sm/welcome.js','sm/popup.js','sm/worker.mjs','sm/core.mjs','sm/cookies.js','js/background.js','js/background.bundle.js','js/imported-lists.js','js/offscreen/compile-filters.js','js/offscreen/fetch-list.js','sm/updates.mjs']) execFileSync(process.execPath, ['--check', path.join(root, file)]);
console.log(JSON.stringify({ status: 'PASS', manifestResources: resources.length, jsonFiles: count, rulesets: manifest.declarative_net_request.rule_resources.length, totalRules, browserRuntime: 'NOT_TESTED_BY_THIS_SCRIPT' }, null, 2));
