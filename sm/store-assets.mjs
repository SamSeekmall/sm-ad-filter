// Store listing assets: icons, promo tiles and 1280x800 screenshots in English and Chinese.
// Screenshots are taken from the real extension (build/sm-ad-filter) with the real engine; the frame and captions
// around them are drawn here. Run after `node sm/build.mjs`:  node sm/store-assets.mjs
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('build/qa/browsers');
const { chromium } = await import('../build/qa/node_modules/playwright/index.mjs');
const ext = path.resolve('build/sm-ad-filter'), out = path.resolve('store/assets');
await mkdir(out, { recursive: true });
const mark = (await readFile('sm/brand/mark.svg', 'utf8')).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const COPY = {
    en: {
        name: 'SM Clean View', tagline: 'Block ads and trackers. Pause any site in one tap.', base: 'Based on uBlock Origin Lite',
        shots: [
            ['Blocks ads and trackers', 'See at a glance that a site is protected, and switch how strict it is with one tap.'],
            ['Page broken? Fix it in the popup', 'Pause the site, check the page, then lower one level or report it.'],
            ['Every site under control', 'Find any site, set its filtering mode, or pause it for 10 minutes, an hour or the session.'],
            ['Simple switches', 'Chinese-site rules, fewer annoyances, and automatic cookie-banner rejection.'],
            ['Every change can be undone', 'The last 10 setting changes are kept, and a failed import rolls back by itself.'],
        ],
    },
    zh: {
        name: 'SM 净览', tagline: '拦截广告与跟踪，一键暂停任何网站。', base: '基于 uBlock Origin Lite',
        shots: [
            ['拦截广告与跟踪', '一眼看清网站是否受保护，点一下切换过滤强度。'],
            ['网页出问题？弹窗里就能排查', '暂停网站、看一眼网页，再降一档或直接反馈。'],
            ['每个网站都能单独设置', '查找任意网站，设置过滤模式，或暂停 10 分钟、1 小时、到关闭浏览器。'],
            ['常用规则一键开关', '中文网站规则、减少骚扰、自动拒绝 Cookie 弹窗。'],
            ['每次修改都能撤销', '保留最近 10 次设置修改，导入失败会自动回退。'],
        ],
    },
};
const fixtureHtml = `<!doctype html><meta charset="utf-8"><title>Daily News</title><style>body{margin:0;font:16px/1.6 Georgia,serif;color:#222;background:#fafafa}header{background:#1d2b36;color:#fff;padding:18px 40px;font:700 24px system-ui}main{max-width:760px;margin:30px auto;padding:0 20px}h1{font-size:32px;line-height:1.25}p{color:#444}</style><header>Daily News</header><main><h1>City opens new riverside park after three years of work</h1><p>The park stretches along two kilometres of the old harbour and includes cycle paths, a play area and a small open-air stage.</p><p>Residents gathered on Saturday morning for the opening, which included music from local schools.</p></main>`;
const server = createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(fixtureHtml); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// ---- capture real UI ---------------------------------------------------------------------------------------------
async function captureUi(lang) {
    const context = await chromium.launchPersistentContext(path.join(tmpdir(), `sm-store-${lang}-${crypto.randomUUID()}`), {
        channel: 'chromium', headless: true, viewport: { width: 1160, height: 760 }, deviceScaleFactor: 2,
        args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--host-resolver-rules=MAP *.example.com 127.0.0.1', '--no-proxy-server', `--lang=${lang === 'zh' ? 'zh-CN' : 'en-US'}`, '--force-device-scale-factor=2'],
    });
    const shots = {};
    try {
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const id = new URL(worker.url()).host;
        const page = await context.newPage();
        await page.goto(`chrome-extension://${id}/welcome.html`);
        await page.waitForFunction(() => /默认：|Default:/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 60000 });
        await page.evaluate(() => localStorage.setItem('sm.startDismissed', '1'));
        const sm = (what, args = {}) => page.evaluate(async r => { const a = await chrome.runtime.sendMessage(r); if (!a?.ok) throw new Error(a?.error); return a.data; }, { what, ...args });
        // A few real changes so the history page is not empty.
        await sm('sm:preset', { preset: 'chinese' }).catch(() => {});
        await sm('sm:setMode', { hostname: 'shop.example.com', level: 3 });
        await sm('sm:setMode', { hostname: 'video.example.com', level: 1 });
        await sm('sm:setMode', { hostname: 'bank.example.com', level: 0 });
        await sm('sm:pause', { hostname: 'forum.example.com', duration: '1h' });
        // Popup on a real page, opened as the toolbar popup.
        const site = await context.newPage();
        await site.goto(`http://news.example.com:${port}/`);
        const cdp = await context.browser().newBrowserCDPSession();
        async function popupShot(prepare) {
            await site.bringToFront();
            await page.evaluate(() => chrome.action.openPopup());
            let target;
            for (let i = 0; i < 60 && !target; i++) { target = (await cdp.send('Target.getTargets')).targetInfos.find(t => t.url.endsWith('/sm/popup.html')); if (!target) await sleep(100); }
            if (!target) throw new Error('popup did not open');
            // Playwright's CDP session has no flat child sessions: talk to the popup through Target messages.
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
            let seq = 0; const pending = new Map();
            const listener = e => { if (e.sessionId !== sessionId) return; const r = JSON.parse(e.message), p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(new Error(r.error.message)) : p.resolve(r.result); } };
            cdp.on('Target.receivedMessageFromTarget', listener);
            const call = (method, params = {}) => new Promise((resolve, reject) => { const n = ++seq; pending.set(n, { resolve, reject }); cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: n, method, params }) }).catch(reject); });
            const evalIn = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
            for (let i = 0; i < 150; i++) { if (await evalIn("document.documentElement.dataset.ready==='true'")) break; await sleep(100); }
            if (prepare) await prepare(evalIn);
            await sleep(400);
            // A headless popup window can be shorter than its content: capture the whole document, not the window.
            const size = await evalIn('JSON.stringify({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight})');
            const { w, h } = JSON.parse(size);
            const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
            cdp.off('Target.receivedMessageFromTarget', listener);
            await cdp.send('Target.closeTarget', { targetId: target.targetId }).catch(() => {});
            await sleep(300);
            return Buffer.from(data, 'base64');
        }
        shots.popup = await popupShot();
        shots.check = await popupShot(async evalIn => {
            await evalIn("document.querySelector('#pause').click()");
            for (let i = 0; i < 150; i++) { if (await evalIn("!document.querySelector('#check').hidden && !document.querySelector('#pause').disabled")) break; await sleep(100); }
        });
        await sm('sm:resume', { hostname: 'news.example.com' });
        await page.bringToFront();
        // Control center pages.
        await page.goto(`chrome-extension://${id}/welcome.html?site=shop.example.com`);
        await page.locator('#siteStatus').filter({ hasText: 'shop.example.com' }).waitFor({ timeout: 60000 });
        await sleep(500);
        await page.evaluate(() => scrollTo(0, 0));
        shots.site = await page.screenshot();
        for (const [name, hash] of [['rules', 'rules'], ['history', 'migration']]) {
            await page.goto(`chrome-extension://${id}/welcome.html#${hash}`);
            await page.waitForFunction(() => /默认：|Default:/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 60000 });
            await sleep(700);
            await page.evaluate(() => scrollTo(0, 0));
            shots[name] = await page.screenshot();
        }
    } finally { await context.close(); }
    return shots;
}

// ---- compose -----------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const css = `*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif}`;
const dataUrl = png => `data:image/png;base64,${png.toString('base64')}`;
async function render(file, width, height, html, transparent = false) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}html,body{width:${width}px;height:${height}px;overflow:hidden${transparent ? ';background:transparent' : ''}}</style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, file), omitBackground: transparent });
    await page.close();
    console.log('wrote', file);
}
// Icons: store icon 128 with 96 px artwork (Chrome guideline), Edge logo 300 px.
await render('icon-128.png', 128, 128, `<div style="padding:16px">${mark.replace('<svg ', '<svg width="96" height="96" ')}</div>`, true);
await render('logo-300.png', 300, 300, `<div style="padding:18px">${mark.replace('<svg ', '<svg width="264" height="264" ')}</div>`, true);
const GREEN = '#14715c', DEEP = '#0e5e4d', SOFT = '#e7f2ee';
for (const lang of ['en', 'zh']) {
    const c = COPY[lang];
    const tile = (w, h, big) => `<div style="width:${w}px;height:${h}px;background:${GREEN};color:#fff;display:flex;align-items:center;gap:${big ? 48 : 22}px;padding:0 ${big ? 110 : 34}px">${mark.replace('<svg ', `<svg width="${big ? 200 : 96}" height="${big ? 200 : 96}" style="flex:none;filter:drop-shadow(0 0 0 #fff)" `).replace('fill="#14715c"', 'fill="#ffffff"').replace('stroke="#fff"', `stroke="${GREEN}"`)}<div><div style="font-size:${big ? 76 : 34}px;font-weight:700;line-height:1.1">${c.name}</div><div style="font-size:${big ? 34 : 17}px;line-height:1.35;margin-top:${big ? 18 : 10}px;opacity:.95">${c.tagline}</div><div style="font-size:${big ? 22 : 12}px;margin-top:${big ? 22 : 10}px;opacity:.75">${c.base}</div></div></div>`;
    await render(`promo-small-440x280-${lang}.png`, 440, 280, tile(440, 280, false));
    await render(`promo-marquee-1400x560-${lang}.png`, 1400, 560, tile(1400, 560, true));
}
for (const lang of ['en', 'zh']) {
    const c = COPY[lang], ui = await captureUi(lang);
    const caption = ([title, text]) => `<div style="padding:52px 64px 0"><div style="font-size:40px;font-weight:700;color:${DEEP};line-height:1.2">${title}</div><div style="font-size:21px;color:#3d5249;margin-top:12px;line-height:1.45;max-width:1000px">${text}</div></div>`;
    const frame = (img, w) => `<img src="${dataUrl(img)}" style="width:${w}px;display:block;border-radius:14px;box-shadow:0 18px 50px rgba(14,60,48,.22),0 2px 6px rgba(14,60,48,.12)">`;
    const stage = inner => `<div style="width:1280px;height:800px;background:${SOFT};position:relative;overflow:hidden">${inner}</div>`;
    const popupScene = (img, i) => stage(caption(c.shots[i]) + `<div style="position:absolute;left:64px;right:64px;top:250px;bottom:0;display:flex;gap:40px;align-items:flex-start;justify-content:center"><div style="flex:1;max-width:620px;height:600px;background:#fff;border-radius:14px 14px 0 0;box-shadow:0 18px 50px rgba(14,60,48,.16);overflow:hidden"><div style="background:#1d2b36;color:#fff;padding:16px 28px;font:700 20px system-ui">Daily News</div><div style="padding:24px 28px;font:15px/1.6 Georgia,serif;color:#444"><div style="font-size:24px;line-height:1.3;color:#222;margin-bottom:12px">City opens new riverside park after three years of work</div>The park stretches along two kilometres of the old harbour and includes cycle paths, a play area and a small open-air stage.</div></div>${frame(img, 360)}</div>`);
    const pageScene = (img, i) => stage(caption(c.shots[i]) + `<div style="position:absolute;left:110px;right:110px;top:236px">${frame(img, 1060)}</div>`);
    await render(`screenshot-1-${lang}.png`, 1280, 800, popupScene(ui.popup, 0));
    await render(`screenshot-2-${lang}.png`, 1280, 800, popupScene(ui.check, 1));
    await render(`screenshot-3-${lang}.png`, 1280, 800, pageScene(ui.site, 2));
    await render(`screenshot-4-${lang}.png`, 1280, 800, pageScene(ui.rules, 3));
    await render(`screenshot-5-${lang}.png`, 1280, 800, pageScene(ui.history, 4));
}
await browser.close();
await new Promise(r => server.close(r));
await writeFile(path.join(out, 'ASSETS.json'), JSON.stringify({ generatedFrom: JSON.parse(await readFile(path.join(ext, 'SM-BUILD.json'), 'utf8')).localCommit, generatedAt: new Date().toISOString() }, null, 2) + '\n');
