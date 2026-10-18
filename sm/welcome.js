import { modeNames, hostname, reportText, backupSummary } from './core.mjs';
const $ = selector => document.querySelector(selector);
let current, pending, pendingBase, cloudRevision = null, cloudRead = false, filters = [];
async function send(what, data={}) {
    const result = await chrome.runtime.sendMessage({what,...data});
    if (!result?.ok) throw new Error(result?.error || '过滤引擎未就绪，请稍后重试');
    return result.data;
}
const date = time => time ? new Date(time).toLocaleString() : '尚无成功记录';
function list(target, lines) { target.replaceChildren(...lines.map(text => {const li=document.createElement('li');li.textContent=text;return li;})); }
function download(name, data, type='application/json') {
    const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function run(button, fn) {
    button.disabled=true; $('#notice').textContent='正在处理…';
    try { await fn(); $('#notice').textContent='操作完成。'; }
    catch(error) { $('#notice').textContent=`未完成：${error.message}`; }
    finally { button.disabled=button.id==='applyImport' && (!pending||!$('#confirmImport').checked); }
}
function on(id, fn) { $(id).addEventListener('click',event=>run(event.currentTarget,fn)); }
function host() { return hostname($('#site').value); }
async function refresh() {
    current = await send('sm:status', $('#site').value.trim() ? {hostname:host()} : {});
    $('#version').textContent = `${current.release.productVersion} · ${current.release.channel}`;
    $('#status').textContent = `默认：${modeNames[current.defaultFilteringMode]} · 已启用 ${current.enabledRulesets.length} 组规则 · 中文规则${current.enabledRulesets.includes('chn-0')?'已开启':'未开启'}`;
    list($('#diagnostics'),[
        `网站访问权限：${current.hasAccess?'可用':'不足，请在扩展详情中检查网站访问权限'}`,
        `用户脚本权限：${current.userScripts?'可用':'未开放，导入订阅中的部分元素／脚本规则可能不生效；在扩展详情中开启“允许用户脚本”'}`,
        `规则引擎：已返回配置。此状态不等于所有广告都能过滤。`,
        ...(current.startError ? [`后台恢复提示：${current.startError}`] : []),
    ]);
    $('#siteStatus').textContent = current.hostname ? `${current.hostname}：${modeNames[current.level]}` : '请从网站工具栏打开，或在上方输入网站';
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
    await showLists();
}
async function showLists() {
    const lists=await send('sm:lists');
    list($('#lists'),lists.length?lists.map(x=>`${x.name || x.id} · ${x.enabled?'启用':'停用'} · 最近成功：${date(x.smSuccessAt)} · 最近尝试：${date(x.smAttemptedAt)}${x.smError?` · ${x.smError}`:''}`):['没有导入订阅。可在完整设置中添加。']);
}
function showFilters() {
    const needle=$('#filterSearch').value.trim().toLowerCase(); const container=$('#customFilters');container.replaceChildren();
    let count=0;
    for(const [h,selectors] of filters) for(const selector of selectors) {
        if(needle&&!h.includes(needle)) continue; count++;
        if(count>100) continue;
        const row=document.createElement('div');row.className='filterRow';const text=document.createElement('code');text.textContent=`${h}##${selector}`;
        const button=document.createElement('button');button.textContent='删除';button.className='secondary';button.setAttribute('aria-label',`删除 ${h} 的规则 ${selector}`);
        button.onclick=()=>run(button,async()=>{await send('sm:removeFilter',{hostname:h,selector});filters=await send('sm:filters');showFilters();await refresh();});
        row.append(text,button);container.append(row);
    }
    const note=document.createElement('p');note.textContent=count?`匹配 ${count} 条，最多显示 100 条，请筛选具体域名。`:'没有匹配的自定义规则。';container.prepend(note);
}
async function preview(data) {
    pending=null;$('#applyImport').disabled=true;$('#confirmImport').checked=false;
    const result=await send('sm:preview',{data});pending=result.data;pendingBase=result.baseRevision;
    const s=result.summary;
    $('#preview').textContent=`备份时间：${pending.createdAt}\n规则组 ${s.lists} · 站点例外 ${s.sites} · 自定义规则 ${s.custom}\n外部订阅 ${s.subscriptions} · 高级规则 ${s.advanced?'有（请确认来源）':'无'}\n将替换当前配置，操作前保留本地恢复快照。\n站点例外：${JSON.stringify(pending.settings.filteringModes,null,2)}\n规则列表：${pending.settings.enabledRulesets.join(', ')}`;
}
on('#refresh',refresh);on('#checkSite',refresh);
on('#enable',async()=>{await send('sm:preset',{preset:'recommended'});await refresh();});
on('#recommended',async()=>{await send('sm:preset',{preset:'recommended'});await refresh();});
on('#quiet',async()=>{await send('sm:preset',{preset:'quiet'});await refresh();});
on('#setMode',async()=>{await send('sm:setMode',{hostname:host(),level:Number($('#mode').value)});await refresh();});
on('#pause10',async()=>{await send('sm:pause',{hostname:host(),duration:'10m'});await refresh();});
on('#pauseSession',async()=>{await send('sm:pause',{hostname:host(),duration:'session'});await refresh();});
on('#resume',async()=>{await send('sm:resume',{hostname:host()});await refresh();});
$('#cookies').onchange=event=>run(event.currentTarget,async()=>{await send('sm:cookieToggle',{enabled:$('#cookies').checked});await refresh();});
on('#updateLists',async()=>{await send('sm:updateLists');await showLists();$('#updateStatus').textContent='订阅更新尝试结束；请查看每项订阅的成功时间和错误记录。失败时保留上次可用规则。';});
on('#checkUpdate',async()=>{
    const result=await chrome.runtime.requestUpdateCheck();
    $('#updateStatus').textContent = result.status==='update_available'?`浏览器检测到新版本 ${result.version}，等待浏览器更新。`:result.status==='throttled'?'浏览器限制了本次检查，请稍后再试。':'浏览器未报告可用更新。本地加载版请前往发布页下载；这不证明发布页没有新版本。';
});
on('#loadFilters',async()=>{filters=await send('sm:filters');showFilters();});$('#filterSearch').oninput=showFilters;
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
