// Deterministic overlay on pinned upstream. GPL-3.0-or-later.
import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'build', 'sm-ad-filter');
const release = JSON.parse(await readFile(path.join(root,'sm/release.json'),'utf8'));
await mkdir(out,{recursive:true});
await cp(path.join(root,'chromium'),out,{recursive:true});
await mkdir(path.join(out,'sm'),{recursive:true});
for (const name of ['welcome.css','welcome.js','core.mjs','worker.mjs','updates.mjs','cookies.js','popup.html','popup.css','popup.js','brand.png','release.json']) await cp(path.join(root,'sm',name),path.join(out,'sm',name));
// Inline only local styles and official Tabler icon nodes: no blocking stylesheet/icon requests.
const iconNodes = JSON.parse(await readFile(path.join(root,'sm/icons/tabler.json'),'utf8'));
let popup = await readFile(path.join(root,'sm/popup.html'),'utf8');
popup = popup.replace('<link rel="stylesheet" href="popup.css">',`<style>${await readFile(path.join(root,'sm/popup.css'),'utf8')}</style>`);
popup = popup.replace(/\{\{([a-z-]+)\}\}/g,(_,name)=>{
    if(!iconNodes[name])throw Error(`Missing icon ${name}`);
    const nodes=iconNodes[name].map(([tag,attrs])=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}/>`).join('');
    return `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${name.endsWith('-filled')?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${nodes}</svg>`;
});
await writeFile(path.join(out,'sm/popup.html'),popup);
await cp(path.join(root,'sm/icons/LICENSE.txt'),path.join(out,'sm/TABLER-LICENSE.txt'));
await cp(path.join(root,'sm/welcome.html'),path.join(out,'welcome.html'));
const manifest = JSON.parse(await readFile(path.join(out,'manifest.json'),'utf8'));
if (manifest.version !== release.engineVersion) throw new Error('Upstream changed: review migration');
Object.assign(manifest,{name:'SM 净览',short_name:'SM 净览',version:release.extensionVersion,version_name:`SM ${release.productVersion} / uBOL ${release.engineVersion}`,description:'广告过滤、网站排障、临时暂停、规则恢复与可选配置同步。基于 uBlock Origin Lite 的独立修改版。',options_page:'welcome.html'});
manifest.action.default_popup = 'sm/popup.html';
manifest.optional_permissions = [...new Set([...(manifest.optional_permissions || []),'declarativeNetRequestFeedback'])];
manifest.content_scripts = [...(manifest.content_scripts || []),{matches:['http://*/*','https://*/*'],js:['sm/cookies.js'],run_at:'document_idle'}];
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
async function patch(file,needle,replacement) {
    const target = path.join(out,file); const text = (await readFile(target,'utf8')).replaceAll('\r\n','\n');
    if (!text.includes(needle)) throw new Error(`Upstream changed: ${file}`);
    await writeFile(target,text.replace(needle,replacement));
}
await patch('js/background.js',"return runtime.getManifest().version;",`return '${release.engineVersion}'; // SM engine migration version`);
await patch('js/background.js',"runtime.onMessage.addListener((request, sender, callback) => {",`const smController = createController(onMessage, isFullyInitialized, smRulesFromText);\nruntime.onMessage.addListener((request, sender, callback) => {`);
await patch('js/background.js',"onMessage(request, sender).then(callback);","smController.wrap(request, sender).then(callback, error => callback({ smError: error.message }));");
await patch('js/background.js',"import { deferredTasks }", "import { createController } from '../sm/worker.mjs';\nimport { rulesFromText as smRulesFromText } from './dnr-parser.js';\nimport { deferredTasks }");
await patch('js/backup-restore.js','manifest.versionName ?? manifest.version','manifest.version_name ?? manifest.version');
await patch('popup.html','<main>', '<main><nav class="smToolsNav" aria-label="元素工具导航"><a id="smBack" href="sm/popup.html">← 返回</a><strong>元素工具</strong></nav>');
await patch('popup.html','</head>', '<style>html#uBO-popup-panel,html#uBO-popup-panel body{width:380px;min-width:380px}.smToolsNav{visibility:visible;pointer-events:auto;position:relative;z-index:1001;background:var(--surface-1);display:flex;align-items:center;gap:24px;padding:14px 18px;border-bottom:1px solid #cbded7;font:16px/1.5 system-ui}.smToolsNav a{color:inherit;text-decoration:none;padding:6px 10px;border:1px solid #8da69c;border-radius:8px}.smToolsNav a:focus-visible{outline:3px solid #b97a0d;outline-offset:2px}</style></head>');
await patch('popup.html','</main>','<p style="text-align:center"><a href="welcome.html" target="_blank" rel="noopener">SM 净览 · 控制中心</a></p></main>');
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
for (const dir of await readdir(path.join(out,'_locales'))) {
    const file = path.join(out,'_locales',dir,'messages.json');
    const strings = JSON.parse(await readFile(file,'utf8'));
    for (const value of Object.values(strings)) if (typeof value.message === 'string') value.message = value.message.replaceAll('uBlock Origin Lite','SM 净览').replaceAll('uBO Lite','SM 净览');
    if (strings.supportS3P1) strings.supportS3P1.message = 'SM 净览：请使用工具栏的“反馈问题”，生成脱敏报告并提交到已配置的 SM 仓库。';
    await writeFile(file,JSON.stringify(strings,null,2)+'\n');
}
await writeFile(path.join(out,'report.html'),'<!doctype html><meta charset="utf-8"><title>SM 净览反馈</title><a href="welcome.html#feedback">打开 SM 净览反馈中心</a><script type="module" src="sm/report-redirect.js"></script>');
await writeFile(path.join(out,'sm/report-redirect.js'),"location.replace(chrome.runtime.getURL('welcome.html#feedback'));\n");
let localCommit = 'source-archive';
try { localCommit = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch { }
await writeFile(path.join(out,'SM-BUILD.json'),JSON.stringify({...release,localCommit,license:'GPL-3.0-or-later',upstream:'https://github.com/uBlockOrigin/uBOL-home',modifications:'sm/ overlay; engine version separation; imported-list refresh recovery; localized branding and owned feedback'},null,2)+'\n');
for (const file of ['README-SM.md','QA-SM.md','PRIVACY-SM.md','RELEASE-SM.md','FEATURES-SM.md']) await cp(path.join(root,file),path.join(out,file));
console.log(out);
