// Package the pinned, already compiled upstream Chromium extension plus SM UI.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'build', 'sm-ad-filter');
await mkdir(out, { recursive: true });
await cp(path.join(root, 'chromium'), out, { recursive: true });
await mkdir(path.join(out, 'sm'), { recursive: true });
for (const name of ['welcome.css', 'welcome.js']) await cp(path.join(root, 'sm', name), path.join(out, 'sm', name));
await cp(path.join(root, 'sm', 'welcome.html'), path.join(out, 'welcome.html'));
const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
const upstreamVersion = manifest.version;
manifest.name = 'SM 净览';
manifest.short_name = 'SM 净览';
manifest.description = '基于 uBlock Origin Lite 的独立修改版：广告过滤、跟踪防护、站点例外与中文使用指南。';
manifest.version_name = `SM 0.1.0 / uBOL ${upstreamVersion}`;
// Keep the engine version: upstream migration logic compares this value.
manifest.options_page = 'welcome.html';
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
let popup = await readFile(path.join(out, 'popup.html'), 'utf8');
popup = popup.replace('</main>', '<p style="text-align:center;font-size:13px"><a href="welcome.html" target="_blank" rel="noopener">SM 净览 · 中文指南</a></p>\n</main>');
await writeFile(path.join(out, 'popup.html'), popup);
let localCommit = 'source-archive; see distribution filename and release receipt';
try { localCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Archive builds do not require Git. */ }
const info = { product: 'SM 净览', version: '0.1.0', upstream: 'https://github.com/uBlockOrigin/uBOL-home', upstreamCommit: '009467dd2299791ebb2267b2cc99c1114a4b00f4', upstreamVersion, localCommit, license: 'GPL-3.0', modifications: ['Chinese onboarding and live status', 'Chinese rules opt-in with read-back', 'Independent manifest branding and popup guide link'] };
await writeFile(path.join(out, 'SM-BUILD.json'), JSON.stringify(info, null, 2) + '\n');
await cp(path.join(root, 'README-SM.md'), path.join(out, 'README-SM.md'));
await cp(path.join(root, 'QA-SM.md'), path.join(out, 'QA-SM.md'));
console.log(out);
