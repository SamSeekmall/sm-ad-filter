// Uses an isolated Chromium profile and local HTTP fixtures only.
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, 'build/qa/browsers');
const { chromium } = await import('../build/qa/node_modules/playwright/index.mjs');
let adRequests = 0;
const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url.startsWith('/ad.js')) { adRequests++; res.end('fixture'); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Local filter test</title><h1>Content remains readable</h1>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
let context;
try {
    context = await chromium.launchPersistentContext(path.join(root, `build/qa/profile-${Date.now()}`), {
        channel: 'chromium', headless: true,
        args: [`--disable-extensions-except=${path.join(root, 'build/sm-ad-filter')}`, `--load-extension=${path.join(root, 'build/sm-ad-filter')}`, '--host-resolver-rules=MAP doubleclick.net 127.0.0.1', '--no-proxy-server'],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${id}/welcome.html`);
    await page.locator('#status').filter({ hasText: '默认模式' }).waitFor({ timeout: 30000 });
    const before = await page.evaluate(() => chrome.runtime.sendMessage({ what: 'getOptionsPageData' }));
    if (!before.enabledRulesets.includes('chn-0')) await page.locator('#enable').click();
    await page.locator('#status').filter({ hasText: '中文规则已开启' }).waitFor();
    const after = await page.evaluate(() => chrome.runtime.sendMessage({ what: 'getOptionsPageData' }));
    assert.ok(before.enabledRulesets.every(id => after.enabledRulesets.includes(id)));
    await page.screenshot({ path: path.join(root, 'build/welcome.png'), fullPage: true });
    const fixture = await context.newPage();
    await fixture.goto(`http://localhost:${port}`);
    const request = () => fixture.evaluate(async url => {
        try { const response = await fetch(url); return { text: await response.text(), url: response.url }; } catch { return { blocked: true }; }
    }, `http://doubleclick.net:${port}/ad.js?t=${Date.now()}`);
    const blocked = await request();
    assert.ok(blocked.blocked || blocked.url.startsWith(`chrome-extension://${id}/`), JSON.stringify(blocked));
    assert.equal(adRequests, 0);
    await page.evaluate(() => chrome.runtime.sendMessage({ what: 'setFilteringMode', hostname: 'localhost', level: 0 }));
    await fixture.reload();
    assert.equal((await request()).text, 'fixture');
    assert.equal(adRequests, 1);
    await page.evaluate(() => chrome.runtime.sendMessage({ what: 'setFilteringMode', hostname: 'localhost', level: 2 }));
    await fixture.reload();
    const restored = await request();
    assert.ok(restored.blocked || restored.url.startsWith(`chrome-extension://${id}/`), JSON.stringify(restored));
    assert.equal(adRequests, 1);
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.getByText('SM 净览 · 中文指南').waitFor();
    assert.deepEqual(errors, []);
    const result = { status: 'PASS', browser: context.browser().version(), extensionLoaded: true, chineseRulesReadBack: true, existingRulesPreserved: true, adRequestBlocked: true, siteExceptionAllowed: true, protectionRestored: true, pageErrors: errors, publicWebsites: 'NOT_TESTED', installedUserChromeEdge: 'NOT_TESTED' };
    await writeFile(path.join(root, 'build/browser-test.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
} finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
}
