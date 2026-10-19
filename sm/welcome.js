import { modeNames, hostname, reportText, backupSummary } from './core.mjs';
const $ = selector => document.querySelector(selector);
let current, pending, pendingBase, cloudRevision = null, cloudRead = false, filters = [];
const mutating = new Set(['sm:restore','sm:setMode','sm:pause','sm:resume','sm:preset','sm:undo','sm:removeFilter','sm:cookieToggle','sm:setUserDnrRules','sm:clearRecords']);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ask(what, data, limit) {
    let timer;
    try { return await Promise.race([chrome.runtime.sendMessage({what,...data}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('操作响应超时'),{timeout:true})),limit);})]); }
    finally { clearTimeout(timer); }
}
async function send(what, data={}) {
    const opId = mutating.has(what) ? `w-${crypto.randomUUID()}` : undefined;
    let result;
    try { result = await ask(what, {...data, opId}, what==='sm:updateLists'?180000:30000); }
    catch (error) {
        if (!error.timeout || !opId) throw error;
        // The worker may still be running the request: look up its outcome by id instead of guessing or re-sending.
        for (let i = 0; i < 20; i++) {
            await wait(1000);
            const status = (await ask('sm:opStatus', {opId}, 5000).catch(() => null))?.data;
            if (status?.state === 'done') return status.result;
            if (['failed','interrupted','rolledBack','rollbackFailed'].includes(status?.state)) throw new Error(status.error || status.message || '操作未完成');
        }
        throw new Error('操作结果未知：后台可能仍在处理。请先点击“刷新状态”确认，勿重复提交');
    }
    if (!result?.ok) throw new Error(result?.error || '过滤引擎未就绪，请稍后重试');
    return result.data;
}
const date = time => time ? new Date(time).toLocaleString() : '尚无成功记录';
function list(target, lines) { target.replaceChildren(...lines.map(text => {const li=document.createElement('li');li.textContent=text;return li;})); }
function download(name, data, type='application/json') {
    const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function actionState() {
    if(!current)return;
    let selected=false;try{selected=host()===current.hostname;}catch{}
    const valid=Boolean(current.hostname)&&selected, paused=Boolean(current.pauses[current.hostname]);
    for(const id of ['mode','setMode','pause10','pauseSession','resume'])$('#'+id).disabled=!valid;
    $('#resume').hidden=!paused;$('#resume').disabled=!valid||!paused;
    $('#pause10').hidden=$('#pauseSession').hidden=paused;
    $('#setMode').disabled=!valid||Number($('#mode').value)===current.level;
    $('#recommended').disabled=['chn-0','easylist','easyprivacy'].every(id=>current.enabledRulesets.includes(id));
    $('#recommended').textContent=$('#recommended').disabled?'推荐规则已启用':'启用推荐规则';
    $('#sendReport').disabled=!(current.repository||current.release.repository)||!$('#report').value;
    $('#copyReport').disabled=$('#downloadReport').disabled=!$('#report').value;
}
async function run(button, fn) {
    const scope=button.closest('.panel')||button.parentElement;
    let note=scope.querySelector('.actionStatus');
    if(!note){note=document.createElement('p');note.className='actionStatus';note.setAttribute('role','status');note.setAttribute('aria-live','polite');}
    const anchor=button.closest('.actions')||button;
    if(button.id==='saveRepository')$('#repository').removeAttribute('aria-invalid');
    anchor.after(note);note.hidden=false;note.id=`status-${button.id||'action'}`;button.setAttribute('aria-describedby',note.id);
    button.disabled=true;button.setAttribute('aria-busy','true');note.dataset.state='loading';note.textContent='正在处理…';
    try { await fn(); note.dataset.state='success';note.textContent='操作完成。';if(button.id==='refresh'||button.id==='checkSite')note.hidden=true; }
    catch(error) {
        note.dataset.state='error';note.textContent=`未完成：${error.message}`;
        const field=button.id==='saveRepository'?$('#repository'):['checkSite','setMode','pause10','pauseSession'].includes(button.id)?$('#site'):null;
        if(field){field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',note.id);field.focus();field.oninput=()=>field.removeAttribute('aria-invalid');}
        if(note.getBoundingClientRect().top<0||note.getBoundingClientRect().bottom>innerHeight)note.scrollIntoView({block:'nearest',behavior:'instant'});
    }
    finally { button.removeAttribute('aria-busy');if(!['filterPrev','filterNext','cancelUpdate'].includes(button.id))button.disabled=button.id==='applyImport' && (!pending||!$('#confirmImport').checked);actionState(); }
}
function on(id, fn) { $(id).addEventListener('click',event=>run(event.currentTarget,fn)); }
function host() { return hostname($('#site').value); }
async function refresh() {
    current = await send('sm:status', $('#site').value.trim() ? {hostname:host()} : {});
    $('#version').textContent = `v${current.release.productVersion}`;
    $('#status').textContent = `默认：${modeNames[current.defaultFilteringMode]} · 已启用 ${current.enabledRulesets.length} 组规则 · 中文规则${current.enabledRulesets.includes('chn-0')?'已开启':'未开启'}`;
    list($('#diagnostics'),[
        `网站访问权限：${current.hasAccess?'可用':'不足，请在扩展详情中检查网站访问权限'}`,
        `用户脚本权限：${current.userScripts?'可用':'未开放，导入订阅中的部分元素／脚本规则可能不生效；在扩展详情中开启“允许用户脚本”'}`,
        `规则引擎：已返回配置。此状态不等于所有广告都能过滤。`,
        ...(current.startError ? [`后台恢复提示：${current.startError}`] : []),
    ]);
    $('#siteStatus').textContent = current.hostname ? `${current.hostname} · ${current.pauses[current.hostname]?'已暂停':modeNames[current.level]}` : '输入网站后，可调整过滤或临时暂停。';
    $('#mode').value=String(current.level);
    $('#cookies').checked=current.cookieReject;
    $('#cookieResult').textContent=current.cookies ? `${current.cookies.provider}：${current.cookies.result}（${date(current.cookies.time)}）` : '此站点暂无自动拒绝记录；隐藏弹窗不代表已拒绝同意。';
    $('#syncEnabled').checked=current.syncEnabled;
    $('#repository').value=current.repository || current.release.repository;
    $('#ruleVersion').textContent=`SM ${current.release.productVersion} · 扩展升级版本 ${chrome.runtime.getManifest().version} · 内置规则/引擎 ${current.release.engineVersion}`;
    const repo=$('#repository').value;
    $('#releases').hidden=!repo; if(repo) $('#releases').href=`${repo}/releases`;
    list($('#pauses'),Object.entries(current.pauses).map(([h,p])=>`${h}：暂停至 ${p.until?date(p.until):'本次浏览器会话结束'}`));
    const history = await send('sm:history'); list($('#history'),history.map(h=>`${date(h.time)} · ${h.label}`));
    showNotice();
    await showChecklist();
    wizardRender();
    actionState();
    await showLists();
}
async function showLists() {
    const lists=await send('sm:lists');
    list($('#lists'),lists.length?lists.map(x=>`${x.name || x.id} · ${x.enabled?'启用':'停用'} · 最近成功：${date(x.smSuccessAt)} · 最近尝试：${date(x.smAttemptedAt)}${x.smError?` · ${x.smError}`:''}`):['没有导入订阅。可在完整设置中添加。']);
}
function showFilters() {
    const needle=$('#filterSearch').value.trim().toLowerCase(); const container=$('#customFilters');container.replaceChildren();
    let count=0;const offset=filterPage*100;
    for(const [h,selectors] of filters.filter(([domain])=>!needle||domain.toLowerCase().includes(needle))) for(const selector of selectors) {
        count++;
        if(count<=offset||count>offset+100) continue;
        const row=document.createElement('div');row.className='filterRow';const text=document.createElement('code');text.textContent=`${h}##${selector}`;
        const button=document.createElement('button');button.textContent='删除';button.className='secondary';button.setAttribute('aria-label',`删除 ${h} 的规则 ${selector}`);
        button.onclick=()=>run(button,async()=>{await send('sm:removeFilter',{hostname:h,selector});filters=await send('sm:filters');showFilters();await refresh();});
        row.append(text,button);container.append(row);
    }
    const note=document.createElement('p');note.textContent=count?`匹配 ${count} 条，第 ${filterPage+1} 页，每页 100 条。`:'没有匹配的自定义规则。';container.prepend(note);$('#filterPrev').disabled=filterPage===0;$('#filterNext').disabled=count<=(filterPage+1)*100;
}
async function preview(data) {
    pending=null;$('#applyImport').disabled=true;$('#confirmImport').checked=false;
    const result=await send('sm:preview',{data});pending=result.data;pendingBase=result.baseRevision;
    const s=result.summary;
    $('#preview').textContent=`备份时间：${pending.createdAt}\n规则组 ${s.lists} · 站点例外 ${s.sites} · 自定义规则 ${s.custom}\n外部订阅 ${s.subscriptions} · 高级规则 ${s.advanced?'有（请确认来源）':'无'}\n将替换当前配置并结束所有临时暂停；操作前保留本地恢复快照，失败会自动回退。\n站点例外：${JSON.stringify(pending.settings.filteringModes,null,2)}\n规则列表：${pending.settings.enabledRulesets.join(', ')}`;
}

// ---- interrupted-operation notice, first-use checklist, site recovery wizard -------------------------------------
function showNotice() {
    const box = $('#notice'), notice = current?.notice;
    box.replaceChildren();
    if (!notice) return;
    const text = document.createElement('span'); text.textContent = notice.message;
    const ack = document.createElement('button'); ack.id = 'ackNotice'; ack.className = 'secondary'; ack.textContent = '知道了';
    ack.onclick = () => run(ack, async () => { await send('sm:ackNotice'); await refresh(); });
    box.append(text, ' ', ack);
}
const extensionDetailsUrl = () => `${/Edg\//.test(navigator.userAgent) ? 'edge' : 'chrome'}://extensions/?id=${chrome.runtime.id}`;
async function showChecklist() {
    const dismissed = (() => { try { return localStorage.getItem('sm.startDismissed') === '1'; } catch { return false; } })();
    const rulesOn = ['chn-0','easylist','easyprivacy'].every(id => current.enabledRulesets.includes(id));
    const lines = [
        rulesOn ? '过滤规则：推荐规则已启用。' : '过滤规则：尚未启用推荐规则。点击下方“启用推荐规则”。',
        current.hasAccess ? '网站访问权限：可用。' : '网站访问权限：不足。过滤需要读取和调整网页：在扩展详情页把“网站访问权限”设为“在所有网站上”。仅授予单个网站时，其他网站不会被过滤。',
        '固定到工具栏：点击浏览器工具栏的拼图图标，再点 SM 净览旁的图钉，之后一键暂停此站点。',
    ];
    list($('#startChecks'), lines);
    $('#startRecommended').hidden = rulesOn;
    // Show until everything is in place or the user dismisses it; permission trouble is never hidden by "dismissed".
    $('#start').hidden = dismissed && rulesOn && current.hasAccess;
    let capacity = `已启用 ${current.enabledRulesets.length} 组规则（浏览器上限 ${current.maxNumberOfEnabledRulesets} 组）`;
    try { if (chrome.declarativeNetRequest.getAvailableStaticRuleCount) capacity += `；浏览器还可启用约 ${await chrome.declarativeNetRequest.getAvailableStaticRuleCount()} 条静态规则`; } catch { /* Not available in this browser. */ }
    $('#ruleCapacity').textContent = `${capacity}。接近上限时新增规则组可能失败，系统会提示。`;
}
const wizard = { step: 0 };
function wizardRender() {
    const body = $('#wizardBody');
    body.replaceChildren();
    const valid = Boolean(current?.hostname);
    const say = text => { const p = document.createElement('p'); p.textContent = text; body.append(p); };
    const row = document.createElement('div'); row.className = 'actions';
    const button = (id, label, fn, secondary = true) => { const b = document.createElement('button'); b.id = id; b.textContent = label; if (secondary) b.className = 'secondary'; b.onclick = () => run(b, fn); row.append(b); return b; };
    const host = current?.hostname;
    const level = current?.level ?? 2;
    if (!valid && wizard.step !== 0) wizard.step = 0;
    switch (wizard.step) {
    case 0:
        say(valid ? `当前网站：${host}。我们按“暂停 → 降低强度 → 反馈”的顺序排查，每一步都可恢复。` : '请先在上方输入出现异常的网站并点击“查看”。');
        button('wizStart', '第 1 步：暂停此站点 10 分钟', async () => { wizard.level = level; await send('sm:pause', {hostname: host, duration: '10m'}); wizard.step = 1; await refresh(); }, false).disabled = !valid;
        break;
    case 1:
        say(`已暂停 ${host} 10 分钟并刷新网页。网页现在正常了吗？`);
        button('wizFixed', '正常了', async () => { wizard.step = 2; wizardRender(); }, false);
        button('wizStill', '仍然异常', async () => { wizard.step = 3; wizardRender(); });
        break;
    case 2:
        {   // While paused the site reads as "不过滤"; the level before the pause is what can be lowered.
            const base = wizard.level ?? 2;
            say(base > 1 ? `暂停后恢复正常，说明问题与过滤有关。可只对 ${host} 把“${modeNames[base]}”降低一档，并恢复保护。` : `暂停后恢复正常，说明问题与过滤有关。此站点原本只用“${modeNames[base]}”，已经很低，建议提交反馈。`);
            if (base > 1) button('wizLower', `降低到“${modeNames[base - 1]}”并恢复保护`, async () => { await send('sm:setMode', {hostname: host, level: base - 1}); wizard.step = 4; await refresh(); }, false);
        }
        button('wizReport', '去提交反馈', async () => { $('#issueKind').value = '网页功能异常'; location.hash = '#feedback'; });
        break;
    case 3:
        say('暂停后仍然异常，多半与过滤无关（网站本身、网络或其他扩展）。建议恢复保护。');
        button('wizResume', '恢复保护', async () => { await send('sm:resume', {hostname: host}); wizard.step = 5; await refresh(); }, false);
        break;
    case 4:
        say(`已把 ${host} 调整为“${modeNames[level]}”。网页现在正常吗？`);
        button('wizDone', '正常，完成', async () => { wizard.step = 5; wizardRender(); }, false);
        button('wizPauseAgain', '仍异常：暂停并反馈', async () => { await send('sm:pause', {hostname: host, duration: '10m'}); $('#issueKind').value = '网页功能异常'; location.hash = '#feedback'; wizard.step = 5; await refresh(); });
        break;
    default:
        say('排查结束。可随时再次开始。'); button('wizAgain', '重新开始', async () => { wizard.step = 0; wizardRender(); });
    }
    body.append(row);
}
$('#startRecommended').onclick = event => run(event.currentTarget, async () => { await send('sm:preset', {preset: 'recommended'}); await refresh(); });
$('#startDone').onclick = () => { try { localStorage.setItem('sm.startDismissed', '1'); } catch { /* Private mode: keep showing. */ } $('#start').hidden = true; };
$('#openExtDetails').onclick = event => run(event.currentTarget, async () => { await chrome.tabs.create({url: extensionDetailsUrl()}); });
// Local diagnostics for support: versions, permissions and states only (no URLs, rule text or history).
on('#copyDiagnostics',async()=>{
    await refresh();
    const text=JSON.stringify({product:current.release.productVersion,extension:chrome.runtime.getManifest().version,engine:current.release.engineVersion,browser:navigator.userAgent.match(/(Edg|Chrome)\/[\d.]+/g)?.join(' ')||'unknown',
        siteAccess:current.hasAccess,userScripts:current.userScripts,enabledRulesetCount:current.enabledRulesets.length,defaultMode:modeNames[current.defaultFilteringMode],pausedSites:Object.keys(current.pauses).length,
        startError:current.startError||null,lastNotice:current.notice?.message??null,time:new Date().toISOString()},null,2);
    await navigator.clipboard.writeText(text);$('#notice').textContent='诊断信息已复制。';setTimeout(()=>{if($('#notice').textContent==='诊断信息已复制。')$('#notice').textContent='';},4000);
});
on('#refresh',refresh);on('#checkSite',refresh);
$('#site').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('#checkSite').click();}});
$('#site').addEventListener('input',actionState);$('#mode').addEventListener('change',actionState);
on('#recommended',async()=>{await send('sm:preset',{preset:'recommended'});await refresh();});
on('#quiet',async()=>{await send('sm:preset',{preset:'quiet'});await refresh();});
on('#setMode',async()=>{await send('sm:setMode',{hostname:host(),level:Number($('#mode').value)});await refresh();});
on('#pause10',async()=>{await send('sm:pause',{hostname:host(),duration:'10m'});await refresh();});
on('#pauseSession',async()=>{await send('sm:pause',{hostname:host(),duration:'session'});await refresh();});
on('#resume',async()=>{await send('sm:resume',{hostname:host()});await refresh();});
$('#cookies').onchange=event=>run(event.currentTarget,async()=>{await send('sm:cookieToggle',{enabled:$('#cookies').checked});await refresh();});
on('#updateLists',async()=>{
    $('#cancelUpdate').disabled=false;
    const timer=setInterval(async()=>{try{const job=await send('sm:updateProgress');$('#updateStatus').textContent=job.state==='committing'?'正在编译并提交规则…':`正在下载：${job.files} 个文件，${Math.round(job.bytes/1024)} KB`;
    $('#cancelUpdate').disabled=job.state!=='downloading';}catch{}},500);
    try{await send('sm:updateLists');await showLists();$('#updateStatus').textContent='订阅更新尝试结束；请查看每项订阅的成功时间和错误记录。失败时保留上次可用规则。';}
    finally{clearInterval(timer);$('#cancelUpdate').disabled=true;}
});
on('#cancelUpdate',async()=>{await send('sm:cancelUpdate');$('#updateStatus').textContent='下载已取消，当前规则保留。';});
on('#checkUpdate',async()=>{
    const result=await chrome.runtime.requestUpdateCheck();
    $('#updateStatus').textContent = result.status==='update_available'?`浏览器检测到新版本 ${result.version}，等待浏览器更新。`:result.status==='throttled'?'浏览器限制了本次检查，请稍后再试。':'浏览器未报告可用更新。本地加载版请前往发布页下载；这不证明发布页没有新版本。';
});
let filterPage=0,searchTimer;
on('#loadFilters',async()=>{filters=await send('sm:filters');filterPage=0;showFilters();});$('#filterSearch').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{filterPage=0;showFilters();},150);};
on('#filterPrev',()=>{filterPage=Math.max(0,filterPage-1);showFilters();});on('#filterNext',()=>{filterPage++;showFilters();});
on('#undo',async()=>{await send('sm:undo');await refresh();filters=await send('sm:filters');showFilters();});
on('#clearHistory',async()=>{if(confirm('清除本机操作历史、恢复快照与 Cookie 处理记录？当前过滤设置保留。')) {await send('sm:clearRecords');await refresh();}});
on('#export',async()=>{if(Object.keys(current.pauses).length)throw new Error('请先恢复临时暂停的网站，再导出持久配置');download('sm-jinglan-config.json',await send('sm:snapshot'));});
on('#recovery',async()=>{const data=await send('sm:recovery');if(!data)throw new Error('尚无恢复快照');download('sm-jinglan-recovery.json',data);});
$('#import').onchange=event=>run(event.currentTarget,async()=>{
    pending=null;$('#applyImport').disabled=true;
    const file=event.target.files[0];if(!file)return;if(file.size>500000)throw new Error('文件超过 500 KB');await preview(JSON.parse(await file.text()));
});
$('#confirmImport').onchange=()=>{$('#applyImport').disabled=!pending||!$('#confirmImport').checked;};
on('#applyImport',async()=>{if(!pending||!$('#confirmImport').checked)throw new Error('请先预览并确认');await send('sm:restore',{data:pending,baseRevision:pendingBase});pending=null;$('#confirmImport').checked=false;await refresh();$('#preview').textContent='导入完成，并已读回验证。';});
$('#syncEnabled').onchange=event=>run(event.currentTarget,async()=>{await send('sm:syncEnable',{enabled:$('#syncEnabled').checked});cloudRead=false;await refresh();});
on('#syncRead',async()=>{const cloud=await send('sm:syncRead');cloudRevision=cloud?.revision??null;cloudRead=true;$('#syncStatus').textContent=cloud?`已读取版本 ${cloud.revision}；未应用。请检查下方备份预览并确认。`:'同步存储当前没有配置。';if(cloud)await preview(cloud.data);});
on('#syncWrite',async()=>{if(!cloudRead)throw new Error('请先读取云端，避免覆盖未知配置');if(!confirm('将当前配置上传到浏览器同步存储，并替换刚才读取的云端配置？'))return;const cloud=await send('sm:syncWrite',{expectedRevision:cloudRevision});cloudRevision=cloud.revision;$('#syncStatus').textContent=`同步存储已写入并读回：${cloud.revision}。其他设备接收情况未验证。`;});
on('#syncDelete',async()=>{if(!confirm('删除当前扩展的云端配置？本机设置保留。'))return;await send('sm:syncDelete');cloudRead=false;$('#syncStatus').textContent='已删除同步存储中的配置。';});
on('#saveRepository',async()=>{await send('sm:repository',{url:$('#repository').value.trim()});await refresh();});
on('#generateReport',async()=>{await refresh();$('#report').value=reportText({site:current.hostname,version:current.release.productVersion,engine:current.release.engineVersion,mode:current.level,rulesets:current.enabledRulesets.length,permissions:current.hasAccess,kind:$('#issueKind').value,description:$('#description').value});});
on('#copyReport',async()=>{if(!$('#report').value)throw new Error('请先生成报告');await navigator.clipboard.writeText($('#report').value);});
on('#downloadReport',async()=>{if(!$('#report').value)throw new Error('请先生成报告');download('sm-jinglan-report.txt',$('#report').value,'text/plain');});
on('#sendReport',async()=>{const repo=current.repository||current.release.repository;if(!repo)throw new Error('SM 仓库尚未配置，请先复制或下载报告');if(!$('#report').value)throw new Error('请先生成并检查报告');if(!confirm('将预览报告交给 GitHub，并打开问题填写页？'))return;const url=new URL(`${repo}/issues/new`);url.searchParams.set('title',`[SM 净览] ${$('#issueKind').value}`);url.searchParams.set('body',$('#report').value);await chrome.tabs.create({url:url.href});});
const params=new URLSearchParams(location.search);if(params.get('site'))$('#site').value=params.get('site');
run($('#refresh'),refresh);
