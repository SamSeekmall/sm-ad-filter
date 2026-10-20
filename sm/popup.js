// Standalone popup: no module graph, remote assets or dashboard data on its critical path.
const $=s=>document.querySelector(s),names=['不过滤','轻度','标准','强力'],longNames=['不过滤','轻度过滤','标准过滤','强力过滤'];
let state,tab,busy=false,sequence=0,clock;
performance.mark('sm-popup-script');
const mutating=new Set(['sm:setMode','sm:pause','sm:resume']),sleep=ms=>new Promise(r=>setTimeout(r,ms));
// A timeout does not cancel work the worker already accepted, so ask for the outcome instead of guessing or re-sending.
async function raw(what,args,timeout){let timer;try{return await Promise.race([chrome.runtime.sendMessage({what,...args}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('引擎响应较慢，请稍后重试'),{timeout:true})),timeout);})]);}finally{clearTimeout(timer);}}
async function send(what,args={},timeout=12000,onSlow){const opId=mutating.has(what)?'p-'+crypto.randomUUID():undefined;let r;
 try{r=await raw(what,{...args,opId},timeout);}
 catch(e){if(!e.timeout||!opId)throw e;if(onSlow)onSlow();
  for(let i=0;i<8;i++){await sleep(1000);const s=await raw('sm:opStatus',{opId},5000).catch(()=>null);const st=s?.data?.state;
   if(st==='done')return s.data.result;if(st==='failed'||st==='interrupted'||st==='rolledBack'||st==='rollbackFailed')throw Error(s.data.error||s.data.message||'操作未完成');}
  throw Error('操作结果未知：后台可能仍在处理。请重新读取确认，勿重复点击。');}
 if(!r?.ok)throw Error(r?.error||'过滤引擎尚未就绪');return r.data;}
const pauseOf=()=>state?.pauses?.[state.hostname];
function enabled(){const valid=Boolean(state?.hostname)&&!busy,paused=Boolean(pauseOf());for(const id of ['pause','stats','zap','pick','unpick'])$('#'+id).disabled=!valid;for(const b of segButtons())b.disabled=!valid||paused;$('#duration').disabled=!valid;for(const b of document.querySelectorAll('#checkActions button'))b.disabled=busy;}
const segButtons=()=>[...document.querySelectorAll('#mode button')],hints=['本站不过滤。','轻度只拦截网络请求。','标准同时隐藏广告位（推荐）。','强力隐藏范围更广，偶尔影响网页。'];
// icon: 'active' | 'paused' | 'off' | null. The shield beside the state is decorative; the state text carries the meaning.
function showStatus(text,kind,icon=null){$('#state').textContent=text;$('#state').dataset.kind=kind;const el=$('#stateIcon');el.replaceChildren();el.dataset.kind=icon==='active'?'active':icon?'paused':'';if(icon)el.append($('#icon-'+icon).content.cloneNode(true));}
function remaining(p){if(!p.until)return '关闭浏览器后自动恢复';const m=Math.max(1,Math.ceil((p.until-Date.now())/60000));return m>=60?`约 ${Math.round(m/60)} 小时后自动恢复`:`还剩 ${m} 分钟，到时自动恢复`;}
function detail(text){$('#detail').hidden=!text;$('#detail').textContent=text||'';}
function paint(){const valid=Boolean(state.hostname),pause=pauseOf(),paused=Boolean(pause);$('#host').textContent=state.hostname||'此页面无法过滤';$('#host').title=state.hostname||'';
 showStatus(valid?(paused?'已暂停过滤':state.level>0?'已开启保护':'此站点未过滤'):'请在普通网站打开',valid?(paused||state.level===0?'paused':'active'):'unavailable',valid?(paused?'paused':state.level>0?'active':'off'):null);
 clearInterval(clock);
 if(paused){detail(remaining(pause));clock=setInterval(()=>{if(pauseOf())detail(remaining(pauseOf()));},30000);}else detail(valid?'':'浏览器内部页面和扩展商店无法过滤');
 // While paused the site is technically "不过滤"; show the mode it returns to instead.
 const back=Number.isInteger(pause?.level)?pause.level:null;
 const shown=paused&&back!==null?back:state.level;for(const b of segButtons()){const on=valid&&Number(b.dataset.level)===shown;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;}
 $('#modeHint').textContent=!valid?' ':paused?(back!==null?`暂停中，恢复后回到“${names[back]}”。`:'暂停中，恢复后回到原模式。'):hints[state.level];
 $('#pauseLabel').textContent=!valid?'此页面不可用':paused?'恢复保护':state.level===0?'开启此站点':'暂停此站点';$('.iconPause').hidden=paused||state.level===0;$('.iconPlay').hidden=!(paused||state.level===0);$('.duration').hidden=paused||state.level===0;
 // Hiding rules do not apply while the site is paused, so the element tools step aside.
 document.querySelector('.tools').classList.toggle('pausedTools',paused);
 $('#permission').hidden=!valid||state.hasAccess;$('#permission').textContent='网站访问权限不足，请到扩展详情中调整。';
 const query=valid?'?site='+encodeURIComponent(state.hostname):'';$('#center').href='../welcome.html'+query;$('#feedback').href='../welcome.html'+query+'#feedback';enabled();performance.mark('sm-popup-ready');document.documentElement.dataset.ready='true';}
// Everything below the first paint: never delays the protection state.
async function extras(){if(!state?.hostname)return;
 if(!pauseOf()&&state.level>0&&Number.isInteger(tab?.id))try{const {rulesMatchedInfo}=await chrome.declarativeNetRequest.getMatchedRules({tabId:tab.id});if(rulesMatchedInfo.length&&!pauseOf())detail(`本页已触发过滤规则 ${rulesMatchedInfo.length} 次`);}catch{/* No activeTab grant or quota reached: show nothing. */}
 try{const panel=await raw('popupPanelData',{hostname:state.hostname},5000);const forbid=panel?.disabledFeatures||[];$('#zap').hidden=forbid.includes('zapper');$('#pick').hidden=forbid.includes('picker');$('#unpick').hidden=forbid.includes('picker')||panel?.hasCustomFilters!==true;}catch{}
 await renderCheck();}
// Segment timings stay on this page (dataset + window) for the benchmark harness; nothing is stored or sent.
function recordTiming(sentAt,repliedAt,worker){const script=performance.getEntriesByName('sm-popup-script')[0]?.startTime??null;
 requestAnimationFrame(()=>{const t={popupScriptMs:script&&Math.round(script),requestSentMs:Math.round(sentAt),replyReceivedMs:Math.round(repliedAt),roundTripMs:Math.round(repliedAt-sentAt),stateVisibleMs:Math.round(performance.now()),worker};window.smTiming=t;document.documentElement.dataset.timing=JSON.stringify(t);keepTiming(t);});}
// Local speed log (numbers only, no site names): the control center's diagnostics page summarises it.
async function keepTiming(t){try{const n=performance.getEntriesByType('navigation')[0];
 const sample={time:Date.now(),fileReadMs:n?Math.round(n.responseEnd-n.fetchStart):null,startToFetchMs:n?Math.round(n.fetchStart):null,parseMs:n?Math.round(n.domInteractive-n.responseEnd):null,scriptMs:t.popupScriptMs,roundTripMs:t.roundTripMs,waitForInitMs:t.worker?.waitForInitMs??null,wokeWorker:t.worker?.wokeWorker??null,stateVisibleMs:t.stateVisibleMs};
 const key='sm.popupTimings',old=(await chrome.storage.local.get(key))[key]||[];await chrome.storage.local.set({[key]:[...old,sample].slice(-30)});}catch{}}
async function load(){const ticket=++sequence;document.documentElement.dataset.ready="false";state=null;enabled();let slow=setTimeout(()=>{if(ticket===sequence)showStatus('正在唤醒过滤引擎…','loading');},1500);
 try{const sentAt=performance.now(),value=await send('sm:popupStatus'),repliedAt=performance.now();if(ticket!==sequence)return;if(value?.engineStarting){starting(value,ticket);return;}tab={id:value.tabId};state=value;recordTiming(sentAt,repliedAt,value.timing);if(!busy){$('#actionStatus').hidden=true;$('#actionStatus').replaceChildren();}paint();extras();}
 catch(e){if(ticket!==sequence)return;showStatus('保护状态暂未确认','unavailable');$('#actionStatus').hidden=false;$('#actionStatus').dataset.error='true';$('#actionStatus').textContent=e.message;const retry=document.createElement('button');retry.textContent='重新读取';retry.onclick=()=>{retry.remove();load();};$('#actionStatus').append(' ',retry);}
 finally{clearTimeout(slow);}}
// The engine is still starting (first run compiles rules; a slow machine takes longer): say which step, keep polling.
function starting(v,ticket){const secs=Math.round(v.elapsedMs/1000);showStatus('过滤引擎正在启动…','loading');
 detail(v.error||v.startError?`启动出错：${v.error||v.startError}。请在扩展管理页对 SM 净览点“重新加载”。`:secs>=60?`已等待 ${secs} 秒，仍在“${v.phase}”。请在扩展管理页对 SM 净览点“重新加载”；仍不行请到控制中心“诊断与关于”复制诊断信息发给我们。`:`第 ${v.step} 步：${v.phase}，已等待 ${secs} 秒`);
 setTimeout(()=>{if(ticket===sequence)load();},1500);}
async function act(what,args,done='已完成，网站已刷新。'){if(!state?.hostname||busy)return false;busy=true;enabled();$('#actionStatus').hidden=false;$('#actionStatus').dataset.error='false';$('#actionStatus').dataset.busy='true';$('#actionStatus').textContent='正在应用，请稍候…';
 try{await send(what,{hostname:state.hostname,...args},30000,()=>{$('#actionStatus').textContent='响应较慢，正在核对结果…';});await load();$('#actionStatus').hidden=false;$('#actionStatus').dataset.busy='false';$('#actionStatus').textContent=done;return true;}
 catch(e){$('#actionStatus').dataset.busy='false';$('#actionStatus').dataset.error='true';$('#actionStatus').textContent=e.message;await load();$('#actionStatus').hidden=false;return false;}
 finally{busy=false;enabled();}}

// ---- in-popup troubleshooting: pause -> "is the page fine now?" -> lower one level -> feedback -----------------
// The popup closes when the user looks at the page, so the step survives in session storage (cleared with the browser).
const CHECK='sm.popupCheck';
async function getCheck(){try{const c=(await chrome.storage.session.get(CHECK))[CHECK];return c&&c.host===state?.hostname?c:null;}catch{return null;}}
async function setCheck(c){try{c?await chrome.storage.session.set({[CHECK]:{...c,host:state.hostname}}):await chrome.storage.session.remove(CHECK);}catch{}}
let checkTicket=0;
async function renderCheck(){const ticket=++checkTicket,box=$('#check'),actions=$('#checkActions');let c=await getCheck();if(ticket!==checkTicket)return;actions.replaceChildren();
 const pause=pauseOf();
 if(!c&&pause)c={step:'paused',level:pause.level};
 if(!c||!state?.hostname){box.hidden=true;return;}
 const say=t=>$('#checkText').textContent=t;
 const btn=(label,fn,secondary)=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(secondary)b.className='secondary';b.onclick=fn;actions.append(b);return b;};
 const feedback=()=>chrome.tabs.create({url:chrome.runtime.getURL(`welcome.html?site=${encodeURIComponent(state.hostname)}&issue=broken#feedback`)});
 const level=Number.isInteger(c.level)?c.level:2;
 switch(c.step){
 case 'paused':
  if(!pause){box.hidden=true;await setCheck(null);return;}
  say('过滤已暂停，网页已刷新。去网页上看一眼（弹窗会关闭，看完再点 SM 图标回来）：现在正常了吗？');
  btn('正常了',async()=>{await setCheck({step:'fixed',level});renderCheck();});
  btn('还是不正常',async()=>{await setCheck({step:'notFilter',level});renderCheck();},true);break;
 case 'fixed':
  if(level>1){say(`问题与过滤有关。可以只对本站改用“${longNames[level-1]}”并恢复保护，其他网站不受影响。`);
   btn(`改用“${longNames[level-1]}”并恢复保护`,async()=>{if(await act('sm:setMode',{level:level-1},`已改为“${longNames[level-1]}”，网站已刷新。`)){await setCheck({step:'lowered',level:level-1});renderCheck();}});}
  else say('问题与过滤有关，本站已经是最低一档。请告诉我们是哪个网站，我们来修规则。');
  btn('反馈这个网站',feedback,level>1);
  btn('结束',async()=>{await setCheck(null);renderCheck();},true);break;
 case 'notFilter':
  say('暂停后仍不正常，多半与过滤无关（网站本身、网络或其他扩展）。建议恢复保护。');
  if(pause)btn('恢复保护',async()=>{if(await act('sm:resume',{},'已恢复保护，网站已刷新。')){await setCheck(null);renderCheck();}});
  btn('仍要反馈',feedback,true);break;
 case 'lowered':
  say(`已改为“${longNames[level]}”。网页现在正常吗？`);
  btn('正常，完成',async()=>{await setCheck(null);$('#actionStatus').hidden=false;$('#actionStatus').dataset.error='false';$('#actionStatus').textContent='排查完成。';renderCheck();});
  btn('仍异常：暂停并反馈',async()=>{if(await act('sm:pause',{duration:'10m'},'已暂停 10 分钟。')){await setCheck(null);await feedback();}},true);break;
 default:box.hidden=true;return;}
 box.hidden=false;if($('#actionStatus').dataset.error!=='true')$('#actionStatus').hidden=true;enabled();}

$('#pause').onclick=async()=>{if(state?.pauses[state.hostname]){if(await act('sm:resume',{},'已恢复保护，网站已刷新。'))await setCheck(null);renderCheck();}
 else if(state?.level===0)act('sm:setMode',{level:2});
 else{const level=state.level;if(await act('sm:pause',{duration:$('#duration').value},'已暂停，网站已刷新。')){await setCheck({step:'paused',level});renderCheck();}}};
// One tap switches the mode (the worker refreshes the site); arrow keys follow the radio-group pattern.
for(const b of segButtons()){b.onclick=()=>{const level=Number(b.dataset.level);if(!state?.hostname||pauseOf()||level===state.level)return;act('sm:setMode',{level});};
 b.onkeydown=e=>{const all=segButtons().filter(x=>!x.disabled),i=all.indexOf(b),step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(!step||i<0)return;e.preventDefault();all[(i+step+all.length)%all.length].focus();};}
// Element tools run the engine's own on-page scripts directly from here; the popup closes so the page can be clicked.
const TOOLS={zap:['/js/scripting/tool-overlay.js','/js/scripting/zapper.js'],pick:['/js/scripting/css-procedural-api.js','/js/scripting/tool-overlay.js','/js/scripting/picker.js'],unpick:['/js/scripting/css-procedural-api.js','/js/scripting/tool-overlay.js','/js/scripting/unpicker.js']};
for(const [id,files] of Object.entries(TOOLS))$('#'+id).onclick=async()=>{if(!state?.hostname||!Number.isInteger(tab?.id))return;try{await chrome.scripting.executeScript({files,target:{tabId:tab.id}});window.close();}catch(e){$('#actionStatus').hidden=false;$('#actionStatus').dataset.error='true';$('#actionStatus').textContent=`无法在此页面使用：${e.message}`;}};
$('#stats').onclick=async()=>{if(!state?.hostname)return;$('#stats').disabled=true;$('#statsText').hidden=false;$('#statsText').textContent='正在读取…';try{
 if(!(await chrome.permissions.contains({permissions:['declarativeNetRequestFeedback']}))&&!(await chrome.permissions.request({permissions:['declarativeNetRequestFeedback']})))throw Error('未授予诊断权限');
 const rows=await send('sm:stats',{tabId:tab.id});const labels={block:'阻止',redirect:'替换',allow:'放行',allowAllRequests:'站点放行',modifyHeaders:'请求头调整',upgradeScheme:'HTTPS 升级',unknown:'未知'};
 $('#statsText').textContent=`最近 ${rows.length} 条规则命中（最多 50 条，并非广告数量）：${rows.map(r=>`${labels[r.action]||r.action} · ${r.rulesetId} #${r.ruleId}`).join('；')||'暂无记录'}。`;
 }catch(e){$('#statsText').textContent=e.message;}finally{enabled();}};
load();
