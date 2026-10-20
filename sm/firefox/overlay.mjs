// Firefox / Firefox for Android overlay for the pinned upstream engine. GPL-3.0-or-later.
// Not a second engine: the compiled rulesets and scripts are the same pinned chromium/ files. Only what upstream
// itself differs on for Firefox is applied (upstream gorhill/uBlock 610c2431d, platform/mv3/firefox/):
//   manifest.json      event-page background, gecko settings, no offscreen/userScripts permissions
//   ext-offscreen.js   offscreen document emulated with an iframe (Firefox has no offscreen API)
//   patch-ruleset.js   drops rules Firefox cannot evaluate (topDomains, responseHeaders, requestHeaders)
import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FIREFOX_ID = 'sm-ad-filter@seekmall.ph';
const DNR_DIRS = ['main', 'regex', 'strictblock'];
const SUPPORT = { main: 'plain', regex: 'regex' };

export async function applyFirefoxOverlay({ root, out }) {
    const dir = path.join(root, 'sm/firefox');
    const read = async file => JSON.parse(await readFile(file, 'utf8'));
    const base = await read(path.join(out, 'manifest.json'));
    const ff = await read(path.join(dir, 'manifest.json'));
    ff.declarative_net_request = base.declarative_net_request;
    ff.version = base.version;
    // Same resource list as the Chromium package; dynamic URLs are a Chromium-only manifest key.
    ff.web_accessible_resources = base.web_accessible_resources.map(({ use_dynamic_url, ...entry }) => entry);
    ff.browser_specific_settings.gecko.id = FIREFOX_ID;
    for (const key of ['offscreen', 'userScripts']) if (ff.permissions.includes(key)) throw new Error(`Firefox manifest unexpectedly requires ${key}`);
    await writeFile(path.join(out, 'manifest.json'), JSON.stringify(ff, null, 2) + '\n');
    await cp(path.join(dir, 'ext-offscreen.js'), path.join(out, 'js/ext-offscreen.js'));

    const { patchRuleset } = await import(pathToFileURL(path.join(dir, 'patch-ruleset.js')).href);
    const detailsFile = path.join(out, 'rulesets/ruleset-details.json');
    const details = await read(detailsFile);
    const removed = {};
    for (const sub of DNR_DIRS) {
        const folder = path.join(out, 'rulesets', sub);
        for (const name of await readdir(folder)) {
            if (!name.endsWith('.json')) continue;
            const file = path.join(folder, name);
            const rules = await read(file);
            if (!Array.isArray(rules)) throw new Error(`Unexpected ruleset shape: rulesets/${sub}/${name}`);
            const kept = patchRuleset(rules);
            const dropped = rules.length - kept.length;
            if (!dropped) continue;
            await writeFile(file, '[\n' + kept.map(rule => JSON.stringify(rule)).join(',\n') + '\n]\n');
            const entry = details.find(item => item.id === name.slice(0, -5));
            if (!entry) throw new Error(`No ruleset details for ${sub}/${name}`);
            if (SUPPORT[sub]) { entry.rules[SUPPORT[sub]] -= dropped; entry.rules.total -= dropped; }
            else entry.rules.strictblock -= dropped;
            removed[`${sub}/${name}`] = dropped;
        }
    }
    await writeFile(detailsFile, JSON.stringify(details, null, 2) + '\n');
    return { upstreamPlatformCommit: '610c2431d', geckoId: FIREFOX_ID, minFirefox: ff.browser_specific_settings.gecko.strict_min_version, rulesDropped: removed };
}
