// Safari (iOS / macOS) web-extension overlay for the pinned upstream engine. GPL-3.0-or-later.
// Same idea as sm/firefox/overlay.mjs: the compiled rulesets stay the pinned chromium/ ones and only upstream's own
// Safari differences are applied (gorhill/uBlock 610c2431d, platform/mv3/safari/):
//   manifest.json       event-page background (non-persistent), Safari minimum version
//   ext-compat.js, ext-offscreen.js, css-api.js, css-user.js   Safari API workarounds
//   patch-ruleset.js    discards rules WebKit cannot evaluate, rewrites others (requestDomains, removeparam, ...)
//   patch-extension.js  store compliance (description length, version shape); run by build.mjs on the finished package
// Packaging into an app (Xcode project, signing, App Store) needs macOS and cannot be done here.
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DNR_DIRS = ['main', 'regex', 'strictblock'];

async function walk(dir) {
    const found = [];
    for (const item of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isDirectory()) found.push(...await walk(file)); else found.push(file);
    }
    return found;
}

export async function applySafariOverlay({ root, out }) {
    const dir = path.join(root, 'sm/safari');
    const read = async file => JSON.parse(await readFile(file, 'utf8'));
    const base = await read(path.join(out, 'manifest.json'));
    const safari = await read(path.join(dir, 'manifest.json'));
    const upstreamRulesets = await read(path.join(root, 'sm/safari/excluded-rulesets.json'));
    const excluded = new Set(upstreamRulesets.ids);

    // ---- manifest ----------------------------------------------------------------------------------------------
    safari.declarative_net_request = { rule_resources: base.declarative_net_request.rule_resources.filter(item => !excluded.has(item.id)) };
    safari.version = base.version;
    safari.web_accessible_resources = base.web_accessible_resources.map(({ use_dynamic_url, ...entry }) => entry);
    for (const key of ['offscreen', 'userScripts']) if (safari.permissions.includes(key)) throw new Error(`Safari manifest unexpectedly requires ${key}`);
    await writeFile(path.join(out, 'manifest.json'), JSON.stringify(safari, null, 2) + '\n');

    // ---- platform files ----------------------------------------------------------------------------------------
    await cp(path.join(dir, 'ext-compat.js'), path.join(out, 'js/ext-compat.js'));
    await cp(path.join(dir, 'ext-offscreen.js'), path.join(out, 'js/ext-offscreen.js'));
    await cp(path.join(dir, 'css-api.js'), path.join(out, 'js/scripting/css-api.js'));
    await cp(path.join(dir, 'css-user.js'), path.join(out, 'js/scripting/css-user.js'));

    // ---- rulesets Safari must not ship ----------------------------------------------------------------------------
    const detailsFile = path.join(out, 'rulesets/ruleset-details.json');
    let details = (await read(detailsFile)).filter(item => !excluded.has(item.id));
    let removedFiles = 0;
    for (const file of await walk(path.join(out, 'rulesets'))) {
        const name = path.basename(file).replace(/\.[^.]+$/, '');
        if (excluded.has(name)) { await rm(file); removedFiles++; }
    }
    for (const detail of ['generic-details.json', 'scriptlet-details.json']) {
        const file = path.join(out, 'rulesets', detail);
        const entries = await read(file);
        await writeFile(file, JSON.stringify(entries.filter(([id]) => !excluded.has(id)), null, 1) + '\n');
    }

    // ---- DNR rules ---------------------------------------------------------------------------------------------
    // Upstream patches rules before numbering them, so ids are renumbered here after the patch (copies share ids).
    const { patchRuleset } = await import(pathToFileURL(path.join(dir, 'patch-ruleset.js')).href);
    const log = console.log; console.log = () => {};
    const counts = {};
    try {
        for (const sub of DNR_DIRS) {
            for (const name of await readdir(path.join(out, 'rulesets', sub))) {
                if (!name.endsWith('.json')) continue;
                const file = path.join(out, 'rulesets', sub, name);
                const rules = await read(file);
                if (!Array.isArray(rules)) throw new Error(`Unexpected ruleset shape: rulesets/${sub}/${name}`);
                const patched = patchRuleset(rules);
                patched.forEach((rule, index) => { rule.id = index + 1; });
                await writeFile(file, '[\n' + patched.map(rule => JSON.stringify(rule)).join(',\n') + '\n]\n');
                (counts[name.slice(0, -5)] ??= {})[sub] = { before: rules.length, after: patched.length };
            }
        }
    } finally { console.log = log; }
    for (const entry of details) {
        const c = counts[entry.id] ?? {};
        const n = sub => c[sub]?.after ?? 0;
        Object.assign(entry.rules, { plain: n('main'), regex: n('regex'), total: n('main') + n('regex') });
        if (entry.rules.strictblock !== undefined || n('strictblock')) entry.rules.strictblock = n('strictblock');
    }
    await writeFile(detailsFile, JSON.stringify(details, null, 2) + '\n');
    const total = sub => Object.values(counts).reduce((sum, c) => sum + (c[sub]?.after ?? 0), 0);
    const totalBefore = sub => Object.values(counts).reduce((sum, c) => sum + (c[sub]?.before ?? 0), 0);
    return {
        upstreamPlatformCommit: '610c2431d', minSafari: safari.browser_specific_settings.safari.strict_min_version,
        excludedRulesets: [...excluded], removedFiles,
        rules: Object.fromEntries(DNR_DIRS.map(sub => [sub, { before: totalBefore(sub), after: total(sub) }])),
    };
}
