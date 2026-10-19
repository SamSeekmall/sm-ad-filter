// Standalone popup: no module graph, remote assets or dashboard data on its critical path.
const $=s=>document.querySelector(s),names=['不过滤','基础','优化','完整'];
let state,tab,busy=false,sequence=0;
performance.mark('sm-popup-script');
async function send(what,args={},timeout=12000){let timer;try{const r=await Promise.race([chrome.runtime.sendMessage({what,...args}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('引擎响应较慢，请稍后重试')),timeout);})]);if(!r?.ok)throw Error(r?.error||'过滤引擎尚未就绪');return r.data;}finally{clearTimeout(timer);}}
function enabled(){const valid=Boolean(state?.hostname)&&!busy;for(const id of ['pause','mode','apply','stats'])$('#'+id).disabled=!valid;$('#elements').setAttribute('aria-disabled',String(!valid));$('#duration').disabled=!valid;}
function showStatus(text,kind){$('#state').textContent=text;$('#state').dataset.kind=kind;if(kind==='active')$('#state').prepend($('#activeDot').content.cloneNode(true));}
function paint(){const valid=Boolean(state.hostname),paused=Boolean(state.pauses[state.hostname]);$('#host').textContent=state.hostname||'此页面无法过滤';$('#host').title=state.hostname||'';
 showStatus(valid?(paused?'已临时暂停':state.level>0?'已开启保护':'此站点未过滤'):'请在普通网站打开',valid?(paused||state.level===0?'paused':'active'):'unavailable');
 $('#mode').value=String(state.level);$('#modeLabel').textContent=names[state.level];$('#pauseLabel').textContent=paused?'恢复保护':state.level===0?'开启此站点':'暂停此站点';$('.duration').hidden=paused||state.level===0;
 $('#permission').textContent=state.hasAccess?'网站访问权限可用':'网站访问权限不足，请到扩展详情中调整。';
 const query=valid?'?site='+encodeURIComponent(state.hostname):'';$('#center').href='../welcome.html'+query;$('#settings').href='../welcome.html'+query;$('#feedback').href='../welcome.html'+query+'#feedback';enabled();performance.mark('sm-popup-ready');document.documentElement.dataset.ready='true';}
async function load(){const ticket=++sequence;document.documentElement.dataset.ready="false";state=null;enabled();let slow=setTimeout(()=>{if(ticket===sequence)showStatus('正在唤醒过滤引擎…','loading');},1500);
 try{[tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.url&&/^https?:/.test(tab.url)){$('#host').textContent=new URL(tab.url).hostname;performance.mark('sm-popup-host');}
 const value=await send('sm:popupStatus',{tabId:tab?.id});if(ticket!==sequence)return;state=value;paint();}
 catch(e){if(ticket!==sequence)return;showStatus('保护状态暂未确认','unavailable');$('#actionStatus').hidden=false;$('#actionStatus').dataset.error='true';$('#actionStatus').textContent=e.message;const retry=document.createElement('button');retry.textContent='重新读取';retry.onclick=()=>{retry.remove();load();};$('#actionStatus').append(' ',retry);}
 finally{clearTimeout(slow);}}
async function act(what,args){if(!state?.hostname||busy)return;busy=true;enabled();$('#actionStatus').hidden=false;$('#actionStatus').dataset.error='false';$('#actionStatus').textContent='正在应用，请稍候…';
 try{await send(what,{hostname:state.hostname,...args},30000);await load();if(state)$('#actionStatus').textContent='已完成，网站已刷新。';}
 catch(e){$('#actionStatus').dataset.error='true';$('#actionStatus').textContent=e.message;await load();}
 finally{busy=false;enabled();}}
$('#pause').onclick=()=>state?.pauses[state.hostname]?act('sm:resume',{}):state?.level===0?act('sm:setMode',{level:2}):act('sm:pause',{duration:$('#duration').value});
$('#apply').onclick=()=>act('sm:setMode',{level:Number($('#mode').value)});
$('#elements').onclick=e=>{if(!state?.hostname||busy)e.preventDefault();};
$('#stats').onclick=async()=>{if(!state?.hostname)return;$('#stats').disabled=true;$('#statsText').hidden=false;$('#statsText').textContent='正在读取…';try{
 if(!(await chrome.permissions.contains({permissions:['declarativeNetRequestFeedback']}))&&!(await chrome.permissions.request({permissions:['declarativeNetRequestFeedback']})))throw Error('未授予诊断权限');
 const rows=await send('sm:stats',{tabId:tab.id});const labels={block:'阻止',redirect:'替换',allow:'放行',allowAllRequests:'站点放行',modifyHeaders:'请求头调整',upgradeScheme:'HTTPS 升级',unknown:'未知'};
 $('#statsText').textContent=`最近 ${rows.length} 条规则命中（最多 50 条，并非广告数量）：${rows.map(r=>`${labels[r.action]||r.action} · ${r.rulesetId} #${r.ruleId}`).join('；')||'暂无记录'}。`;
 }catch(e){$('#statsText').textContent=e.message;}finally{enabled();}};
load();
