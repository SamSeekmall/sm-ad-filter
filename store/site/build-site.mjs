// GitHub Pages site (gh-pages branch): bilingual homepage and the privacy policy, built from the repository files.
//   node store/site/build-site.mjs <output-dir>
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve(process.argv[2] || 'build/site');
const release = JSON.parse(await readFile('sm/release.json', 'utf8'));
const mark = (await readFile('sm/brand/mark.svg', 'utf8')).trim();
await mkdir(path.join(out, 'img'), { recursive: true });
for (const name of ['icon-128.png', 'screenshot-1-en.png', 'screenshot-2-en.png', 'screenshot-3-en.png', 'screenshot-4-en.png', 'screenshot-5-en.png', 'screenshot-1-zh.png', 'screenshot-2-zh.png', 'screenshot-3-zh.png', 'screenshot-4-zh.png', 'screenshot-5-zh.png']) await copyFile(path.join('store/assets', name), path.join(out, 'img', name));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const contactHtml = /^https?:/.test(release.supportContact) ? `<a href="${release.supportContact}">${esc(release.supportContact.replace(/^https:\/\//, ''))}</a>` : /@/.test(release.supportContact) ? `<a href="mailto:${release.supportContact}">${esc(release.supportContact)}</a>` : esc(release.supportContact);
// Minimal Markdown for PRIVACY-SM.md: headings, paragraphs, bullet lists, bold, inline code, links, rules.
function markdown(md) {
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    const html = []; let list = false;
    for (const line of md.split(/\r?\n/)) {
        if (/^- /.test(line)) { if (!list) { html.push('<ul>'); list = true; } html.push(`<li>${inline(line.slice(2))}</li>`); continue; }
        if (list) { html.push('</ul>'); list = false; }
        const h = /^(#{1,3}) (.*)$/.exec(line);
        if (h) { const id = h[2] === '中文' ? 'zh' : h[2] === 'English' ? 'en' : ''; html.push(`<h${h[1].length}${id ? ` id="${id}"` : ''}>${inline(h[2])}</h${h[1].length}>`); }
        else if (line === '---') html.push('<hr>');
        else if (line.trim()) html.push(`<p>${inline(line)}</p>`);
    }
    if (list) html.push('</ul>');
    return html.join('\n');
}
const policyMd = (await readFile('PRIVACY-SM.md', 'utf8')).replaceAll('**{{SUPPORT_CONTACT}}**', '{{CONTACT}}').replaceAll('{{SUPPORT_CONTACT}}', '{{CONTACT}}').replaceAll('{{SOURCE_URL}}', `[${release.source}](${release.source})`).replace('[中文](#中文)', '[中文](#zh)');
const policyHtml = markdown(policyMd).replaceAll('{{CONTACT}}', contactHtml);
const css = `:root{--g:#14715c;--gd:#0e5e4d;--soft:#e7f2ee;--ink:#132520;--muted:#56685f;--line:#d5e1dc;--bg:#f5f8f7;--card:#fff}
@media(prefers-color-scheme:dark){:root{--g:#3fae8c;--gd:#6ec7a8;--soft:#18322a;--ink:#e6f0ec;--muted:#9bb0a7;--line:#2b3d37;--bg:#0f1a17;--card:#16231f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 "Segoe UI","Microsoft YaHei UI","PingFang SC",system-ui,sans-serif}
a{color:var(--g)}header.top{display:flex;align-items:center;gap:12px;max-width:1040px;margin:0 auto;padding:18px 20px}header.top svg{width:36px;height:36px}header.top strong{font-size:19px}
header.top nav{margin-left:auto;display:flex;gap:16px;font-size:15px}main{max-width:1040px;margin:0 auto;padding:0 20px 60px}
.hero{padding:36px 0 28px}.hero h1{font-size:40px;line-height:1.2;margin:0 0 12px;color:var(--gd)}.hero p{font-size:19px;color:var(--muted);margin:0 0 22px;max-width:44em}
.btn{display:inline-block;padding:10px 18px;border-radius:10px;background:var(--g);color:#fff;text-decoration:none;font-weight:600;margin:0 10px 10px 0}.btn.alt{background:var(--card);color:var(--g);border:1px solid var(--line)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:10px 0 30px}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px}.card h3{margin:0 0 6px;font-size:17px}.card p{margin:0;color:var(--muted);font-size:15px}
.shots{display:grid;gap:18px;margin:10px 0 30px}.shots img{width:100%;border-radius:12px;border:1px solid var(--line)}h2{font-size:26px;margin:36px 0 12px}
.note{color:var(--muted);font-size:14px}footer{max-width:1040px;margin:0 auto;padding:24px 20px 40px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
article.policy{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px 28px;margin-top:20px}article.policy h1{font-size:28px;margin-top:0}code{background:var(--soft);padding:1px 5px;border-radius:5px;font-size:.92em}
@media(max-width:640px){.hero h1{font-size:30px}header.top nav{gap:10px;font-size:14px}article.policy{padding:18px}}`;
const head = (title, desc) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${desc}"><link rel="icon" href="img/icon-128.png"><style>${css}</style></head><body>
<header class="top">${mark}<strong>SM Clean View · SM 净览</strong><nav><a href="./#en">English</a><a href="./#zh">中文</a><a href="privacy.html">Privacy · 隐私</a><a href="${release.source}">GitHub</a></nav></header>`;
const foot = `<footer>SM Clean View / SM 净览 is an independent modified version of <a href="https://github.com/uBlockOrigin/uBOL-home">uBlock Origin Lite</a> by Raymond Hill and contributors, released under GPL-3.0. It is not an official uBlock Origin product. · 本扩展是 uBlock Origin Lite 的独立修改版，不是 uBlock Origin 官方产品。 · Support / 支持：${contactHtml} · Source / 源码：<a href="${release.source}">${esc(release.source.replace(/^https:\/\//, ''))}</a></footer></body></html>`;
const features = {
    en: [['Blocks ads and trackers', 'The uBlock Origin Lite engine with EasyList, EasyPrivacy, uBlock filters and malware lists. The browser does the filtering, so it stays light.'],
        ['One-tap site controls', 'Off, Light, Standard or Strong per site. Pause a site for 10 minutes, an hour or until the browser closes.'],
        ['Fix broken pages step by step', 'Pause, check the page, lower one level for that site only, or create a feedback report.'],
        ['Everything can be undone', 'The last 10 setting changes are kept. Imports are previewed and roll back on failure.'],
        ['Fewer annoyances', 'Optional rules for overlays, notification prompts and social widgets, and automatic "Reject all" on OneTrust and Cookiebot banners.'],
        ['Collects nothing', 'No analytics, no telemetry, no SeekMall servers. Settings stay in your browser.']],
    zh: [['拦截广告与跟踪', '使用 uBlock Origin Lite 引擎和 EasyList、EasyPrivacy、uBlock 规则及恶意网站列表，由浏览器完成过滤，占用很少。'],
        ['网站一键控制', '每个网站可选不过滤、轻度、标准、强力；可暂停 10 分钟、1 小时或到关闭浏览器。'],
        ['分步修复异常网页', '暂停、查看网页、只把这个网站降一档，或生成反馈报告。'],
        ['每次修改都能撤销', '保留最近 10 次设置修改；导入先预览，失败自动回退。'],
        ['减少骚扰', '可选过滤浮层、通知请求和社交挂件，可自动点击 OneTrust、Cookiebot 弹窗的"拒绝全部"。'],
        ['不收集任何信息', '没有统计、没有遥测、没有 SeekMall 服务器，设置只保存在你的浏览器里。']],
};
const section = (lang, h1, lead, featuresTitle, shotsTitle, installTitle, install) => `<section id="${lang}" lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><div class="hero"><h1>${h1}</h1><p>${lead}</p>
<a class="btn" href="${release.source}/releases">${lang === 'zh' ? '下载最新版本' : 'Download the latest release'}</a><a class="btn alt" href="privacy.html${lang === 'zh' ? '#zh' : '#en'}">${lang === 'zh' ? '隐私政策' : 'Privacy policy'}</a></div>
<h2>${featuresTitle}</h2><div class="grid">${features[lang].map(([t, d]) => `<div class="card"><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
<h2>${shotsTitle}</h2><div class="shots">${[1, 2, 3, 4, 5].map(i => `<img loading="lazy" src="img/screenshot-${i}-${lang}.png" alt="">`).join('')}</div>
<h2>${installTitle}</h2>${install}</section>`;
const index = head('SM Clean View · SM 净览', 'Block ads and trackers, pause any site in one tap, and undo any setting change. Based on uBlock Origin Lite.') + `<main>
${section('en', 'Block ads and trackers. Pause any site in one tap.', 'SM Clean View is a light ad and tracker blocker for Chrome and Edge, based on uBlock Origin Lite, with simple controls for when a page needs a hand.', 'Features', 'Screenshots', 'Install',
    `<p>Store listings for Chrome and Edge are being prepared. Until then: download the latest <code>sm-ad-filter-…-chromium.zip</code> from <a href="${release.source}/releases">Releases</a>, unzip it to a folder that is not synced (not OneDrive), open <code>chrome://extensions</code> or <code>edge://extensions</code>, turn on Developer mode, and choose "Load unpacked".</p><p class="note">Browser pages and extension stores can't be filtered by any extension. Some video sites deliver ads inside the video stream; those can't always be removed.</p>`)}
${section('zh', '拦截广告与跟踪，一键暂停任何网站。', 'SM 净览是基于 uBlock Origin Lite 的轻量广告与跟踪拦截扩展，支持 Chrome 和 Edge，并在网页需要帮忙时给你简单直接的控制。', '功能', '截图', '安装',
    `<p>Chrome 和 Edge 商店版本正在准备中。在此之前：从 <a href="${release.source}/releases">Releases</a> 下载最新的 <code>sm-ad-filter-…-chromium.zip</code>，解压到不同步的本地文件夹（不要放在 OneDrive），打开 <code>chrome://extensions</code> 或 <code>edge://extensions</code>，开启"开发者模式"，点"加载已解压的扩展程序"。</p><p class="note">浏览器内部页面和扩展商店，任何扩展都无法过滤。部分视频网站把广告和视频一起播放，这类广告不一定能去掉。</p>`)}
</main>` + foot;
const privacy = head('Privacy policy · 隐私政策 · SM Clean View', 'SM Clean View collects nothing. Privacy policy in Chinese and English.') + `<main><article class="policy">${policyHtml}</article></main>` + foot;
if (/\{\{/.test(index + privacy)) throw new Error('unfilled placeholder');
await writeFile(path.join(out, 'index.html'), index);
await writeFile(path.join(out, 'privacy.html'), privacy);
await writeFile(path.join(out, '.nojekyll'), '');
console.log('site written to', out);
