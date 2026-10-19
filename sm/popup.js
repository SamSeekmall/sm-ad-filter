import {modeNames} from './core.mjs';
const $=s=>document.querySelector(s);let state,tab;
async function send(what,args={}){const r=await chrome.runtime.sendMessage({what,...args});if(!r?.ok)throw new Error(r?.error||'过滤引擎未就绪');return r.data;}
async function load(){
    [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    state=await send('sm:status',{tabId:tab?.id});
    const valid=Boolean(state.hostname);
    $('#host').textContent=state.hostname||'此页面无法过滤';
    $('#state').textContent=valid?`当前：${modeNames[state.level]}${state.pauses[state.hostname]?' · 临时暂停中':''}`:'请在普通 HTTP / HTTPS 网站中打开面板。';
    $('#permission').textContent=state.hasAccess?'网站访问权限可用':'网站访问权限不足，请在扩展详情中检查。';
    $('#mode').value=String(state.level);
    for(const id of ['#apply','#pause','#session','#resume','#stats','#mode'])$(id).disabled=!valid;
    $('#resume').disabled=!valid||!state.pauses[state.hostname];
    const query=valid?`?site=${encodeURIComponent(state.hostname)}`:'';
    $('#center').href=`../welcome.html${query}`;$('#feedback').href=`../welcome.html${query}#feedback`;
}
for(const [id,what,args] of [['#apply','sm:setMode',()=>({level:Number($('#mode').value)})],['#pause','sm:pause',()=>({duration:'10m'})],['#session','sm:pause',()=>({duration:'session'})],['#resume','sm:resume',()=>({})]]){
    $(id).onclick=async()=>{const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await send(what,{hostname:state.hostname,...args()});await load();}catch(e){$('#state').textContent=`未完成：${e.message}`;}finally{buttons.forEach(b=>b.disabled=!state?.hostname);$('#resume').disabled=!state?.pauses[state.hostname];}};
}
$('#stats').onclick=async()=>{
    try {
        if(!(await chrome.permissions.contains({permissions:['declarativeNetRequestFeedback']}))){if(!(await chrome.permissions.request({permissions:['declarativeNetRequestFeedback']})))throw new Error('未授予诊断权限，统计不可用');}
        const rows=await send('sm:stats',{tabId:tab.id});
        const actions={block:'阻止',redirect:'替换资源',allow:'放行',allowAllRequests:'站点放行',modifyHeaders:'调整请求头',upgradeScheme:'升级 HTTPS',unknown:'类型未知'};
        $('#statsText').textContent=`浏览器当前可提供 ${rows.length} 条命中记录（最多展示最近 50 条，非完整历史）：${rows.map(r=>`${actions[r.action]||r.action} · ${r.rulesetId} #${r.ruleId}`).join('；')||'暂无'}。命中不能等同于广告数量；元素隐藏未计入。`;
    }catch(e){$('#statsText').textContent=`统计不可用：${e.message}`;}
};
load().catch(e=>{$('#state').textContent=e.message;});
