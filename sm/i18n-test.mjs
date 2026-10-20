// English interface check: under an English browser every page the user can open must be free of Chinese text,
// and a manual choice of Chinese must still give the Chinese interface. Run after `node sm/build.mjs`.
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('build/qa/browsers');
const { chromium } = await import('../build/qa/node_modules/playwright/index.mjs');
const ext = path.resolve('build/sm-ad-filter'), out = path.resolve('build/qa-i18n');
await mkdir(out, { recursive: true });
const CJK = /[　-〿一-鿿＀-￯]/;
// Chinese that is meant to stay: the language box offers each language in its own name.
const ALLOWED = ['语言 / Language', '跟随浏览器 / Auto', '中文'];
const findings = [];
const context = await chromium.launchPersistentContext(path.join(tmpdir(), `sm-i18n-${crypto.randomUUID()}`), { channel: 'chromium', headless: true, viewport: { width: 1100, height: 900 }, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--lang=en-US'] });
try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    async function scan(page, label) {
        const found = await page.evaluate(({ allowed }) => {
            const cjk = /[　-〿一-鿿＀-￯]/, hits = [];
            const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (n.nodeType === 3) { const p = n.parentNode.nodeName; if (p !== 'SCRIPT' && p !== 'STYLE' && cjk.test(n.data) && !allowed.includes(n.data.trim())) hits.push(n.data.trim().slice(0, 80)); }
                else for (const a of ['placeholder', 'aria-label', 'title', 'alt']) { const v = n.getAttribute(a); if (v && cjk.test(v) && !allowed.includes(v)) hits.push(`[${a}] ${v.slice(0, 80)}`); }
            }
            for (const el of document.querySelectorAll('textarea, input')) if (cjk.test(el.value || '') && !allowed.includes(el.value)) hits.push(`[value] ${el.value.slice(0, 80)}`);
            return hits;
        }, { allowed: ALLOWED });
        for (const text of found) findings.push(`${label}: ${text}`);
    }
    async function popupWith(label, data, extra) {
        const page = await context.newPage();
        await page.addInitScript(d => { const orig = chrome.runtime.sendMessage.bind(chrome.runtime); chrome.runtime.sendMessage = m => m.what === 'sm:popupStatus' ? Promise.resolve({ ok: true, data: d }) : orig(m); }, data);
        await page.goto(`chrome-extension://${id}/sm/popup.html`);
        await page.waitForFunction(() => document.documentElement.dataset.ready === 'true' || document.querySelector('#state')?.dataset.kind === 'unavailable', null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(500);
        if (extra) await extra(page);
        await scan(page, `popup ${label}`);
        await page.screenshot({ path: path.join(out, `popup-${label}.png`), fullPage: true });
        await page.close();
    }
    const live = { hostname: 'example.com', level: 2, pauses: {}, hasAccess: true, tabId: 1 };
    await popupWith('active', live);
    await popupWith('paused', { ...live, level: 0, pauses: { 'example.com': { until: Date.now() + 9 * 60000, level: 3 } } });
    await popupWith('paused-session', { ...live, level: 0, pauses: { 'example.com': { until: null, level: 2 } } });
    await popupWith('off', { ...live, level: 0 });
    await popupWith('no-access', { ...live, hasAccess: false });
    await popupWith('internal-page', { hostname: '', level: 0, pauses: {}, hasAccess: false });
    await popupWith('troubleshooting', { ...live, level: 0, pauses: { 'example.com': { until: Date.now() + 9 * 60000, level: 2 } } });
    // Real engine: starting message, then the control center.
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/welcome.html?site=localhost`);
    await page.locator('#status').filter({ hasText: 'Default:' }).waitFor({ timeout: 60000 });
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    assert.equal(await page.title(), 'SM Clean View · Current site');
    await page.locator('#siteStatus').filter({ hasText: 'localhost' }).waitFor();
    await page.locator('#wizard summary').click();
    await scan(page, 'control center: current site');
    await page.screenshot({ path: path.join(out, 'cc-site.png'), fullPage: true });
    await page.locator('#modeSeg button[data-level="1"]').click();
    await page.locator('#modeSeg button[data-level="1"][aria-checked="true"]').waitFor();
    await page.locator('#pause10').click();
    await page.locator('#resume').waitFor({ state: 'visible' });
    await scan(page, 'control center: paused site');
    await page.locator('#resume').click(); await page.locator('#pause10').waitFor({ state: 'visible' });
    for (const hash of ['rules', 'migration', 'feedback', 'about']) {
        await page.goto(`chrome-extension://${id}/welcome.html#${hash}`);
        await page.locator('#status').filter({ hasText: 'Default:' }).waitFor({ state: 'attached', timeout: 60000 });
        await page.waitForTimeout(500);
        if (hash === 'feedback') { await page.locator('#generateReport').click(); await page.locator('#report').waitFor(); await page.waitForTimeout(400); }
        if (hash === 'about') { await page.locator('#probeFiles').click(); await page.locator('#probeResult').filter({ hasText: 'First read' }).waitFor({ timeout: 30000 }); }
        await scan(page, `control center: ${hash}`);
        await page.screenshot({ path: path.join(out, `cc-${hash}.png`), fullPage: true });
    }
    assert.match(await page.locator('#report').inputValue(), /SM Clean View issue report/);
    // Manual choice: Chinese interface under an English browser, and back to automatic.
    await page.goto(`chrome-extension://${id}/welcome.html`);
    await page.locator('#langSelect').selectOption('zh');
    await page.locator('#status').filter({ hasText: '默认：' }).waitFor({ timeout: 60000 });
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-CN');
    await page.locator('#langSelect').selectOption('auto');
    await page.locator('#status').filter({ hasText: 'Default:' }).waitFor({ timeout: 60000 });
    await page.close();
} finally {
    await context.close();
}
await writeFile(path.join(out, 'i18n-test.json'), JSON.stringify({ status: findings.length ? 'FAIL' : 'PASS', findings }, null, 2));
if (findings.length) { console.error('Untranslated text:\n' + [...new Set(findings)].join('\n')); process.exit(1); }
console.log(JSON.stringify({ status: 'PASS', out }));
