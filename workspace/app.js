'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => 'id-' + Math.random().toString(36).slice(2, 10);
const now = () => new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const STORAGE = 'corpora-sapiens-cases-v1';
const tabTypes = {computer:['▣','Computer'],overview:['◫','Overview'],artifacts:['▤','Artifacts'],github:['⑂','GitHub'],slack:['#','Slack'],connections:['◎','Connections'],document:['▧','Kickoff brief'],custom:['↗','Website'],blank:['','New tab'],html:['◇','HTML']};
// Generated from fixtures/sapiens-cases.json by build-prototype.py.
const fixture = globalThis.CorporaFixture;
const seed = fixture.state;
let state;
try { state = JSON.parse(localStorage.getItem(STORAGE)); } catch {}
if(!state || !Array.isArray(state.agents) || !state.computer || !state.document) state = structuredClone(seed);
state.panes = {sidebar:true,chat:true,workspace:true,...state.panes};
state.computer.lastUsed ??= state.computer.owner || null;
state.scope = ({personal:'sapis',team:'groups'})[state.scope] || state.scope;
for(const a of state.agents) a.kind ??= a.id==='designers'?'group':'sapi';
state.drafts ??= {};
state.workspaces ??= {[state.selected]:{tabs:state.tabs,activeTab:state.activeTab}};
let workspaceOwner=state.selected;
// Keep legacy tab labels and URLs, but retire app-generated pages from the browser surface.
for(const ws of Object.values(state.workspaces)) for(const t of ws.tabs) {
  if(!['custom','html','blank'].includes(t.type)) t.type='blank';
}
const browserFrames=new Map();
function storeWorkspace(){state.workspaces[workspaceOwner]={tabs:state.tabs,activeTab:state.activeTab};}
function syncWorkspace(){
  if(workspaceOwner===state.selected)return;
  storeWorkspace();workspaceOwner=state.selected;
  const ws=state.workspaces[workspaceOwner] || {tabs:[{id:uid(),type:'blank',title:'New tab'}]};
  state.tabs=ws.tabs;state.activeTab=ws.activeTab??ws.tabs[0]?.id??null;
}

let search = '', toastTimer, dragId, pending = new Set();
const agent = id => state.agents.find(a=>a.id===id) || state.agents[0];
const selected = () => agent(state.selected);
const isGroup = a => a.kind==='group' || a.id==='designers';
const isMainSapi = a => a.id===state.mainSapiId;
function initializeRoster(){
  state.mainSapiId??=state.directorId;
  delete state.directorId;
  if(!state.agents.some(a=>a.id===state.mainSapiId&&!isGroup(a)))
    state.mainSapiId=state.agents.find(a=>a.id==='jared'&&!isGroup(a))?.id||state.agents.find(a=>!isGroup(a))?.id;
  const mainSapi=state.agents.find(a=>isMainSapi(a));
  if(mainSapi?.role==='Director')mainSapi.role='Chief of staff';
  // Legacy messages have display times but no dates. Use yesterday for this one-time migration.
  const base=new Date();base.setDate(base.getDate()-1);base.setHours(0,0,0,0);
  for(const a of state.agents){
    const last=state.messages[a.id]?.at(-1);
    if(a.lastActivity==null&&last)a.preview=`${last.role==='user'?'You: ':''}${last.text}`.replace(/\s+/g,' ').trim();
    const time=last?.time||({aaron:'09:42',designers:'09:38'})[a.id]||'09:35';
    const match=time.match(/(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
    let hours=Number(match?.[1]||9);
    if(match?.[3])hours=hours%12+(match[3].toUpperCase()==='PM'?12:0);
    a.lastActivity ??= last?.timestamp||base.getTime()+(hours*60+Number(match?.[2]||35))*60000;
    a.activityTime ??= time;
    a.unread ??= a.id!==state.selected;
  }
}
initializeRoster();
function recordActivity(id,preview){
  const a=state.agents.find(a=>a.id===id);if(!a)return;
  state.activityClock=Math.max(Date.now(),(state.activityClock||0)+1);
  a.lastActivity=state.activityClock;a.activityTime=now();
  if(preview)a.preview=String(preview).replace(/\s+/g,' ').trim();
  a.unread=id!==state.selected||!state.panes.chat;
  renderSidebar();
}
function appendMessage(id,message){
  getMessages(id).push({...message,timestamp:Date.now()});
  recordActivity(id,`${message.role==='user'?'You: ':''}${message.text}`);
}
const groupAvatarCache = new Map();
function groupAvatar(a){
  const key=JSON.stringify([a.id,a.name,a.face,a.color,a.groupAvatar]);
  if(!groupAvatarCache.has(key)){
    const safeColor=/^#[a-f0-9]{6}$/i.test(a.color)?a.color:'#dbd0f7';
    const group=a.groupAvatar || {id:a.id,name:a.name,lead:{id:a.id+'-lead',expression:a.face,colour:safeColor},peers:[{id:a.id+'-peer-1',expression:'◕‿◕',colour:'#c9f3f1'},{id:a.id+'-peer-2',expression:'◠‿◠',colour:'#f7d6d1'}],groups:[]};
    const svg=SapiGroupAvatar.render(group,{tight:true});
    groupAvatarCache.set(key,'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));
  }
  return groupAvatarCache.get(key);
}
const avatar = (a, size='', presence=false) => `<span class="avatar ${size} ${isGroup(a)?'group-avatar':''}" style="--avatar-color:${/^#[a-f0-9]{6}$/i.test(a.color)?a.color:'#fdd997'}" aria-hidden="true">${isGroup(a)?`<img src="${esc(groupAvatar(a))}" alt="">`:`(${esc(a.face)})`}${presence?`<i class="presence ${a.status==='busy'?'busy':a.status==='idle'?'idle':''}"></i>`:''}</span>`;
function mention(id){
  const a=state.agents.find(a=>a.id===id);
  return a?`<button type="button" class="entity-mention" data-mention="${esc(a.id)}" aria-label="Open chat with ${esc(a.name)}">@${esc(a.name)}</button>`:esc(id==='you'?'You':id);
}
function formatText(value){
  const text=String(value??'');
  const names=state.agents.map(a=>a.name).filter(Boolean).sort((a,b)=>b.length-a.length).map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  if(!names.length)return esc(text);
  const pattern=new RegExp(`(?<![\\p{L}\\p{N}_@.-])@?(?:${names.join('|')}|art-[a-z0-9]+:[a-z0-9-]+)(?![\\p{L}\\p{N}_@-])`,'giu');
  let result='',cursor=0;
  for(const match of text.matchAll(pattern)){
    const name=match[0].replace(/^@/,'').toLowerCase();
    const a=state.agents.find(a=>a.name.toLowerCase()===name);
    const artifact=fixture.artifacts.find(item=>item.id.toLowerCase()===name.split(':')[0]);
    result+=esc(text.slice(cursor,match.index))+(a?mention(a.id):artifact?`<button type="button" class="entity-mention" data-artifact="${esc(artifact.id)}">${esc(match[0])}</button>`:esc(match[0]));cursor=match.index+match[0].length;
  }
  return result+esc(text.slice(cursor));
}
function openChat(id){
  const a=state.agents.find(a=>a.id===id);if(!a)return;
  state.drafts ??= {};state.drafts[state.selected]=$('#message-input').value;
  state.selected=id;state.panel='chat';state.panes.chat=true;a.unread=false;
  if(state.scope!=='all')state.scope=isGroup(a)?'groups':'sapis';
  search='';$('#agent-search').value='';$('#message-input').value=state.drafts[id]||'';
  closeModal();render();$('#conversation-body').scrollTop=$('#conversation-body').scrollHeight;
}
function save(){storeWorkspace();try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{toast('Browser storage is full or unavailable. Changes will last for this session.');}}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function log(agentId,title,detail){recordActivity(agentId,title);state.logs.unshift({agent:agentId,time:now(),title,detail});state.logs=state.logs.slice(0,100);}
function modal(title,content,eyebrow='SAPI WORKSPACE'){$('#modal-eyebrow').textContent=eyebrow;$('#modal-content').innerHTML=`<h2 id="modal-title">${esc(title)}</h2>${content}`;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close();}
function render(){if($('#modal').open&&$('#modal-title')?.textContent==='Shared computer')computerDialog();renderPanes();renderSidebar();renderAgentHeader();renderConversation();renderTabs();renderWorkspace();renderGlobal();save();}
function renderPanes(){
  state.panes ??= {sidebar:true,chat:true,workspace:true};
  const names={sidebar:'chat list',chat:'chat',workspace:'workspace'};
  const ids={sidebar:'#chat-list-panel',chat:'#chat-panel',workspace:'#workspace-panel'};
  for(const pane of Object.keys(ids)){
    $(ids[pane]).hidden=!state.panes[pane];
    const button=$(`[data-toggle-pane="${pane}"]`);
    button.setAttribute('aria-pressed',String(state.panes[pane]));
    button.setAttribute('aria-expanded',String(state.panes[pane]));
    const label=`${state.panes[pane]?'Hide':'Show'} ${names[pane]}`;
    button.setAttribute('aria-label',label);button.title=label;
  }
  const p=state.panes;
  const count=Object.values(p).filter(Boolean).length;
  $('.main-grid').dataset.visiblePanes=count;
  $('.main-grid').style.gridTemplateColumns=[p.sidebar?(count===1?'minmax(0,1fr)':'clamp(205px,18vw,250px)'):'0px',p.chat?'minmax(300px,1fr)':'0px',p.workspace?'minmax(350px,1.2fr)':'0px'].join(' ');
}
function renderGlobal(){
  $('#autonomy-label').textContent={auto:'Autonomous',assist:'Assisted',paused:'Paused'}[state.mode];
  const c=state.computer;
  const who=id=>id==='you'?'You':mention(id);
  $('#resource-owner').innerHTML=c.owner?`${c.paused||state.mode==='paused'?'Paused':'In use'} · ${who(c.owner)}`:c.lastUsed?`Last used by ${who(c.lastUsed)}`:'Available';
  $('#resource-status').classList.toggle('idle',!c.owner);
  $('#resource-status').classList.toggle('paused',c.paused||state.mode==='paused');
  $('#task-count').textContent=state.tasks.filter(t=>t.agent===state.selected&&t.status!=='Done').length;
}
function renderSidebar(){
  $('#agent-count').textContent=String(state.agents.length).padStart(2,'0');
  $$('[data-scope]').forEach(b=>{b.classList.toggle('active',b.dataset.scope===state.scope);b.setAttribute('aria-pressed',b.dataset.scope===state.scope);});
  const list=state.agents.filter(a=>isMainSapi(a)||((state.scope==='all'||(state.scope==='groups'?isGroup(a):!isGroup(a)))&&`${a.name} ${a.role}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a,b)=>Number(isMainSapi(b))-Number(isMainSapi(a))||(b.lastActivity||0)-(a.lastActivity||0));
  $('#agent-list').innerHTML=list.map(a=>`<button class="agent-row ${a.id===state.selected?'active':''} ${isMainSapi(a)?'main-sapi-row':''}" data-agent="${esc(a.id)}" aria-pressed="${a.id===state.selected}">${avatar(a,isMainSapi(a)?'main-sapi-avatar':'',true)}<span class="agent-row-copy"><span class="agent-row-name">${esc(a.name)}<small>${esc(new Date(a.lastActivity).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false}))}</small></span><p>${esc(a.preview)}</p></span>${a.unread&&!isMainSapi(a)?'<span class="unread-dot"></span>':''}</button>`).join('');
}
function renderAgentHeader(){const a=selected();$('#agent-heading').innerHTML=`${avatar(a,isMainSapi(a)?'large main-sapi-avatar':'large')}<div><h2>${esc(a.name)} <span class="muted" style="font-weight:400">/ ${esc(a.role.split(' ·')[0])}</span></h2><p><span class="status-dot"></span> ${state.mode==='paused'?'Paused':a.autonomy==='auto'?'Autonomous':'Assisted'}</p></div><button class="icon-button" data-action="agent-settings" aria-label="Agent settings">···</button>`;$('#message-input').placeholder=`Message ${a.name}…`;$$('[data-panel]').forEach(b=>{b.classList.toggle('active',b.dataset.panel===state.panel);b.setAttribute('aria-pressed',b.dataset.panel===state.panel);});$('.composer-hint span').textContent=state.mode==='paused'?'Ⅱ Team paused':a.autonomy==='auto'?'Autonomous':'Assisted';}
function getMessages(id){if(!state.messages[id]){const a=agent(id);state.messages[id]=[{role:'assistant',time:'09:35',text:({jared:'Good morning, Alex. The team is making progress on Brightside. Aaron has the technical work, Designers are up next on the shared computer, and I’m keeping the bigger picture together.\n\nWhat would you like to move forward today?',designers:'We’ve got the kickoff deck on our list. We’re next in line for the shared computer—once Aaron wraps up, we’ll take it from there.',slack:'I’m keeping an eye on team conversations and collecting the updates that matter. The Brightside recap is ready for a final pass.',scout:'Ready to explore. Give me an account, a question, or a hunch, and I’ll turn it into something useful.'})[id]||`Hi, I’m ${a.name}. Give me a task and I’ll get started.`}];}return state.messages[id];}
function executionCard(){return `<div class="execution-card"><div class="execution-title">Actions <span>3 / 3</span></div><div class="execution-line"><span class="check">✓</span> Read meeting notes & account context <time>2s</time></div><div class="execution-line"><span class="check">✓</span> Verify Slack + SSO release <time>4s</time></div><div class="execution-line"><span class="check">✓</span> Share update with Brightside <time>3s</time></div></div>`;}
function renderConversation(){const host=$('#conversation-body');$('#composer-area').hidden=state.panel!=='chat';renderAgentHeader();renderGlobal();
  if(state.panel==='chat'){const a=selected();const messages=getMessages(a.id);host.innerHTML=`<div class="day-divider">SAMPLE WORKSPACE</div>`+messages.map(m=>`<div class="message ${m.role==='user'?'user':''}"><div class="message-meta">${m.role==='assistant'?avatar(a,'mini'):'<span>↗</span>'}<strong>${m.role==='user'?'You':mention(a.id)}</strong><time>${esc(m.time)}</time></div><div class="message-bubble">${m.text.split('\n\n').map(p=>`<p>${formatText(p).replace(/\n/g,'<br>')}</p>`).join('')}${m.execution?executionCard():''}${m.artifact?'<button class="artifact-link" data-action="open-brief"><span class="file-icon">▤</span><span><strong>Brightside · Kickoff brief</strong><small>DOCUMENT · JUST UPDATED</small></span><span>↗</span></button>':''}</div>${m.artifact?'<div class="message-foot">✓ Context saved to the workspace</div>':''}</div>`).join('')+(pending.has(a.id)?`<div class="typing" role="status">${esc(a.name)} is working through it ···</div>`:'')+`<div class="suggestions"><button data-suggest="Show me the next steps">What’s next? ↗</button><button data-suggest="Prepare a progress report">Make a progress report ↗</button></div>`;renderAttachment();}
  if(state.panel==='tasks')host.innerHTML=`<div class="list-heading"><h3>${esc(selected().name)}’s tasks</h3><button class="button" data-action="new-task">＋ Task</button></div>`+state.tasks.filter(t=>t.agent===state.selected).map(taskCard).join('')+(state.tasks.some(t=>t.agent===state.selected)?'':'<div class="empty">A clean slate. Add the first task.</div>');
  if(state.panel==='log')host.innerHTML=`<div class="list-heading"><h3>Activity log</h3><span class="tag">SIMULATED</span></div>`+state.logs.filter(l=>l.agent===state.selected).map(l=>`<div class="log-row"><time>${esc(l.time)}</time><strong>${esc(l.title)}</strong><p>${formatText(l.detail)}</p></div>`).join('')+(state.logs.some(l=>l.agent===state.selected)?'':'<div class="empty">New activity will appear here.</div>');
  if(state.panel==='cron')host.innerHTML=`<div class="list-heading"><h3>Schedules</h3><button class="button" data-action="new-schedule">＋ Schedule</button></div><p class="form-hint" style="margin-bottom:17px">Demo schedules. Use “Run now” to preview an execution.</p>`+state.schedules.filter(s=>s.agent===state.selected).map(s=>`<div class="schedule-card"><div class="task-card-top"><h3>${esc(s.title)}</h3><button class="switch ${s.enabled?'':'off'}" role="switch" aria-checked="${s.enabled}" aria-label="Enable ${esc(s.title)}" data-toggle-schedule="${s.id}"></button></div><p>${esc(s.prompt)}</p><span class="schedule-meta">↻ ${esc(s.frequency)}</span><div class="actions"><small class="muted">${s.runs} runs · ${s.enabled?'Active':'Paused'}</small><button class="button soft" data-run-schedule="${s.id}">▷ Run now</button><button class="icon-button" data-edit-schedule="${s.id}" aria-label="Edit ${esc(s.title)}">···</button></div></div>`).join('')+(state.schedules.some(s=>s.agent===state.selected)?'':'<div class="empty">Set up a recurring task for this Sapi.</div>');
}
function taskCard(t){const a=agent(t.agent);return `<article class="task-card"><button class="task-open" data-task="${esc(t.id)}"><div class="task-card-top"><span class="tag ${t.status==='Queued'?'gray':t.status==='In progress'?'amber':''}">${t.status==='Done'?'✓ ':t.status==='In progress'?'◌ ':''}${esc(t.status)}</span><span class="muted">↗</span></div><h3>${esc(t.title)}</h3><p>${esc(t.description)}</p>${t.status==='In progress'?`<div class="progress-track" role="progressbar" aria-label="Task progress" aria-valuenow="${t.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${t.progress}%"></span></div>`:''}</button><div class="task-card-bottom">${avatar(a,'mini')} ${mention(a.id)}<span class="tag gray">${esc(t.case || (t.status==='Done'?'Completed':'Assigned work'))}</span></div></article>`;}
function renderTabs(){syncWorkspace();const host=$('#browser-tabs');host.innerHTML=state.tabs.map(t=>`<div class="workspace-tab ${t.id===state.activeTab?'active':''}" draggable="true" data-drag-tab="${esc(t.id)}"><button class="tab-select" data-tab="${esc(t.id)}" aria-pressed="${t.id===state.activeTab}"><span class="tab-icon">${tabTypes[t.type]?.[0]??'↗'}</span>${esc(t.title)}</button><button class="tab-close" data-close-tab="${esc(t.id)}" aria-label="Close ${esc(t.title)}">×</button></div>`).join('');
  $$('[data-drag-tab]').forEach(el=>{el.addEventListener('dragstart',e=>{dragId=el.dataset.dragTab;e.dataTransfer.setData('text/plain',dragId);e.dataTransfer.effectAllowed='move';});el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',e=>{e.preventDefault();const target=el.dataset.dragTab;const from=state.tabs.findIndex(t=>t.id===dragId),to=state.tabs.findIndex(t=>t.id===target);if(from<0||to<0)return;state.tabs.splice(to,0,state.tabs.splice(from,1)[0]);renderTabs();save();});el.addEventListener('dblclick',e=>{if(!e.target.closest('[data-close-tab]'))tabSettings(el.dataset.dragTab);});});
}
function openTab(type='blank',title,extra={}){
  syncWorkspace();
  const t={id:uid(),type,title:title||tabTypes[type]?.[1]||'New tab',...extra};
  state.tabs.push(t);state.activeTab=t.id;state.panes.workspace=true;
  renderPanes();renderTabs();renderWorkspace();save();
}
function renderWorkspace(){
  syncWorkspace();
  $('#workspace-owner').innerHTML=`${mention(workspaceOwner)}<span>’s workspace</span>`;
  const t=state.tabs.find(t=>t.id===state.activeTab),host=$('#workspace-content');
  $('#browser-address-form').hidden=!t;
  $('#browser-address').value=t?.type==='custom'?t.url:t?.type==='html'?'HTML document':'';
  $('#open-page').hidden=t?.type!=='custom';
  if(t?.type==='custom')$('#open-page').href=t.url;else $('#open-page').removeAttribute('href');
  storeWorkspace();
  const liveIds=new Set(Object.values(state.workspaces).flatMap(ws=>ws.tabs.map(t=>t.id)).concat(state.tabs.map(t=>t.id)));
  for(const [id,entry] of browserFrames)if(!liveIds.has(id)){entry.frame.remove();browserFrames.delete(id);}
  for(const entry of browserFrames.values())entry.frame.hidden=true;
  if(!t)return;
  const signature=JSON.stringify([t.type,t.url,t.html]);
  let entry=browserFrames.get(t.id);
  if(!entry||entry.signature!==signature){
    entry?.frame.remove();
    const frame=document.createElement('iframe');
    frame.className='workspace-browser';
    // Guest scripts run in an opaque origin, separated from app data and controls.
    frame.setAttribute('sandbox','allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads');
    frame.referrerPolicy='no-referrer';
    if(t.type==='custom'&&safeUrl(t.url))frame.src=safeUrl(t.url);
    else if(t.type==='html')frame.srcdoc=t.html||'';
    else frame.srcdoc='<!doctype html><html><head><meta name="color-scheme" content="light dark"></head><body></body></html>';
    entry={frame,signature};browserFrames.set(t.id,entry);host.append(frame);
  }
  entry.frame.title=t.title;entry.frame.hidden=false;
}
function safeUrl(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.href:null;}catch{return null;}}
function addTabDialog(){modal('Add tab',`<form id="custom-tab-form" class="form-stack"><label>Tab name<input name="title" placeholder="New tab" maxlength="48"></label><label>Website URL<input name="url" type="url" placeholder="https://…"></label><label>Or paste HTML<textarea name="html" aria-label="HTML source" placeholder="<!doctype html>" rows="5"></textarea></label><button type="submit" class="button primary">Add tab</button></form>`);}
function tabSettings(id){const t=state.tabs.find(t=>t.id===id);if(!t)return;modal('Tab settings',`<form class="form-stack" id="tab-settings-form" data-id="${esc(id)}"><label>Tab name<input name="title" value="${esc(t.title)}" maxlength="48" required></label><label>Website URL<input name="url" type="url" value="${esc(t.url||'')}" placeholder="https://…"></label><label>HTML source<textarea name="html" rows="5">${esc(t.html||'')}</textarea></label><button class="button primary" type="submit">Save tab</button></form><div class="modal-actions"><button class="button" data-move-tab="left" data-id="${esc(id)}">← Move left</button><button class="button" data-move-tab="right" data-id="${esc(id)}">Move right →</button><button class="button danger" data-close-tab="${esc(id)}">Close tab</button></div>`);}
function computerDialog(){const c=state.computer;modal('Shared computer',`<div class="settings-row"><span>${c.owner?`${mention(c.owner)} · ${c.paused?'Paused':'In use'}`:'Available'}</span><span class="tag">${c.owner?'Locked':'Free'}</span></div><div class="modal-actions"><button class="button primary" data-action="take-control">${c.owner==='you'?'Release control':'Take control'}</button><button class="button" data-action="pause-computer">${c.paused?'Resume':'Pause'}</button><button class="button" data-action="handoff" ${c.queue.length?'':'disabled'}>Hand off →</button></div><div class="subheading"><h3>Queue</h3><button class="button" data-action="join-queue">＋</button></div>${c.queue.map(id=>`<div class="settings-row">${avatar(agent(id),'mini')}${mention(id)}<button class="icon-button" data-remove-queue="${esc(id)}" aria-label="Remove ${esc(agent(id).name)} from queue">×</button></div>`).join('')}`);}
function autonomyDialog(){modal('Autonomy',`<p>Sapis work autonomously by default. Shared computer access always belongs to one controller at a time.</p>${[['auto','✦','Autonomous','Agents complete demo tasks and pass the computer lock on their own.'],['assist','◇','Assisted','Agents prepare work. You choose when each demo task runs.'],['paused','Ⅱ','Pause the team','Stop new agent actions. Keep your workspace and computer lock.']].map(([mode,icon,title,desc])=>`<button class="auto-choice ${state.mode===mode?'selected':''}" data-mode="${mode}"><span>${icon}</span><span><strong>${title}</strong><small>${desc}</small></span></button>`).join('')}<p class="form-hint" style="margin-top:18px">You can also adjust autonomy for each Sapi in its settings.</p>`);}
function agentSettings(){const a=selected();modal(`${a.name} settings`,`<div class="agent-profile">${avatar(a)}<div><strong>${esc(a.role)}</strong><p class="form-hint" style="margin-top:5px">${isGroup(a)?'Group · Voronoi avatar':'Individual Sapi'} · ${a.status==='idle'?'Standing by':'Available'}</p></div></div><form id="agent-settings-form" class="form-stack"><label>Name<input name="name" value="${esc(a.name)}" required maxlength="24"></label><label>Role<input name="role" value="${esc(a.role)}" required maxlength="60"></label><label>Autonomy<select name="autonomy"><option value="auto" ${a.autonomy==='auto'?'selected':''}>Autonomous — execute and report</option><option value="assist" ${a.autonomy==='assist'?'selected':''}>Assisted — prepare, then wait</option></select></label><button class="button primary" type="submit">Save Sapi</button></form>`,`SAPI / ${a.name.toUpperCase()}`);}
function addAgent(){modal('Add agent',`<form id="add-agent-form" class="form-stack"><div class="form-row"><label>Name<input name="name" required placeholder="e.g. Nova" maxlength="24"></label><label>Role<input name="role" required placeholder="e.g. Product strategist" maxlength="60"></label></div><div class="form-row"><label>Type<select name="kind"><option value="sapi">Sapi</option><option value="group">Group</option></select></label><label>Personality<select name="face"><option value="◕‿◕">(◕‿◕) Curious</option><option value="◠‿◠">(◠‿◠) Calm</option><option value="•̀ᴗ•́">(•̀ᴗ•́) Focused</option><option value="≧▽≦">(≧▽≦) Delighted</option></select></label></div><label>Avatar color<select name="color"><option value="#fdd997">Golden haze</option><option value="#f7d6d1">Rosewater</option><option value="#c9f3f1">Ice aqua</option><option value="#dbd0f7">Lavender</option><option value="#d8e5f4">Pale sky blue</option></select></label><p class="form-hint">Starts autonomous. You can adjust this anytime.</p><button type="submit" class="button primary">＋ Add agent</button></form>`);}
function newTask(){modal('New task',`<form id="new-task-form" class="form-stack"><label>Task<input name="title" required placeholder="What needs to get done?" maxlength="100"></label><label>Context<textarea name="description" placeholder="The details that will help your Sapi…" style="min-height:95px"></textarea></label><label>Assign to<select name="agent">${state.agents.map(a=>`<option value="${a.id}" ${a.id===state.selected?'selected':''}>${esc(a.name)} — ${esc(a.role)}</option>`).join('')}</select></label><button type="submit" class="button primary">Create task ↗</button></form>`);}
function taskDetails(id){const t=state.tasks.find(t=>t.id===id);if(!t)return;modal(t.title,`<p>${esc(t.description)}</p><div class="settings-row">${avatar(agent(t.agent),'mini')}<span>${mention(t.agent)}</span><span class="tag ${t.status==='In progress'?'amber':''}">${esc(t.status)}</span></div><p class="form-hint" style="margin-top:15px">Run the demo to simulate execution, generate a progress update, and record the result in the agent log.</p><div class="modal-actions"><button class="button" data-task-status="Queued" data-id="${t.id}">Queue</button><button class="button" data-task-status="Done" data-id="${t.id}">Mark done</button><button class="button primary" data-run-task="${t.id}" ${t.status==='Done'?'disabled':''}>▷ Run demo</button></div>`);}
function scheduleDialog(id){const s=state.schedules.find(x=>x.id===id);modal(s?'Edit schedule':'New schedule',`<form id="schedule-form" data-id="${s?.id||''}" class="form-stack"><label>Name<input name="title" value="${esc(s?.title||'')}" placeholder="e.g. Morning team briefing" required maxlength="80"></label><label>Repeat<select name="frequency">${['Every weekday at 09:00','Every day at 18:00','Every 2 hours','Every Monday at 10:00'].map(f=>`<option ${s?.frequency===f?'selected':''}>${f}</option>`).join('')}</select></label><label>What should ${esc(selected().name)} do?<textarea name="prompt" required placeholder="Summarize team progress and next steps…" style="min-height:100px">${esc(s?.prompt||'')}</textarea></label><button type="submit" class="button primary">${s?'Save changes':'Create schedule'}</button></form>${s?`<div class="modal-actions"><button class="button danger" data-delete-schedule="${s.id}">Delete schedule</button></div>`:''}`);}
function joinQueue(){const available=state.agents.filter(a=>a.id!==state.computer.owner&&!state.computer.queue.includes(a.id));modal('Computer queue',`<p>One Sapi at the controls. Everyone else has a place in line.</p>${available.map(a=>`<button class="auto-choice" data-queue-agent="${a.id}">${avatar(a)}<span><strong>${esc(a.name)}</strong><small>${esc(a.role)}</small></span><span style="margin-left:auto">＋</span></button>`).join('')||'<div class="empty">The whole team is already in line.</div>'}`);}
function handoff(auto=false){const c=state.computer;if(!c.queue.length){if(auto&&c.owner){c.lastUsed=c.owner;c.owner=null;render();}return false;}const old=c.owner;c.lastUsed=old||c.lastUsed;c.owner=c.queue.shift();c.paused=false;c.completed++;agent(c.owner).status='busy';if(old&&old!=='you')agent(old).status='online';log(c.owner,'Acquired team computer',`${auto?'Automatic handoff':'Control handed off'} from ${old==='you'?'you':old?agent(old).name:'the available pool'}. Exclusive lock granted.`);if(old&&old!=='you')log(old,'Released team computer',`Lock passed to ${agent(c.owner).name}.`);render();toast(`${agent(c.owner).name} now has the computer lock.`);return true;}
function canRun(agentId){if(state.mode==='paused'){toast('The team is paused. Resume it from the autonomy menu.');return false;}if(pending.has(agentId)){toast(`${agent(agentId).name} is already working on a demo task.`);return false;}return true;}
function runTask(id){const t=state.tasks.find(t=>t.id===id);if(!t||!canRun(t.agent))return;closeModal();t.status='In progress';t.progress=35;pending.add(t.agent);log(t.agent,'Task started',t.title);render();toast(`${agent(t.agent).name} is running the demo…`);setTimeout(()=>{pending.delete(t.agent);if(state.mode==='paused'){t.status='Queued';t.progress=0;log(t.agent,'Task paused',`${t.title} returned to the queue.`);render();return;}t.status='Done';t.progress=100;log(t.agent,'Task completed',`${t.title} · simulated execution.`);appendMessage(t.agent,{role:'assistant',time:now(),text:`Done: ${t.title}. I’ve recorded the result in my activity log and updated the task board.`,artifact:t.id==='pilot'});if(state.computer.owner===t.agent&&!state.computer.paused)handoff(true);else render();toast(`${t.title} — complete.`);},1600);}
function sendChat(value){const text=value.trim();if(!text)return;const id=state.selected;appendMessage(id,{role:'user',time:now(),text:text+(state.attachment?'\n\nAttached: Meeting notes.txt':'')});state.attachment=false;$('#message-input').value='';renderConversation();save();$('#conversation-body').scrollTop=$('#conversation-body').scrollHeight;
  if(state.mode==='paused'){appendMessage(id,{role:'assistant',time:now(),text:'I have your message. The team is paused, so I’ll wait here. Resume the team and send me the task when you’re ready.'});renderConversation();save();return;}
  if(pending.has(id)){toast('Message saved. This Sapi is finishing its current demo action.');return;}
  pending.add(id);renderConversation();$('#conversation-body').scrollTop=$('#conversation-body').scrollHeight;
  setTimeout(()=>{pending.delete(id);let reply,artifact=false;
    if(state.mode==='paused')reply='The team paused before I finished. Your message is saved; send it again when we’re ready to continue.';
    else if(/next|status|update|progress|report/i.test(text)){const tasks=state.tasks.filter(t=>t.agent===id&&t.status!=='Done');reply=`Here’s where things stand: ${state.tasks.filter(t=>t.agent===id&&t.status==='Done').length} task(s) complete, ${tasks.length} still in motion.\n\n${tasks.length?tasks.map((t,i)=>`${i+1}. ${t.title} — ${t.status.toLowerCase()}.`).join('\n'):'My plate is clear. Ready for the next thing.'}`;log(id,'Progress reviewed','Summarized task board and shared next steps.');}
    else if(/computer|control|lock/i.test(text)){if(state.computer.owner===id)reply='I already hold the computer lock. The rest of the team can observe, and I’ll pass control when I finish.';else{if(!state.computer.queue.includes(id))state.computer.queue.push(id);reply=`I’ve joined the computer queue at position ${state.computer.queue.indexOf(id)+1}. I’ll wait for the current owner to hand off the lock.`;log(id,'Joined computer queue','Requested exclusive computer access.');}computerDialog();}
    else if(/brief|document|kickoff/i.test(text)){reply='The kickoff brief is attached. Its browser tab is ready for generated HTML.';artifact=true;openTab('blank','Kickoff brief');log(id,'Opened kickoff brief','Artifact is available in the workspace.');}
    else{const t={id:uid(),agent:id,title:text.length>70?text.slice(0,67)+'…':text,description:'Created from your conversation. Demo execution is simulated.',status:'Queued',progress:0};state.tasks.push(t);const autonomous=state.mode==='auto'&&agent(id).autonomy==='auto';reply=autonomous?'I’ve turned that into a task and I’m running the demo now. You’ll see the result in Tasks and Log.':'I’ve prepared a task with that context. Open Tasks and choose “Run demo” when you want me to proceed.';log(id,'Task created from chat',t.title);if(autonomous)setTimeout(()=>runTask(t.id),500);}
    appendMessage(id,{role:'assistant',time:now(),text:reply,artifact});render();if(state.selected===id)$('#conversation-body').scrollTop=$('#conversation-body').scrollHeight;
  },1100);
}
function renderAttachment(){$('#attachment-chip').innerHTML=state.attachment?'<div class="attachment-chip">▤ Meeting notes.txt <span class="muted">Sample attachment</span><button type="button" data-action="remove-attachment" aria-label="Remove attachment">×</button></div>':'';}
function downloadDoc(){const blob=new Blob([`# ${state.document.title}\n## ${state.document.subtitle}\n\n${state.document.body}\n\n---\nSample data from the Sapi prototype.\n`],{type:'text/markdown'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='brightside-kickoff-brief.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('Kickoff brief exported as Markdown.');}
const actions={
  'agent-settings':agentSettings,'new-tab':addTabDialog,'new-task':newTask,'new-schedule':()=>scheduleDialog(),
  'open-brief':()=>openTab('blank','Kickoff brief'),
  'take-control':()=>{const c=state.computer;if(c.owner==='you'){c.lastUsed='you';c.owner=null;if(!handoff()){render();toast('Computer released. It is available to the team.');}}else{const old=c.owner;c.lastUsed=old||c.lastUsed;if(old&&!c.queue.includes(old))c.queue.unshift(old);if(old)log(old,'You took computer control','Agent input paused; returned to the front of the queue.');c.owner='you';c.paused=false;render();toast('You hold the lock. Agent input is blocked.');}},
  'pause-computer':()=>{if(state.mode==='paused'){toast('Resume the team from the autonomy menu first.');return;}state.computer.paused=!state.computer.paused;log(state.computer.owner&&state.computer.owner!=='you'?state.computer.owner:state.selected,state.computer.paused?'Computer paused':'Computer resumed','Exclusive lock retained by the current controller.');render();toast(state.computer.paused?'Computer paused. The lock is retained.':'Computer session resumed.');},
  'handoff':()=>{if(state.mode==='paused'){toast('Resume the team before handing control to an agent.');return;}handoff();},'join-queue':joinQueue,
  'remove-attachment':()=>{state.attachment=false;renderAttachment();save();},
  'download-document':downloadDoc,
  'edit-document':()=>modal('Edit document',`<form id="document-form" class="form-stack"><label>Document title<input name="title" value="${esc(state.document.title)}" required maxlength="100"></label><label>Subtitle<input name="subtitle" value="${esc(state.document.subtitle)}" required maxlength="100"></label><label>Content<textarea name="body" style="min-height:290px" required>${esc(state.document.body)}</textarea></label><button type="submit" class="button primary">Save document</button></form>`)
};
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.artifact){const artifact=fixture.artifacts.find(a=>a.id===d.artifact);if(!artifact)return;openChat(artifact.owner);syncWorkspace();const tab=state.tabs.find(t=>t.artifactId===artifact.id);if(tab){state.activeTab=tab.id;state.panes.workspace=true;render();}else openTab('html',artifact.title,{artifactId:artifact.id,html:artifact.html});return;}
  if(d.togglePane){state.panes[d.togglePane]=!state.panes[d.togglePane];renderPanes();save();return;}
  if(d.action){actions[d.action]?.();return;}
  if(d.mention){openChat(d.mention);return;}
  if(d.agent){openChat(d.agent);return;}
  if(d.scope){state.scope=d.scope;renderSidebar();save();return;}
  if(d.panel){state.panel=d.panel;renderConversation();save();return;}
  if(d.tab){state.activeTab=d.tab;renderTabs();renderWorkspace();save();return;}
  if(d.closeTab){const i=state.tabs.findIndex(t=>t.id===d.closeTab);if(i<0)return;state.tabs.splice(i,1);if(state.activeTab===d.closeTab)state.activeTab=state.tabs[Math.max(0,i-1)]?.id||null;closeModal();renderTabs();renderWorkspace();save();return;}
  if(d.newTabType){openTab(d.newTabType);closeModal();return;}
  if(d.editTab){tabSettings(d.editTab);return;}
  if(d.moveTab){const i=state.tabs.findIndex(t=>t.id===d.id),j=i+(d.moveTab==='left'?-1:1);if(j<0||j>=state.tabs.length){toast('That tab is already at the edge.');return;}[state.tabs[i],state.tabs[j]]=[state.tabs[j],state.tabs[i]];renderTabs();save();return;}
  if(d.suggest){sendChat(d.suggest);return;}
  if(d.mode){state.mode=d.mode;log(state.selected,'Team autonomy updated',`Workspace mode: ${d.mode}.`);closeModal();render();toast(d.mode==='paused'?'Team paused. Your work is saved.':`Team set to ${d.mode==='auto'?'autonomous':'assisted'}.`);return;}
  if(d.task){taskDetails(d.task);return;}
  if(d.runTask){runTask(d.runTask);return;}
  if(d.taskStatus){const t=state.tasks.find(t=>t.id===d.id);if(pending.has(t.agent)){toast('Wait for the current task execution to finish.');return;}t.status=d.taskStatus;t.progress=t.status==='Done'?100:0;log(t.agent,'Task updated',`${t.title}: ${t.status}`);closeModal();render();return;}
  if(d.toggleSchedule){const s=state.schedules.find(s=>s.id===d.toggleSchedule);s.enabled=!s.enabled;renderConversation();save();return;}
  if(d.editSchedule){scheduleDialog(d.editSchedule);return;}
  if(d.deleteSchedule){state.schedules=state.schedules.filter(s=>s.id!==d.deleteSchedule);closeModal();renderConversation();save();toast('Schedule removed.');return;}
  if(d.runSchedule){const s=state.schedules.find(s=>s.id===d.runSchedule);if(!canRun(s.agent))return;s.runs++;const t={id:uid(),agent:s.agent,title:s.title,description:s.prompt,status:'Queued',progress:0};state.tasks.push(t);log(s.agent,'Schedule triggered manually',s.frequency);runTask(t.id);return;}
  if(d.queueAgent){state.computer.queue.push(d.queueAgent);log(d.queueAgent,'Joined computer queue',`Position ${state.computer.queue.length}.`);closeModal();if(!state.computer.owner&&state.mode==='auto'&&!state.computer.paused)handoff(true);else render();toast(`${agent(d.queueAgent).name} added to the computer queue.`);return;}
  if(d.removeQueue){state.computer.queue=state.computer.queue.filter(id=>id!==d.removeQueue);log(d.removeQueue,'Left computer queue','Removed from the waiting list.');render();return;}
  if(d.connection){state.connections[d.connection]=!state.connections[d.connection];renderWorkspace();renderGlobal();save();toast(`${d.connection} ${state.connections[d.connection]?'connected':'disconnected'} in the demo.`);return;}
  if(d.pr){modal(`Pull request #${d.pr}`,`<p>${d.pr==='142'?'Adds single sign-on for Brightside pilot accounts. The authentication checks pass in this sample repository.':'This sample pull request has been merged into the main branch.'}</p><div class="execution-card"><div class="execution-title">✓ Checks complete <span>3 / 3</span></div><div class="execution-line">✓ Type checks passed</div><div class="execution-line">✓ Authentication tests passed</div><div class="execution-line">✓ Preview build ready</div></div><p class="form-hint">Static sample results for the clickable prototype.</p><div class="modal-actions"><button class="button primary" data-action="review-pr">Ask Aaron to review</button></div>`);return;}
});
actions['review-pr']=()=>{closeModal();state.selected='aaron';state.panel='chat';render();sendChat('Review the SSO pull request and summarize the changes');};
document.addEventListener('submit',e=>{const f=e.target;if(f.id==='chat-form'){e.preventDefault();sendChat($('#message-input').value);return;}if(!['custom-tab-form','tab-settings-form','agent-settings-form','add-agent-form','new-task-form','schedule-form','document-form','slack-form'].includes(f.id))return;e.preventDefault();const data=Object.fromEntries(new FormData(f));
  if(f.id==='custom-tab-form'||f.id==='tab-settings-form'){
    if(data.url.trim()&&data.html.trim()){toast('Use a website URL or HTML, one source per tab.');return;}
    const url=data.url.trim()?safeUrl(data.url.trim()):null;
    if(data.url.trim()&&!url){toast('Use an http:// or https:// website address.');return;}
    const type=url?'custom':data.html.trim()?'html':'blank';
    const title=data.title.trim()||(url?new URL(url).hostname:tabTypes[type][1]);
    if(f.id==='custom-tab-form')openTab(type,title,{url,html:data.html});
    else Object.assign(state.tabs.find(t=>t.id===f.dataset.id),{type,title,url,html:data.html});
  }
  if(f.id==='agent-settings-form'){Object.assign(selected(),{name:data.name.trim(),role:data.role.trim(),autonomy:data.autonomy});}
  if(f.id==='add-agent-form'){if(!data.name.trim()||!data.role.trim()){toast('Give your Sapi a name and a role.');return;}const a={...data,id:uid(),name:data.name.trim(),role:data.role.trim(),scope:data.kind==='group'?'team':'personal',status:'online',autonomy:'auto',preview:'Ready for tasks.'};state.agents.push(a);state.selected=a.id;state.scope='all';state.panel='chat';log(a.id,'Joined the workspace','Autonomous mode enabled.');toast(`${a.name} is part of the team.`);}
  if(f.id==='new-task-form'){if(!data.title.trim()){toast('Add a task title.');return;}const t={...data,id:uid(),status:'Queued',progress:0};state.tasks.push(t);log(t.agent,'Task assigned',t.title);state.selected=t.agent;state.panel='tasks';if(state.mode==='auto'&&agent(t.agent).autonomy==='auto'){setTimeout(()=>runTask(t.id),400);}else toast('Task added to the queue.');}
  if(f.id==='schedule-form'){const s=state.schedules.find(s=>s.id===f.dataset.id);if(s)Object.assign(s,data);else state.schedules.push({...data,id:uid(),agent:state.selected,enabled:true,runs:0});log(state.selected,s?'Schedule updated':'Schedule created',data.title);toast('Demo schedule saved. Try it with Run now.');}
  if(f.id==='document-form'){state.document={...data,edited:true};log('aaron','Kickoff brief edited','Your local changes have been saved.');toast('Document saved.');}
  if(f.id==='slack-form'){if(!state.connections.Slack){toast('Reconnect the demo Slack connection to post.');return;}if(!data.post.trim())return;state.posts.push({author:'Alex Parker',time:now(),text:data.post.trim()});log(state.selected,'Demo channel updated','You posted to #brightside-shared.');toast('Posted to the demo channel.');}
  closeModal();render();
});
$('#close-modal').addEventListener('click',closeModal);
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('#app-menu').addEventListener('click',()=>toast('Menu coming soon.'));
$('#browser-address-form').addEventListener('submit',e=>{
  e.preventDefault();const value=$('#browser-address').value.trim();
  const url=safeUrl(value);if(!url){toast('Use an http:// or https:// website address.');return;}
  const t=state.tabs.find(t=>t.id===state.activeTab);if(!t)return;
  Object.assign(t,{type:'custom',url,html:'',title:new URL(url).hostname});renderTabs();renderWorkspace();save();
});
$('#reload-page').addEventListener('click',()=>{const entry=browserFrames.get(state.activeTab);if(entry){entry.frame.remove();browserFrames.delete(state.activeTab);}renderWorkspace();});
$('#add-tab').addEventListener('click',addTabDialog);
$('#add-agent').addEventListener('click',addAgent);
$('#autonomy-button').addEventListener('click',autonomyDialog);
$('#resource-button').addEventListener('click',()=>computerDialog());

$('#agent-search').addEventListener('input',e=>{search=e.target.value;renderSidebar();});
$('#attach-button').addEventListener('click',()=>{state.attachment=true;renderAttachment();save();toast('Sample meeting notes attached.');});
$('#message-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendChat(e.target.value);}});
$('.wordmark').addEventListener('click',e=>{e.preventDefault();state.panes={sidebar:true,chat:true,workspace:true};renderPanes();save();});
$('#workspace-menu').addEventListener('click',()=>{if(state.activeTab)tabSettings(state.activeTab);else addTabDialog();});
$('#profile-button').addEventListener('click',()=>modal('Workspace settings',`<p>Alex Parker’s workspace. A local playground for your autonomous Sapi team.</p><div class="settings-row"><label>Workspace data<p>Agents, tabs, tasks, and edits save in this browser.</p></label><span class="tag">LOCAL</span></div><div class="settings-row"><label>Prototype version<p>01 · Shared computer & autonomous team</p></label></div><div class="modal-actions"><button class="button danger" id="reset-demo">Reset demo data</button><button class="button primary" data-action="close-settings">Done</button></div>`));
actions['close-settings']=closeModal;
document.addEventListener('click',e=>{if(e.target.id==='reset-demo'){if(pending.size){toast('Wait for active demo tasks to finish before resetting.');return;}state=structuredClone(seed);initializeRoster();workspaceOwner=state.selected;for(const e of browserFrames.values())e.frame.remove();browserFrames.clear();search='';$('#agent-search').value='';closeModal();render();toast('Fresh start. Demo data restored.');}});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('#modal').open){e.preventDefault();state.panes.sidebar=true;renderPanes();save();$('#agent-search').focus();}});
render();
