// Deterministic overlay on pinned upstream. GPL-3.0-or-later.
// Builds into a fresh staging directory, verifies it, and only then replaces build/sm-ad-filter,
// so a failed build never leaves a mixed or half-written package behind.
import { cp, mkdir, readFile, writeFile, readdir, rm, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const platform = args.has('--firefox') ? 'firefox' : args.has('--safari') ? 'safari' : 'chromium';
const finalOut = path.join(root, 'build', platform === 'chromium' ? 'sm-ad-filter' : `sm-ad-filter-${platform}`);
const out = path.join(root, 'build', `.staging-${process.pid}`);
const {build:bundle} = await import('./build-tools/node_modules/esbuild/lib/main.js');
const release = JSON.parse(await readFile(path.join(root,'sm/release.json'),'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const textual = /\.(js|mjs|json|html|css|md|txt|svg)$/i;
// CRLF checkouts must hash like LF ones; binaries are hashed as stored.
const fileDigest = async file => { const data = await readFile(file); return sha(textual.test(file) ? Buffer.from(data.toString('utf8').replaceAll('\r\n','\n')) : data); };
async function walkFiles(dir, base = dir) {
    const found = [];
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : 1)) {
        const file = path.join(dir, item.name);
        if (item.isDirectory()) found.push(...await walkFiles(file, base));
        else found.push(path.relative(base, file).split(path.sep).join('/'));
    }
    return found;
}
async function treeDigest(dir) {
    const lines = [];
    for (const rel of await walkFiles(dir)) lines.push(`${rel}\0${await fileDigest(path.join(dir, rel))}`);
    return { files: lines.length, treeSha256: sha(lines.join('\n')) };
}
// 1. The vendored upstream tree must be exactly the reviewed one. Edits to chromium/ belong in sm/build.mjs patches.
const lockPath = path.join(root, 'sm/upstream-lock.json');
const upstream = await treeDigest(path.join(root, 'chromium'));
if (args.has('--update-lock')) {
    await writeFile(lockPath, JSON.stringify({ upstreamCommit: release.upstreamCommit, engineVersion: release.engineVersion, ...upstream }, null, 2) + '\n');
    console.log('upstream lock updated', upstream);
}
const lock = JSON.parse(await readFile(lockPath, 'utf8'));
if (lock.upstreamCommit !== release.upstreamCommit || lock.engineVersion !== release.engineVersion || lock.treeSha256 !== upstream.treeSha256 || lock.files !== upstream.files) {
    throw new Error(`Upstream tree differs from sm/upstream-lock.json (expected ${lock.files} files ${lock.treeSha256.slice(0,12)}, found ${upstream.files} files ${upstream.treeSha256.slice(0,12)}). Review the change, then run: node sm/build.mjs --update-lock`);
}
// 2. Toolchain: record what actually built the bundle; the release script can require the lockfile pin.
const esbuildVersion = JSON.parse(await readFile(path.join(root, 'sm/build-tools/node_modules/esbuild/package.json'), 'utf8')).version;
const pinnedEsbuild = JSON.parse(await readFile(path.join(root, 'sm/build-tools/package.json'), 'utf8')).dependencies.esbuild;
const toolchain = { esbuild: esbuildVersion, esbuildPinned: pinnedEsbuild, esbuildMatchesPin: esbuildVersion === pinnedEsbuild, node: process.version };
if (!toolchain.esbuildMatchesPin && process.env.SM_REQUIRE_PINNED_ESBUILD === '1') throw new Error(`esbuild ${esbuildVersion} does not match the lockfile pin ${pinnedEsbuild}`);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
try {
await cp(path.join(root,'chromium'),out,{recursive:true});
await mkdir(path.join(out,'sm'),{recursive:true});
const platformOverlay = platform === 'firefox' ? await (await import('./firefox/overlay.mjs')).applyFirefoxOverlay({ root, out }) : platform === 'safari' ? await (await import('./safari/overlay.mjs')).applySafariOverlay({ root, out }) : undefined;
for (const name of ['welcome.css','welcome.js','core.mjs','worker.mjs','updates.mjs','timing.mjs','ops.mjs','history.mjs','pauses.mjs','config.mjs','cookies.js','popup.html','popup.css','popup.js','brand.png','release.json','tokens.css','engine-progress.mjs']) await cp(path.join(root,'sm',name),path.join(out,'sm',name));
// Inline only local styles and official Tabler icon nodes: no blocking stylesheet/icon requests.
const iconNodes = JSON.parse(await readFile(path.join(root,'sm/icons/tabler.json'),'utf8'));
let popup = await readFile(path.join(root,'sm/popup.html'),'utf8');
const brandMark = (await readFile(path.join(root,'sm/brand/mark.svg'),'utf8')).trim();
popup = popup.replace('{{brand}}', brandMark.replace('<svg ','<svg class="brand" aria-hidden="true" focusable="false" '));
popup = popup.replace('<link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="popup.css">',`<style>${await readFile(path.join(root,'sm/tokens.css'),'utf8')}${await readFile(path.join(root,'sm/popup.css'),'utf8')}</style>`);
if (/\{\{brand\}\}|href="(tokens|popup)\.css"/.test(popup)) throw Error('popup inlining failed');
popup = popup.replace(/\{\{([a-z-]+)\}\}/g,(_,name)=>{
    if(!iconNodes[name])throw Error(`Missing icon ${name}`);
    const nodes=iconNodes[name].map(([tag,attrs])=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}/>`).join('');
    return `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${name.endsWith('-filled')?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${nodes}</svg>`;
});
await writeFile(path.join(out,'sm/popup.html'),popup);
await cp(path.join(root,'sm/icons/LICENSE.txt'),path.join(out,'sm/TABLER-LICENSE.txt'));
await cp(path.join(root,'sm/welcome.html'),path.join(out,'welcome.html'));
// SM brand everywhere the browser shows the extension: toolbar (on/off), extension page, upstream page logos.
for (const name of await readdir(path.join(root,'sm/brand'))) if (/^icon_\d+(_off)?\.png$/.test(name)) await cp(path.join(root,'sm/brand',name),path.join(out,'img',name));
await cp(path.join(root,'sm/brand/mark.svg'),path.join(out,'img/ublock.svg'));
await cp(path.join(root,'sm/brand/mark.svg'),path.join(out,'sm/mark.svg'));
const manifest = JSON.parse(await readFile(path.join(out,'manifest.json'),'utf8'));
if (manifest.version !== release.engineVersion) throw new Error('Upstream changed: review migration');
Object.assign(manifest,{name:'SM 净览',short_name:'SM 净览',version:release.extensionVersion,version_name:`SM ${release.productVersion} / uBOL ${release.engineVersion}`,description:'广告过滤、网站排障、临时暂停、规则恢复与可选配置同步。基于 uBlock Origin Lite 的独立修改版。',options_page:'welcome.html'});
if (platform !== 'chromium') { delete manifest.options_page; manifest.options_ui = platform === 'firefox' ? { page: 'welcome.html', open_in_tab: true } : { page: 'welcome.html' }; }
manifest.action.default_popup = 'sm/popup.html';
if (platform !== 'safari') manifest.optional_permissions = [...new Set([...(manifest.optional_permissions || []),'declarativeNetRequestFeedback'])];
manifest.content_scripts = [...(manifest.content_scripts || []),{matches:['http://*/*','https://*/*'],js:['sm/cookies.js'],run_at:'document_idle'}];
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const contract = [];
// Every upstream seam: the needle must occur exactly `count` times, so a changed upstream fails loudly
// instead of being patched in the wrong place (or only the first of several places).
async function append(file,text,purpose) {
    const target = path.join(out,file);
    await writeFile(target,(await readFile(target,'utf8')).replaceAll('\r\n','\n')+text);
    contract.push({ file, purpose: `append: ${purpose}`, matches: 1, needleSha256: sha(text).slice(0,16) });
}
async function patch(file,needle,replacement,purpose = '',count = 1) {
    const target = path.join(out,file); const text = (await readFile(target,'utf8')).replaceAll('\r\n','\n');
    const found = text.split(needle).length - 1;
    if (found !== count) throw new Error(`Upstream changed: ${file} (patch "${purpose || needle.slice(0,40)}" matched ${found}x, expected ${count}x)`);
    await writeFile(target,text.replace(needle,() => replacement));
    contract.push({ file, purpose, matches: found, needleSha256: sha(needle).slice(0,16) });
}
await patch('js/background.js',"return runtime.getManifest().version;",`return '${release.engineVersion}'; // SM engine migration version`);
await patch('js/background.js',"runtime.onMessage.addListener((request, sender, callback) => {",`const smController = createController(onMessage, isFullyInitialized, smRulesFromText, { progress: smProgressSummary });\nruntime.onMessage.addListener((request, sender, callback) => {`);
await patch('js/background.js',"onMessage(request, sender).then(callback);","smController.wrap(request, sender).then(callback, error => callback({ smError: error.message }));",'extension-page message listener only; the userScripts listener (second match) deliberately stays unwrapped',2);
// Engine start-up checkpoints: the popup shows the current step, diagnostics keep the last start's timeline.
const phases = [
    ['    await loadRulesetConfig();', '读取规则配置'],
    ['        await startSession();', '启动过滤会话'],
    ['    await loadAdminConfig();', '读取管理策略'],
    ['    const {\n        stockUpdated,', '启用过滤规则（首次需编译，可能较慢）'],
    ['    const permissionsUpdated = await syncWithBrowserPermissions();', '核对网站权限'],
    ['    await processDeferredTasks();', '注册网页脚本'],
    ['    const scripts = await getRegisteredContentScripts();', '检查网页脚本'],
];
for (const [needle, name] of phases) await patch('js/background.js', needle, `    smPhase(${JSON.stringify(name)});\n${needle}`, `start-up checkpoint: ${name}`);
await patch('js/background.js', "const isFullyInitialized = start().then(( ) => {", "const isFullyInitialized = start().then(( ) => {\n    smEngineDone();", 'start-up checkpoint: ready');
await patch('js/background.js', "    ubolErr(reason);\n    if ( process.wakeupRun ) { return; }", "    ubolErr(reason);\n    smEngineDone(reason || 'unknown');\n    if ( process.wakeupRun ) { return; }", 'start-up checkpoint: failure reason kept for diagnostics');
await patch('js/background.js',"import { deferredTasks }", "import { smPhase, smEngineDone, progressSummary as smProgressSummary } from '../sm/engine-progress.mjs';\nimport { createController } from '../sm/worker.mjs';\nimport { rulesFromText as smRulesFromText } from './dnr-parser.js';\nimport { deferredTasks }");
await patch('js/backup-restore.js','manifest.versionName ?? manifest.version','manifest.version_name ?? manifest.version');
await patch('popup.html','<main>', '<main><nav class="smToolsNav" aria-label="元素工具导航"><a id="smBack" href="sm/popup.html">← 返回</a><strong>元素工具</strong></nav>');
await patch('popup.html','</head>', '<style>html#uBO-popup-panel,html#uBO-popup-panel body{width:380px;min-width:380px}.smToolsNav{visibility:visible;pointer-events:auto;position:relative;z-index:1001;background:var(--surface-1);display:flex;align-items:center;gap:24px;padding:14px 18px;border-bottom:1px solid #cbded7;font:16px/1.5 system-ui}.smToolsNav a{color:inherit;text-decoration:none;padding:6px 10px;border:1px solid #8da69c;border-radius:8px}.smToolsNav a:focus-visible{outline:3px solid #b97a0d;outline-offset:2px}@media(pointer:coarse){html#uBO-popup-panel,html#uBO-popup-panel body{width:100%;min-width:0}.smToolsNav a{min-height:44px;display:inline-flex;align-items:center}}</style></head>');
await patch('popup.html','</main>','<p style="text-align:center"><a href="welcome.html" target="_blank" rel="noopener">SM 净览 · 控制中心</a></p></main>');
// Upstream pages: SM brand colour instead of uBO blue, SM name on the logo, one backup entry (SM's).
await append('css/default.css', `\n/* SM 净览: brand palette (green) replaces the upstream blue primary ramp. */\n:root{--primary-20:10 52 42;--primary-30:14 80 64;--primary-40:20 113 92;--primary-50:31 140 114;--primary-60:63 174 140;--primary-70:110 199 170;--primary-80:163 222 201;--primary-90:212 240 229;--primary-95:233 247 241}\n`, 'brand palette');
await patch('dashboard.html','alt="uBO Lite"','alt="SM 净览"');
await patch('dashboard.html','<div>\n        <h3 data-i18n="settingsBackupRestoreLabel">_</h3>','<div class="smBackupPointer"><h3>备份与恢复</h3><p>备份、导入、撤销和同步统一在 <a href="welcome.html#migration" target="_blank">SM 控制中心 → 备份与撤销</a>：导入前可预览，失败会自动回退。</p></div>\n    <div hidden>\n        <h3 data-i18n="settingsBackupRestoreLabel">_</h3>','single backup entry: upstream backup/restore/reset hidden, pointed at the SM control center');
await patch('js/imported-lists.js','export async function updateImportedLists() {','export async function updateImportedLists(force = false) {');
await patch('js/imported-lists.js','if ( updateTime > now ) { continue; }','if ( !force && updateTime > now ) { continue; }');
await patch('js/background.js','const count = await updateImportedLists();','const count = await updateImportedLists(request.force === true);');
await patch('js/imported-lists.js',"serialized: await localRead(`rulesets.imported.compiled.${listid}`),","serialized: await localRead(`rulesets.imported.compiled.${listid}`),\n        stale: (await getImportedLists()).find(x => x.id === listid)?.smRefresh === true,");
await patch('js/imported-lists.js',"await localRemove(toUpdate.map(a => `rulesets.imported.compiled.${a}`));","const all = await getImportedLists();\n    for (const list of all) { if (toUpdate.includes(list.id)) list.smRefresh = true; }\n    await saveImportedLists(all);");
await patch('js/imported-lists.js',"    } else {\n        await localRemove(`rulesets.imported.compiled.${listid}`);\n    }","    } // SM retains last known good compiled list on failure");
await patch('js/imported-lists.js',"    list.time.updated = Date.now();","    list.smAttemptedAt = Date.now();\n    list.smRefresh = false;\n    if (details.compiled) { list.smSuccessAt = Date.now(); list.smError = ''; list.time.updated = Date.now(); }\n    else { list.smError = details.error || '下载或编译失败，保留上次成功规则'; list.time.updated = Date.now(); } // scheduler time; success recorded separately");
await patch('js/offscreen/compile-filters.js',"    if ( Boolean(text) === false ) { return; }\n\n    const metadata", "    if ( Boolean(text) === false ) { await browser.runtime.sendMessage({ what: 'compileFilters:updateImportedListData', listid: list.id, error: '订阅下载失败或返回空内容' }); return; }\n\n    const metadata");
await patch('js/offscreen/compile-filters.js',"    if ( Boolean(compiled) === false ) { return; }","    if ( Boolean(compiled) === false ) { await browser.runtime.sendMessage({ what: 'compileFilters:updateImportedListData', listid: list.id, error: '订阅编译失败' }); return; }");
await patch('js/offscreen/compile-filters.js',"    if ( Boolean(result?.serialized) === false ) {", "    if (result?.stale) { const fresh = await updateList(list); if (fresh) return fresh; }\n    if ( Boolean(result?.serialized) === false ) {");
await patch('js/background.js', "    case 'getImportedLists': {", "    case 'compileFilters:smStage': { const staged=(await chrome.storage.session.get('sm.stagedLists'))['sm.stagedLists']; return staged ? staged[request.url] ?? {error:'订阅文件未下载'} : null; }\n    case 'getImportedLists': {");
await patch('js/offscreen/fetch-list.js', '    const response = await fetch(url).catch(( ) => { });', `    const staged = await browser.runtime.sendMessage({what:'compileFilters:smStage',url});
    if (staged) return staged.content !== undefined ? {url,content:staged.content} : {url,error:staged.error || '订阅文件未下载，保留旧规则'};
    const response = await fetch(url,{signal:AbortSignal.timeout(15000)}).catch(( ) => { });`);
await patch('js/offscreen/fetch-list.js', "import * as sfp", "const browser = self.browser || self.chrome;\nimport * as sfp");
await patch('js/rw-dnr-editor.js',"        await (text.length !== 0\n            ? localWrite('userDnrRules', text)\n            : localRemove('userDnrRules')\n        );\n        const response = await sendMessage({ what: 'updateUserDnrRules' })","        const reply = await sendMessage({ what: 'sm:setUserDnrRules', text });\n        if ( reply?.ok !== true ) { throw new Error(reply?.error || '高级网络规则保存失败'); }\n        const response = reply.data;",'rule editor saves through the SM write queue');
await patch('js/backup-restore.js',"    if ( dnrRules.length !== 0 ) {\n        await localWrite('userDnrRules', dnrRules.join('\\n'));\n    } else {\n        await localRemove('userDnrRules');\n    }\n    await sendMessage({ what: 'updateUserDnrRules' });","    const smReply = await sendMessage({ what: 'sm:setUserDnrRules', text: dnrRules.join('\\n') });\n    if ( smReply?.ok !== true ) { throw new Error(smReply?.error || '高级网络规则保存失败'); }",'upstream restore writes advanced rules through the SM write queue');
for (const dir of await readdir(path.join(out,'_locales'))) {
    const file = path.join(out,'_locales',dir,'messages.json');
    const strings = JSON.parse(await readFile(file,'utf8'));
    for (const value of Object.values(strings)) if (typeof value.message === 'string') value.message = value.message.replaceAll('uBlock Origin Lite','SM 净览').replaceAll('uBO Lite','SM 净览');
    // One vocabulary for the three filtering levels (see sm/core.mjs modeNames).
    const levels = { zh_CN: ['轻度','标准','强力'], zh_TW: ['輕度','標準','強力'] }[dir];
    if (levels) levels.forEach((name, i) => { if (strings[`filteringMode${i + 1}Name`]) strings[`filteringMode${i + 1}Name`].message = name; });
    if (strings.supportS3P1) strings.supportS3P1.message = 'SM 净览：请使用工具栏弹窗里的“反馈问题”，生成脱敏报告后复制发给 SM 支持渠道。';
    await writeFile(file,JSON.stringify(strings,null,2)+'\n');
}
await writeFile(path.join(out,'report.html'),'<!doctype html><meta charset="utf-8"><title>SM 净览反馈</title><a href="welcome.html#feedback">打开 SM 净览反馈中心</a><script type="module" src="sm/report-redirect.js"></script>');
await writeFile(path.join(out,'sm/report-redirect.js'),"location.replace(chrome.runtime.getURL('welcome.html#feedback'));\n");
// Resolve the worker graph at build time, not on each service-worker startup.
const bundled=await bundle({absWorkingDir:out,entryPoints:[path.join(out,'js/background.js')],outfile:path.join(out,'js/background.bundle.js'),bundle:true,format:'esm',platform:'browser',target:{firefox:'firefox128',safari:'safari18',chromium:'chrome120'}[platform],minify:false,legalComments:'inline',metafile:true});
if(Object.values(bundled.metafile.outputs).some(x=>x.imports.length))throw Error('Worker bundle has unresolved imports');
if (platform === 'firefox') manifest.background = { scripts: ['js/background.bundle.js'], type: 'module' };
else if (platform === 'safari') manifest.background = { scripts: ['js/background.bundle.js'], type: 'module', persistent: false };
else manifest.background.service_worker='js/background.bundle.js';
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
// Apple store compliance (description length, version shape) on the finished package, exactly as upstream does it.
if (platform === 'safari') execFileSync(process.execPath,[path.join(root,'sm/safari/patch-extension.js'),`packageDir=${out}`],{stdio:'inherit'});
await writeFile(path.join(out,'sm/BUNDLE.json'),JSON.stringify({tool:`esbuild ${esbuildVersion}`,inputModules:Object.keys(bundled.metafile.inputs).length,outputs:bundled.metafile.outputs},null,2));
let localCommit = process.env.SM_LOCAL_COMMIT || 'source-archive';
if (!process.env.SM_LOCAL_COMMIT) try { localCommit = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch { }
await writeFile(path.join(out,'SM-BUILD.json'),JSON.stringify({...release,...(platformOverlay && {platform,[`${platform}Overlay`]:platformOverlay}),localCommit,license:'GPL-3.0-or-later',upstream:'https://github.com/uBlockOrigin/uBOL-home',upstreamTree:upstream,toolchain,upstreamSeams:contract,modifications:'sm/ overlay; engine version separation; imported-list refresh recovery; localized branding and owned feedback; advanced-rule edits routed through the SM write queue'},null,2)+'\n');
for (const file of ['README-SM.md','QA-SM.md','PRIVACY-SM.md','RELEASE-SM.md','FEATURES-SM.md']) await cp(path.join(root,file),path.join(out,file));
// Exact file set + digests: verify.mjs rejects stale leftovers and silent substitutions.
const listed = {};
for (const rel of await walkFiles(out)) { const info = await stat(path.join(out, rel)); listed[rel] = { bytes: info.size, sha256: sha(await readFile(path.join(out, rel))) }; }
await writeFile(path.join(out,'SM-FILES.json'),JSON.stringify({ files: Object.keys(listed).length, entries: listed },null,2)+'\n');
// Replace the previous package only now that the new one is complete.
await rm(finalOut, { recursive: true, force: true });
await rename(out, finalOut);
console.log(finalOut);
} catch (error) {
    await rm(out, { recursive: true, force: true });
    throw error;
}
