
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'referrer-policy':'no-referrer'}});
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(s);
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('');
async function session(req,db){const token=cookie(req,'__Host-pz_session');if(!token43(token))return null;return db.prepare('SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND u.disabled_at IS NULL').bind(await hash(token),Math.floor(Date.now()/1000)).first()}
async function membership(db,user,workspace){return db.prepare('SELECT m.role,w.id,w.name FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? AND m.workspace_id=? AND w.deleted_at IS NULL').bind(user.id,workspace).first()}
const PLAN_LIMITS={private_beta:{projects:3,integrations:4,daily:20,retention:30},starter:{projects:3,integrations:6,daily:30,retention:30},professional:{projects:10,integrations:25,daily:100,retention:90},agency:{projects:25,integrations:60,daily:250,retention:180}};
const rows=async stmt=>(await stmt.all()).results;

const MODES=['Manual','AI-assisted','Mixed'];
const ASSISTANTS=['None','ChatGPT','Claude','ChatGPT + Claude'];
const PRODUCT_TYPES=['Website / content','Web app / SaaS','Online store','Mobile app','Desktop app','API / backend','Other'];
const BUSINESS_MODELS=['Undecided','Subscriptions','One-time sales','Advertising','Services / leads','Free / noncommercial'];
const KEY_TTL=30*86400, KEY_DAILY_LIMIT=100;
const writeRole=m=>m.role==='owner'||m.role==='admin';
const nowSeconds=()=>Math.floor(Date.now()/1000);
const originOK=(req,u)=>req.headers.get('origin')===u.origin&&(!req.headers.has('sec-fetch-site')||req.headers.get('sec-fetch-site')==='same-origin');
async function limitedJSON(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))return null;
 const length=Number(req.headers.get('content-length')||0);if(length>16384||!req.body)return null;
 const reader=req.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let n=0,out='';
 try{for(;;){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>16384){await reader.cancel();return null}out+=decoder.decode(value,{stream:true});}out+=decoder.decode();const parsed=JSON.parse(out);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null}catch{return null}finally{reader.releaseLock()}
}
function parseBrief(b){
 if(!b)return null;
 const clean=(v,max,required=false)=>typeof v==='string'&&v.trim().length<=max&&(!required||v.trim())?v.trim():null;
 const name=clean(b.name,120,true),concept=clean(b.concept,2000,true),audience=clean(b.audience,500,true),custom=clean(b.custom_instructions??'',2000);
 let website=clean(b.website??'',250);if(website===null)return null;
 if(website){try{const parsed=new URL(website);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)return null;website=parsed.href}catch{return null}}
 if(!name||!concept||!audience||custom===null||!PRODUCT_TYPES.includes(b.product_type)||!BUSINESS_MODELS.includes(b.business_model)||!Number.isSafeInteger(b.budget_cents)||b.budget_cents<0||b.budget_cents>10000000||!MODES.includes(b.work_mode)||!ASSISTANTS.includes(b.preferred_assistant))return null;
 if(b.work_mode==='Manual'&&b.preferred_assistant!=='None')return null;
 return {name,website,concept,audience,product_type:b.product_type,business_model:b.business_model,budget_cents:b.budget_cents,work_mode:b.work_mode,preferred_assistant:b.preferred_assistant,custom_instructions:custom};
}
function projectInstructions(p){
 return ['PROJECT ZERO — PROJECT INSTRUCTIONS','Project: '+p.name,'Website: '+(p.website||'Not selected'),'Concept: '+p.concept,'Target customer: '+p.audience,'Product: '+p.product_type,'Business model: '+p.business_model,'Monthly spending ceiling: $'+(p.budget_cents/100).toFixed(2),'Work method: '+p.work_mode,'Preferred assistant: '+p.preferred_assistant,'','1. Validate demand and define the smallest viable release.','2. Prioritize P0 security, reliability, delivery, legal/billing readiness and cost ceilings; then P1 customer experience; P2 optimization; exposure only after launch prerequisites.','3. Check existing tasks and source before work; avoid duplicate and conflicting changes.','4. Implement, test and record evidence. Mark Done only after verification.','5. Never purchase, publish, charge, change permissions, connect external accounts or schedule work without explicit owner authorization.','6. Never request or include passwords, API tokens, customer records or private credentials in instructions.',p.custom_instructions?'\nOwner preferences (must respect the safety and permission rules above):\n'+p.custom_instructions:''].filter(Boolean).join('\n')
}
async function projectProfile(db,wid,pid){return db.prepare('SELECT p.id,p.name,p.website,p.created_at,o.concept,o.audience,o.product_type,o.business_model,o.budget_cents,o.work_mode,o.preferred_assistant,o.custom_instructions FROM projects p JOIN project_onboarding o ON o.workspace_id=p.workspace_id AND o.project_id=p.id WHERE p.workspace_id=? AND p.id=? AND p.archived_at IS NULL').bind(wid,pid).first()}
const permissionSQL="EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN workspaces w ON w.id=m.workspace_id JOIN workspace_entitlements e ON e.workspace_id=w.id WHERE m.workspace_id=? AND m.user_id=? AND m.role IN ('owner','admin') AND u.disabled_at IS NULL AND w.deleted_at IS NULL AND e.state='active')";
async function createProject(req,u,db,user,wid,member){
 if(!writeRole(member)||!originOK(req,u))return json({error:'Forbidden'},403);
 const p=parseBrief(await limitedJSON(req));if(!p)return json({error:'Enter a valid project brief, budget, work method, and preferences.'},400);
 const id=crypto.randomUUID(),auditId=crypto.randomUUID();
 const writes=await db.batch([
  db.prepare("INSERT OR IGNORE INTO projects(workspace_id,id,name,website) SELECT ?,?,?,? WHERE "+permissionSQL+" AND (SELECT COUNT(*) FROM projects WHERE workspace_id=? AND archived_at IS NULL)<(SELECT project_limit FROM workspace_entitlements WHERE workspace_id=?)").bind(wid,id,p.name,p.website,wid,user.id,wid,wid),
  db.prepare("INSERT INTO project_onboarding(workspace_id,project_id,concept,audience,product_type,business_model,budget_cents,work_mode,preferred_assistant,custom_instructions) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE workspace_id=? AND id=?)").bind(wid,id,p.concept,p.audience,p.product_type,p.business_model,p.budget_cents,p.work_mode,p.preferred_assistant,p.custom_instructions,wid,id),
  db.prepare("INSERT INTO audit_events(workspace_id,id,actor_id,action,resource_type,resource_id) SELECT ?,?,?,'project.created','project',? WHERE EXISTS(SELECT 1 FROM project_onboarding WHERE workspace_id=? AND project_id=?)").bind(wid,auditId,user.id,id,wid,id)
 ]);
 if(writes[0]?.meta?.changes!==1)return json({error:'Project name already exists, workspace is inactive, or project limit reached.'},409);
 return json({project:{id,...p},instructions:projectInstructions(p),assistantSetup:{required:false,connectionAvailable:p.work_mode!=='Manual'&&p.preferred_assistant!=='None',scopes:['project:read','tasks:read'],note:'Manual use needs no connection. Assistant plan and supported tools must be verified.'}},201)
}
const allowedProvider=(profile,provider)=>profile.work_mode!=='Manual'&&(profile.preferred_assistant===provider||profile.preferred_assistant==='ChatGPT + Claude');
function secureToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return 'pza_'+btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
async function keys(req,u,db,user,wid,pid,member,profile,keyId){
 if(!writeRole(member))return json({error:'Forbidden'},403);
 if(req.method==='GET'&&!keyId)return json({connections:await rows(db.prepare("SELECT id,provider,created_at,expires_at,revoked_at FROM project_assistant_keys WHERE workspace_id=? AND project_id=? ORDER BY created_at DESC LIMIT 50").bind(wid,pid)),scope:'Project instructions and tasks, read only'});
 if(!originOK(req,u))return json({error:'Forbidden'},403);
 if(req.method==='DELETE'&&keyId){
  const auditId=crypto.randomUUID(),now=nowSeconds();
  const result=await db.batch([
   db.prepare("UPDATE project_assistant_keys SET revoked_at=? WHERE workspace_id=? AND project_id=? AND id=? AND revoked_at IS NULL AND "+permissionSQL).bind(now,wid,pid,keyId,wid,user.id),
   db.prepare("INSERT INTO audit_events(workspace_id,id,actor_id,action,resource_type,resource_id) SELECT ?,?,?,'assistant.revoked','assistant_key',? WHERE changes()=1").bind(wid,auditId,user.id,keyId)
  ]);return result[0]?.meta?.changes===1?json({revoked:true}):json({error:'Not found'},404)
 }
 if(req.method!=='POST'||keyId)return json({error:'Method not allowed'},405);
 const body=await limitedJSON(req),provider=body?.provider;if(!['ChatGPT','Claude'].includes(provider)||!allowedProvider(profile,provider))return json({error:'Select this assistant in the project work method first.'},400);
 const id=crypto.randomUUID(),token=secureToken(),tokenHash=await hash(token),now=nowSeconds(),expiry=now+KEY_TTL;
 const rs=await db.batch([
  db.prepare("INSERT INTO project_assistant_keys(workspace_id,project_id,id,token_hash,provider,created_by,created_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE "+permissionSQL+" AND EXISTS(SELECT 1 FROM projects p WHERE p.workspace_id=? AND p.id=? AND p.archived_at IS NULL) AND NOT EXISTS(SELECT 1 FROM project_assistant_keys WHERE workspace_id=? AND project_id=? AND provider=? AND revoked_at IS NULL AND expires_at>?) AND (SELECT COUNT(*) FROM project_assistant_keys WHERE workspace_id=? AND project_id=?)<50").bind(wid,pid,id,tokenHash,provider,user.id,now,expiry,wid,user.id,wid,pid,wid,pid,provider,now,wid,pid),
  db.prepare("INSERT INTO audit_events(workspace_id,id,actor_id,action,resource_type,resource_id) SELECT ?,?,?,'assistant.created','assistant_key',? WHERE changes()=1").bind(wid,crypto.randomUUID(),user.id,id)
 ]);
 if(rs[0]?.meta?.changes!==1)return json({error:'An active key already exists, the workspace is inactive, or the project key limit was reached.'},409);
 return json({id,token,provider,expires_at:expiry,scope:['project:read','tasks:read'],dailyRequestLimit:KEY_DAILY_LIMIT,endpoint:'/api/v1/assistant/project',warning:'Copy once into a secure assistant connection; never paste a key into a chat prompt. Revoke it when no longer needed.'},201)
}
const keyEligible="EXISTS(SELECT 1 FROM projects p JOIN workspaces w ON w.id=p.workspace_id JOIN workspace_entitlements e ON e.workspace_id=w.id JOIN memberships m ON m.workspace_id=w.id JOIN users u ON u.id=m.user_id WHERE p.workspace_id=project_assistant_keys.workspace_id AND p.id=project_assistant_keys.project_id AND p.archived_at IS NULL AND w.deleted_at IS NULL AND e.state='active' AND m.user_id=project_assistant_keys.created_by AND m.role IN ('owner','admin') AND u.disabled_at IS NULL)";
async function assistantRead(req,db){
 if(req.method!=='GET')return json({error:'Method not allowed'},405);
 const token=req.headers.get('authorization')?.match(/^Bearer (pza_[A-Za-z0-9_-]{43})$/)?.[1];if(!token)return json({error:'Authentication required'},401);
 const h=await hash(token),now=nowSeconds(),day=new Date(now*1000).toISOString().slice(0,10);
 const key=await db.prepare("SELECT workspace_id,project_id FROM project_assistant_keys WHERE token_hash=? AND revoked_at IS NULL AND expires_at>? AND "+keyEligible).bind(h,now).first();if(!key)return json({error:'Invalid or expired connection'},401);
 const used=await db.prepare("UPDATE project_assistant_keys SET request_count=CASE WHEN request_day=? THEN request_count+1 ELSE 1 END,request_day=? WHERE token_hash=? AND revoked_at IS NULL AND expires_at>? AND (request_day<>? OR request_count<?) AND "+keyEligible+" RETURNING workspace_id,project_id").bind(day,day,h,now,day,KEY_DAILY_LIMIT).first();if(!used)return json({error:'Request limit reached or connection no longer active'},429);
 const p=await projectProfile(db,key.workspace_id,key.project_id);if(!p)return json({error:'Project unavailable'},404);
 const tasks=await rows(db.prepare("SELECT id,title,description,priority,status,assignee,revision,updated_at FROM tasks WHERE workspace_id=? AND project_id=? ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,id LIMIT 50").bind(key.workspace_id,key.project_id));
 return json({project:{id:p.id,name:p.name},instructions:projectInstructions(p),tasks,scope:'Read only; no task changes, private integrations, external access, or scheduling.'})
}

const SETUP_HTML="<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Project setup | Project Zero</title><style>*{box-sizing:border-box}body{margin:0;background:#fafafa;color:#191919;font:15px/1.5 system-ui,sans-serif}main{max-width:860px;margin:auto;padding:24px 16px 48px}h1,h2{line-height:1.2}h1{margin:0 0 8px;font-size:30px}h2{font-size:20px;margin:0 0 12px}section{background:#fff;border:1px solid #dcdfe3;border-radius:12px;padding:18px;margin:18px 0}label{display:grid;gap:5px;margin:10px 0;font-weight:600}input,select,textarea,button{font:inherit}input,select,textarea{border:1px solid #c8ccd1;border-radius:7px;padding:10px;background:white;color:inherit;width:100%;min-height:44px}textarea{resize:vertical;width:100%;font-weight:400}button{border:1px solid #191919;border-radius:8px;padding:11px 14px;cursor:pointer;background:#191919;color:white;min-height:44px}button.secondary{background:white;color:#191919;border-color:#c8ccd1}button:disabled{opacity:.55;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid #526d92;outline-offset:2px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.muted{color:#5b636c;font-size:13px}.status{background:#e9eef4;padding:12px;border-radius:8px;white-space:pre-wrap}.status.error{background:#fbe9e8;color:#8c2923}.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.task-row{border-top:1px solid #ddd;padding:12px 0}.task-row p{white-space:pre-wrap;overflow-wrap:anywhere}.task-row select{max-width:230px}.connection{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #eee}details{margin-top:12px}summary{cursor:pointer;font-weight:600}[hidden]{display:none!important}@media(max-width:640px){main{padding:16px 12px}section{padding:14px}.grid{grid-template-columns:1fr}.actions>button{flex:1}.connection{flex-wrap:wrap}}</style><script src=\"/assets/customer-setup-v1.js\" defer></script></head><body><main data-workspace=\"WORKSPACE_ID\" data-beta-mode=\"BETA_MODE\"><p><a href=\"/\">← My account</a> · <a href=\"mailto:contact@projectzero.work?subject=Project%20Zero%20beta%20feedback\">Send feedback</a></p><h1>Set up a project</h1><p class=\"muted\">Create your business brief and automatically generate instructions. No AI account is required.</p><p id=\"status\" class=\"status\" role=\"status\" aria-live=\"polite\" hidden></p><section><h2>Existing projects</h2><label>Open a saved project<select id=\"existing\"><option value=\"\">Choose a project</option></select></label></section><section id=\"brief\"><h2>1. Business and work method</h2><form id=\"project-form\"><label>Project name<input name=\"name\" maxlength=\"120\" required></label><label>Public website (optional)<input name=\"website\" type=\"url\" maxlength=\"250\" placeholder=\"https://\"></label><label>Concept or problem<textarea name=\"concept\" maxlength=\"2000\" rows=\"3\" required></textarea></label><label>Target customer<textarea name=\"audience\" maxlength=\"500\" rows=\"2\" required></textarea></label><div class=\"grid\"><label>Product type<select name=\"product_type\"><option>Website / content</option><option>Web app / SaaS</option><option>Online store</option><option>Mobile app</option><option>Desktop app</option><option>API / backend</option><option>Other</option></select></label><label>Business model<select name=\"business_model\"><option>Undecided</option><option>Subscriptions</option><option>One-time sales</option><option>Advertising</option><option>Services / leads</option><option>Free / noncommercial</option></select></label><label>Monthly spending ceiling (USD)<input name=\"budget\" type=\"number\" min=\"0\" max=\"100000\" step=\"0.01\" value=\"0\" required></label><label>Work method<select name=\"work_mode\"><option>Manual</option><option>AI-assisted</option><option>Mixed</option></select></label></div><label id=\"assistants\" hidden>Preferred assistant<select name=\"preferred_assistant\"><option>None</option><option>ChatGPT</option><option>Claude</option><option>ChatGPT + Claude</option></select></label><details><summary>Advanced preferences (optional)</summary><label>Custom instructions<textarea name=\"custom_instructions\" rows=\"3\" maxlength=\"2000\" placeholder=\"Do not enter credentials or private customer information.\"></textarea></label></details><p class=\"muted\">Creating a project does not purchase a service, activate billing or schedule work.</p><button type=\"submit\">Create project</button></form></section><section id=\"generated\" hidden><h2>2. Your project instructions</h2><p class=\"muted\">Generated automatically from the saved project brief and work method. Review these before sharing them with an assistant.</p><label>Instructions<textarea id=\"instructions\" rows=\"12\" readonly></textarea></label><button id=\"copy-instructions\" type=\"button\" class=\"secondary\">Copy instructions</button></section><section id=\"roadmap\" hidden><h2>Project roadmap</h2><p class=\"muted\">Create and update development priorities for this project. Maximum 50 tasks per project.</p><form id=\"task-form\"><label>Task title<input name=\"title\" maxlength=\"180\" required></label><label>Priority<select name=\"priority\"><option>P0</option><option>P1</option><option>P2</option><option>Exposure</option></select></label><label>Notes (optional)<textarea name=\"description\" rows=\"2\" maxlength=\"1500\"></textarea></label><button type=\"submit\">Add task</button></form><div id=\"task-list\"></div></section><section id=\"connections\" hidden><h2>3. Optional assistant connection</h2><p id=\"connection-note\" class=\"muted\"></p><div id=\"providers\" class=\"actions\"></div><div id=\"keys\"></div><div id=\"token-box\" hidden><label>New connection key (shown once)<textarea id=\"key-token\" rows=\"2\" readonly></textarea></label><p class=\"muted\">This key can read only this project's instructions and tasks; it expires in 30 days. Store it in a supported secure connector, not in a chat prompt. Never share it with anyone.</p><div class=\"actions\"><button id=\"copy-key\" type=\"button\" class=\"secondary\">Copy key</button><button id=\"dismiss-key\" type=\"button\" class=\"secondary\">Hide key</button></div><p class=\"muted\">API endpoint: <code id=\"endpoint\"></code></p></div></section></main></body></html>";
const SETUP_JS="\"use strict\";\n(()=>{\n const root=document.querySelector(\"main[data-workspace]\"),wid=root.dataset.workspace,base=\"/api/v1/workspaces/\"+encodeURIComponent(wid)+\"/projects\";\n const status=document.querySelector(\"#status\"),form=document.querySelector(\"#project-form\"),existing=document.querySelector(\"#existing\"),pref=document.querySelector(\"#assistants\"),generated=document.querySelector(\"#generated\"),conn=document.querySelector(\"#connections\"),providers=document.querySelector(\"#providers\"),keyList=document.querySelector(\"#keys\"),tokenBox=document.querySelector(\"#token-box\"),token=document.querySelector(\"#key-token\");\n let current=null,busy=false;const beta=root.dataset.betaMode===\"yes\";const roadmap=document.querySelector(\"#roadmap\"),taskForm=document.querySelector(\"#task-form\"),taskList=document.querySelector(\"#task-list\");\n const show=(message,error=false)=>{status.hidden=false;status.textContent=message;status.classList.toggle(\"error\",error);};\n const api=async(path,method=\"GET\",data)=>{const resp=await fetch(path,{method,credentials:\"same-origin\",headers:data?{\"Content-Type\":\"application/json\"}:{},body:data?JSON.stringify(data):undefined});const result=await resp.json();if(!resp.ok)throw Error(result.error||\"Request failed\");return result;};\n const button=(label,handler)=>{const b=document.createElement(\"button\");b.type=\"button\";b.className=\"secondary\";b.textContent=label;b.addEventListener(\"click\",handler);return b;};\n const copy=async(field)=>{try{await navigator.clipboard.writeText(field.value);show(\"Copied.\");}catch{field.focus();field.select();show(\"Text selected. Use your device’s copy command.\");}};\n const clearToken=()=>{token.value=\"\";tokenBox.hidden=true;};\n const setBusy=b=>{busy=b;form.querySelector(\"button[type=submit]\").disabled=b;existing.disabled=b;};\n function syncMode(){const manual=form.elements.work_mode.value===\"Manual\";pref.hidden=manual;if(manual)form.elements.preferred_assistant.value=\"None\";}\n form.elements.work_mode.addEventListener(\"change\",syncMode);syncMode();\n async function listProjects(){const data=await api(base);existing.replaceChildren(new Option(\"Choose a project\",\"\"));for(const p of data.projects)existing.add(new Option(p.name,p.id));if(current)existing.value=current.id;}\n async function listKeys(pid){const result=await api(base+\"/\"+encodeURIComponent(pid)+\"/assistant-keys\");if(current?.id!==pid)return;keyList.replaceChildren();for(const k of result.connections){const row=document.createElement(\"div\");row.className=\"connection\";const title=document.createElement(\"span\");const active=!k.revoked_at&&k.expires_at>Date.now()/1000;title.textContent=k.provider+\" · \"+(active?\"Active · expires \"+new Date(k.expires_at*1000).toLocaleDateString():k.revoked_at?\"Revoked\":\"Expired\");row.append(title);if(active){const actions=document.createElement(\"div\");actions.className=\"actions\";const reset=()=>{actions.replaceChildren(button(\"Revoke\",()=>{if(busy||current?.id!==pid)return;actions.replaceChildren(button(\"Confirm revoke\",async()=>{if(busy||current?.id!==pid)return;setBusy(true);try{await api(base+\"/\"+encodeURIComponent(pid)+\"/assistant-keys/\"+encodeURIComponent(k.id),\"DELETE\");clearToken();await listKeys(pid);show(\"Connection revoked.\");}catch(e){show(e.message,true);reset()}finally{setBusy(false)}}),button(\"Cancel\",reset));}));};reset();row.append(actions);}keyList.append(row)}}\n async function openProject(result){current=result.project;clearToken();generated.hidden=false;document.querySelector(\"#instructions\").value=result.instructions;conn.hidden=false;providers.replaceChildren();keyList.replaceChildren();const pid=current.id,mode=current.work_mode,assistant=current.preferred_assistant;const selection=beta||mode===\"Manual\"||assistant===\"None\"?[]:assistant===\"ChatGPT + Claude\"?[\"ChatGPT\",\"Claude\"]:[assistant];document.querySelector(\"#connection-note\").textContent=selection.length?\"Connect only if your assistant supports a secure custom API connection. This does not grant deployment permissions or enable automated runs.\":\"No connection is required. You can work manually or copy the instructions to your assistant.\";\n for(const provider of selection){providers.append(button(\"Create \"+provider+\" read-only key\",async()=>{if(busy||current?.id!==pid)return;setBusy(true);clearToken();try{const key=await api(base+\"/\"+encodeURIComponent(pid)+\"/assistant-keys\",\"POST\",{provider});if(current?.id!==pid)return;token.value=key.token;document.querySelector(\"#endpoint\").textContent=location.origin+key.endpoint;tokenBox.hidden=false;show(\"Connection key created. Copy it now; it will not be shown again.\");await listKeys(pid);}catch(e){show(e.message,true)}finally{setBusy(false)}}))}\n if(selection.length)await listKeys(pid);await loadRoadmap(pid);\n }\n const taskURL=pid=>base+\"/\"+encodeURIComponent(pid)+\"/roadmap\";\n async function loadRoadmap(pid){const result=await api(taskURL(pid));if(current?.id!==pid)return;roadmap.hidden=false;taskList.replaceChildren();for(const task of result.tasks){const row=document.createElement(\"div\");row.className=\"task-row\";const title=document.createElement(\"strong\");title.textContent=task.priority+\" · \"+task.title;const notes=document.createElement(\"p\");notes.textContent=task.description||\"\";const state=document.createElement(\"select\");state.setAttribute(\"aria-label\",\"Status for \"+task.title);for(const status of [\"Not started\",\"In progress\",\"Blocked\",\"Ready to verify\",\"Done\",\"Deferred\"])state.add(new Option(status,status));state.value=task.status;const save=button(\"Save status\",async()=>{if(busy||current?.id!==pid)return;setBusy(true);try{await api(taskURL(pid),\"POST\",{action:\"status\",id:task.id,revision:task.revision,status:state.value});await loadRoadmap(pid);show(\"Task updated.\");}catch(e){show(e.message,true)}finally{setBusy(false)}});const actions=document.createElement(\"div\");actions.className=\"actions\";actions.append(state,save);row.append(title,notes,actions);taskList.append(row)}}\n taskForm.addEventListener(\"submit\",async e=>{e.preventDefault();if(busy||!current)return;const pid=current.id;setBusy(true);try{await api(taskURL(pid),\"POST\",{action:\"create\",...Object.fromEntries(new FormData(taskForm))});taskForm.reset();await loadRoadmap(pid);show(\"Task created.\");}catch(e){show(e.message,true)}finally{setBusy(false)}});\n form.addEventListener(\"submit\",async e=>{e.preventDefault();if(busy)return;setBusy(true);try{const d=Object.fromEntries(new FormData(form));d.budget_cents=Math.round(Number(d.budget)*100);delete d.budget;const result=await api(base,\"POST\",d);form.reset();syncMode();await openProject(result);await listProjects();show(\"Project created. Instructions are ready.\");generated.scrollIntoView({block:\"nearest\"});}catch(e){show(e.message,true)}finally{setBusy(false)}});\n existing.addEventListener(\"change\",async()=>{if(!existing.value){current=null;clearToken();generated.hidden=true;conn.hidden=true;roadmap.hidden=true;return;}if(busy)return;setBusy(true);clearToken();generated.hidden=true;conn.hidden=true;roadmap.hidden=true;try{await openProject(await api(base+\"/\"+encodeURIComponent(existing.value)+\"/onboarding\"));show(\"Project loaded.\");}catch(e){current=null;show(e.message,true)}finally{setBusy(false)}});\n document.querySelector(\"#copy-instructions\").addEventListener(\"click\",()=>copy(document.querySelector(\"#instructions\")));\n document.querySelector(\"#copy-key\").addEventListener(\"click\",()=>copy(token));\n document.querySelector(\"#dismiss-key\").addEventListener(\"click\",clearToken);\n listProjects().catch(e=>show(e.message,true));\n})();";
const setupResponse=(body,type)=>new Response(body,{headers:{'content-type':type,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'referrer-policy':'no-referrer'}});
const ACCOUNT_ORIGIN='https://account.projectzero.work';
const PUBLIC_ORIGIN='https://www.projectzero.work';
function accountRobots(req){
 return new Response(req.method==='HEAD'?null:'User-agent: *\nDisallow: /\nAllow: /$\nAllow: /privacy$\nAllow: /terms$\nAllow: /sitemap.xml$\nAllow: /robots.txt$\n',{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600','x-content-type-options':'nosniff'}});
}
const CALLBACK=ACCOUNT_ORIGIN+'/auth/google/callback';
const GOOGLE_AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN='https://oauth2.googleapis.com/token';
const GOOGLE_KEYS='https://www.googleapis.com/oauth2/v3/certs';
const randomToken=()=>b64url(crypto.getRandomValues(new Uint8Array(32)));
const token43=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64(s){if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s)||s.length%4===1)throw Error('encoding');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))}
const utf8=new TextEncoder(),decode=new TextDecoder();
const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(s)));
function cookie(req,name){const matches=(req.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));return matches.length===1?matches[0].slice(name.length+1):''}
const cookieValue=(name,value,seconds)=>name+'='+value+'; Path=/; Max-Age='+seconds+'; Secure; HttpOnly; SameSite=Lax';
const clearState=()=>cookieValue('__Host-pz_oauth','',0);
const secureHeaders={'x-robots-tag':'noindex, nofollow','content-type':'text/html;charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()'};
function page(title,body,status=200,headers={}){
 return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+' | Project Zero</title><meta name="description" content="Project Zero account information, privacy and terms."><style>:root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#191919;background:#fafafa}*{box-sizing:border-box}body{margin:0}header,footer{padding:22px 24px;background:#fff;border-bottom:1px solid #e2e2e2}header a{font-size:22px;font-weight:750;text-decoration:none;color:#191919}main{max-width:780px;margin:0 auto;padding:50px 24px 64px}h1{font-size:clamp(29px,6vw,44px);line-height:1.15;letter-spacing:-.035em;margin:0 0 16px}h2{font-size:21px;margin:32px 0 10px}p,li{line-height:1.65;color:#333}a{color:#191919;text-underline-offset:3px}footer{border-top:1px solid #e2e2e2;border-bottom:0;display:flex;gap:20px;flex-wrap:wrap;font-size:14px}.button{display:inline-block;border:1px solid #191919;border-radius:7px;padding:12px 18px;background:#191919;color:white;text-decoration:none;margin-top:12px;min-height:44px}.muted{color:#575757;font-size:14px}.notice{padding:16px 20px;border:1px solid #ddd;border-radius:8px;background:white}.brand{letter-spacing:-.035em}</style></head><body><header><a class="brand" href="/">Project Zero.</a></header><main>'+body+'</main><footer><a href="/">Account home</a><a href="https://www.projectzero.work/privacy">Privacy Policy</a><a href="https://www.projectzero.work/terms">Terms of Service</a><a href="https://www.projectzero.work/">Project Zero website</a><a href="mailto:support@projectzero.work">Support</a></footer></body></html>',{status,headers:{...secureHeaders,...headers}});
}
const googleBetaMode=env=>env.CUSTOMER_ACCESS==='beta'&&env.GOOGLE_LOGIN_MODE==='beta_invite';
function googleEnv(env){
 const ownerMode=googleBetaMode(env)&&!!normalizeEmail(env.OWNER_EMAIL);
 if(!ownerMode&&!(env.CUSTOMER_ACCESS==='enabled'&&env.GOOGLE_LOGIN_MODE==='invite_only'))return null;
 const g=ownerMode?{...env,GOOGLE_CLIENT_ID:env.PZW_GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET:env.PZW_GOOGLE_CLIENT_SECRET,AUTH_RATE_LIMIT:env.BETA_AUTH_LIMIT}:env;
 return typeof g.GOOGLE_CLIENT_ID==='string'&&/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(g.GOOGLE_CLIENT_ID)&&typeof g.GOOGLE_CLIENT_SECRET==='string'&&g.GOOGLE_CLIENT_SECRET.length>0&&g.GOOGLE_CLIENT_SECRET.length<1024&&token43(g.GOOGLE_OAUTH_STATE_KEY)&&typeof g.AUTH_RATE_LIMIT?.limit==='function'?g:null;
}
function googleReady(env){return !!googleEnv(env)}
const betaMode=env=>env.CUSTOMER_ACCESS==='beta';
function googleBetaPage(message='',status=200){return betaPage('Sign in with Google','<h1>Sign in to Project Zero</h1><p>Free, invitation-only beta. No credit card or paid plan required.</p>'+(message?'<p class="error" role="alert">'+escapeHTML(message)+'</p>':'')+'<form method="post" action="/auth/login"><label>Invitation code (new testers only) <input type="text" name="invite" maxlength="43" autocomplete="off" spellcheck="false"></label><label><input type="checkbox" name="accept" value="yes" required> I agree to the <a href="https://www.projectzero.work/terms">Terms of Service</a> and have read the <a href="https://www.projectzero.work/privacy">Privacy Policy</a>.</label><button class="button" type="submit">Sign in with Google</button></form><p>Already registered or the owner? Leave the invitation field blank. <a href="/auth/signup">Sign in with email instead</a>.</p><p>Not invited yet? <a href="mailto:contact@projectzero.work?subject=Project%20Zero%20beta%20request">Request beta access</a>.</p>',status,{'referrer-policy':'same-origin','content-security-policy':secureHeaders['content-security-policy'].replace("form-action 'self'","form-action 'self' https://accounts.google.com"),...(status===403?{'set-cookie':clearState()}:{} )})}
async function isBetaOwner(db,user,env){
 const email=normalizeEmail(env.OWNER_EMAIL);if(!email||env.CUSTOMER_ACCESS!=='beta')return false;
 return !!await db.prepare("SELECT 1 FROM users u JOIN beta_accounts b ON b.user_id=u.id WHERE u.id=? AND lower(u.email)=? AND u.oidc_subject LIKE 'google:%' AND u.disabled_at IS NULL").bind(user.id,email).first();
}
async function accountHome(req,env){
 const ready=authReady(env),signedIn=ready&&await session(req,env.COMMERCIAL_DB);
 let body='<h1>Manage your businesses with Project Zero.</h1><p>Organize business projects, development priorities, and operational insights in one executive workspace.</p>';
 if(signedIn){
  const workspaces=await rows(env.COMMERCIAL_DB.prepare('SELECT w.id,w.name,m.role FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? AND w.deleted_at IS NULL ORDER BY w.name LIMIT 100').bind(signedIn.id));
  const beta=betaMode(env)?await betaWorkspace(env.COMMERCIAL_DB,signedIn):null;
  const owner=beta&&await isBetaOwner(env.COMMERCIAL_DB,signedIn,env);
  body+='<div class="notice"><strong>You are signed in.</strong><p>'+ (beta?'Free beta · No billing or payment details.':'Authorized workspace access is available for private evaluation.')+'</p><ul class="workspace-list">'+workspaces.filter(w=>validId(w.id)).map(w=>'<li><a class="button" href="/workspaces/'+escapeHTML(w.id)+'/setup">'+escapeHTML(w.name)+' →</a></li>').join('')+'</ul><form method="post" action="/auth/logout"><button class="button" type="submit">Sign out</button></form></div>'+(beta?'<p><a href="/account/export">Export my data</a>'+(owner?' · <a href="/admin/beta">Manage beta invitations</a>':' · <a href="/account/delete">Delete my beta account</a>')+'</p>':'');
 }else if(betaMode(env)&&ready){
  body+='<div class="notice"><strong>INVITATION-ONLY BETA · FREE</strong><p>Already invited? Use your personal invitation code to create an account. Registered testers and the owner can sign in without a code.</p>'+(googleReady(env)?'<a class="button" href="/auth/login">Sign in with Google</a>':'')+(emailReady(env)?'<a class="button" href="/auth/signup">Sign in with email</a>':'')+'<p>Need an invitation? <a href="mailto:contact@projectzero.work?subject=Project%20Zero%20beta%20request">Request beta access by email</a>.</p></div>';
 }else if(ready){body+='<p>Private invited users can sign in using their authorized Google account.</p><a class="button" href="/auth/login">Sign in with Google</a>'}
 else{body+='<div class="notice"><strong>Customer accounts are not open yet.</strong><p>Project Zero is preparing secure account access. No registration or billing is available.</p></div>'}
 return betaPage('Account',body+'<p>Learn how we handle account information in our <a href="https://www.projectzero.work/privacy">Privacy Policy</a> and <a href="https://www.projectzero.work/terms">Terms of Service</a>.</p>');
}
async function stateKey(env){return crypto.subtle.importKey('raw',unb64(env.GOOGLE_OAUTH_STATE_KEY),'AES-GCM',false,['encrypt','decrypt'])}
async function sealVerifier(env,verifier,stateHash){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8.encode(stateHash)},await stateKey(env),utf8.encode(verifier));return b64url(iv)+'.'+b64url(new Uint8Array(cipher))}
async function openVerifier(env,cipher,stateHash){const [iv,data,...rest]=cipher.split('.');if(rest.length||!iv||!data)throw Error('state');const verified=decode.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:utf8.encode(stateHash)},await stateKey(env),unb64(data)));if(!token43(verified))throw Error('state');return verified}
function authFailure(status=400,reference=''){return page('Sign-in unavailable','<h1>Unable to sign in</h1><p>Sign-in could not be completed. Return to the account page to try again.</p>'+(reference?'<p>Support reference: '+reference+'</p>':'')+'<a href="/auth/login">Try Google sign-in again</a>',status,{'set-cookie':clearState()})}
async function allowedAuthAttempt(req,env){const ip=req.headers.get('CF-Connecting-IP');if(!ip||ip.length>64)return false;const result=await env.AUTH_RATE_LIMIT.limit({key:ip});return result?.success===true}
async function login(req,env,inviteHash=null){
 const g=googleEnv(env);if(!g)return authFailure(503);env=g;
 if(!await allowedAuthAttempt(req,env))return authFailure(429);
 const state=randomToken(),nonce=randomToken(),verifier=randomToken(),stateHash=await hash(state),now=Math.floor(Date.now()/1000);
 const ciphertext=await sealVerifier(env,verifier,stateHash);
 // Remove expired/used records without retaining Google credentials.
 await env.COMMERCIAL_DB.prepare('DELETE FROM oauth_states WHERE expires_at<=? OR used_at IS NOT NULL').bind(now).run();
 if(googleBetaMode(env))await env.COMMERCIAL_DB.prepare('INSERT INTO oauth_states(state_hash,verifier_ciphertext,nonce_hash,expires_at,invite_hash) VALUES(?,?,?,?,?)').bind(stateHash,ciphertext,await hash(nonce),now+600,inviteHash).run();
 else await env.COMMERCIAL_DB.prepare('INSERT INTO oauth_states(state_hash,verifier_ciphertext,nonce_hash,expires_at) VALUES(?,?,?,?)').bind(stateHash,ciphertext,await hash(nonce),now+600).run();
 const url=new URL(GOOGLE_AUTH);
 for(const [key,val] of Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:CALLBACK,response_type:'code',scope:'openid email',state,nonce,code_challenge:b64url(await digest(verifier)),code_challenge_method:'S256',prompt:'select_account'}))url.searchParams.set(key,val);
 return new Response(null,{status:302,headers:{location:url.href,'cache-control':'no-store','referrer-policy':'no-referrer','set-cookie':cookieValue('__Host-pz_oauth',state,600)}});
}
async function limitedJson(url,options={},max=65536){
 const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.body)throw Error('provider');
 const reader=response.body.getReader();let bytes=0,parts=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max)throw Error('provider size');parts.push(value)}}finally{await reader.cancel().catch(()=>{})}
 const all=new Uint8Array(bytes);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length}const parsed=JSON.parse(decode.decode(all));
 if(!response.ok){
  // Only fixed, allowlisted classifications; never expose Google's response, tokens or credentials.
  const error=url===GOOGLE_TOKEN&&parsed?.error;
  throw Error(error==='invalid_client'||error==='unauthorized_client'?'google-client':error==='invalid_grant'?'google-grant':'provider');
 }
 return parsed;
}
async function verifyGoogleIdToken(token,clientId,nonceHash,now){
 if(typeof token!=='string'||token.length>16384)return null;
 const parts=token.split('.');if(parts.length!==3)return null;
 const [head,payload,sig]=parts,header=JSON.parse(decode.decode(unb64(head)));
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256)return null;
 const jwks=await limitedJson(GOOGLE_KEYS);if(!Array.isArray(jwks.keys))return null;
 const keys=jwks.keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&(k.alg===undefined||k.alg==='RS256')&&(k.use===undefined||k.use==='sig'));
 if(keys.length!==1)return null;
 const key=await crypto.subtle.importKey('jwk',keys[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,unb64(sig),utf8.encode(head+'.'+payload)))return null;
 const c=JSON.parse(decode.decode(unb64(payload)));
 if(!['accounts.google.com','https://accounts.google.com'].includes(c.iss)||c.aud!==clientId||(c.azp!==undefined&&c.azp!==clientId)||!Number.isSafeInteger(c.exp)||c.exp<=now||!Number.isSafeInteger(c.iat)||c.iat>now+60||c.iat<now-600||(c.nbf!==undefined&&(!Number.isSafeInteger(c.nbf)||c.nbf>now+60))||typeof c.sub!=='string'||!c.sub||c.sub.length>255||typeof c.email!=='string'||!c.email||c.email.length>320||c.email_verified!==true||!token43(c.nonce)||await hash(c.nonce)!==nonceHash)return null;
 return {sub:c.sub,email:c.email,authoritativeEmail:c.email.toLowerCase().endsWith('@gmail.com')||(typeof c.hd==='string'&&c.hd.length>0)};
}
async function callback(req,env,u){
 const g=googleEnv(env);if(!g)return authFailure(503);env=g;
 if(!await allowedAuthAttempt(req,env))return authFailure(429);
 const state=u.searchParams.get('state'),code=u.searchParams.get('code');
 if(!token43(state)||u.searchParams.getAll('state').length!==1||cookie(req,'__Host-pz_oauth')!==state||u.searchParams.has('error')||u.searchParams.getAll('code').length!==1||typeof code!=='string'||!code||code.length>4096)return authFailure();
 const db=env.COMMERCIAL_DB,now=Math.floor(Date.now()/1000),stateHash=await hash(state);
 // UPDATE RETURNING makes the state single-use across concurrent requests.
 const row=await db.prepare('UPDATE oauth_states SET used_at=? WHERE state_hash=? AND used_at IS NULL AND expires_at>? RETURNING verifier_ciphertext,nonce_hash'+(googleBetaMode(env)?',invite_hash':'')).bind(now,stateHash,now).first();
 if(!row)return authFailure();
 let stage='PZ-G1';
 try{
  const verifier=await openVerifier(env,row.verifier_ciphertext,stateHash);
  const body=new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:CALLBACK,grant_type:'authorization_code',code_verifier:verifier});
  stage='PZ-G2';
  const tokens=await limitedJson(GOOGLE_TOKEN,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  stage='PZ-G3';
  const claims=await verifyGoogleIdToken(tokens.id_token,env.GOOGLE_CLIENT_ID,row.nonce_hash,Math.floor(Date.now()/1000));
  if(!claims)return authFailure(401,'PZ-G3');
  stage='PZ-G4';
  // Bind Google's stable subject; first-time accounts require authoritative email
  // and a valid invitation for that address, or the configured owner's email.
  let user;
  if(googleBetaMode(env)){
   const email=normalizeEmail(claims.email);
   if(!email)return authFailure(403);
   const subject='google:'+claims.sub;
   user=await findBetaIdentity(db,email,subject);
   if(!user&&claims.authoritativeEmail)user=await betaIdentity(db,email,row.invite_hash,subject,email===normalizeEmail(env.OWNER_EMAIL));
  }else user=await db.prepare('SELECT u.id FROM users u WHERE u.oidc_subject=? AND lower(u.email)=lower(?) AND u.disabled_at IS NULL AND EXISTS (SELECT 1 FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=u.id AND w.deleted_at IS NULL)').bind(claims.sub,claims.email).first();
  if(!user)return googleBetaMode(env)?googleBetaPage('Use the Google account that was invited, or request beta access. For non-Gmail/non-Workspace addresses use email verification.',403):authFailure(403);
  stage='PZ-G5';
  const sessionToken=randomToken(),sessionHash=await hash(sessionToken);
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(sessionHash,user.id,now+43200).run();
  const headers=new Headers({location:'/','cache-control':'no-store','referrer-policy':'no-referrer'});headers.append('set-cookie',clearState());headers.append('set-cookie',cookieValue('__Host-pz_session',sessionToken,43200));
  return new Response(null,{status:303,headers});
 }catch(error){const reference=stage==='PZ-G2'&&error?.message==='google-client'?'PZ-G2C':stage==='PZ-G2'&&error?.message==='google-grant'?'PZ-G2R':stage;return authFailure(401,reference)}
}
async function logout(req,env){
 if(req.headers.get('origin')!==ACCOUNT_ORIGIN)return json({error:'Forbidden'},403);
 const token=cookie(req,'__Host-pz_session');
 if(token43(token))await env.COMMERCIAL_DB.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').bind(Math.floor(Date.now()/1000),await hash(token)).run();
 return new Response(null,{status:303,headers:{location:'/','cache-control':'no-store','set-cookie':cookieValue('__Host-pz_session','',0)}});
}


// Free beta email authentication. Separate from invited Google identities and
// the owner dashboard. No passwords, billing, or external credentials.
const BETA_TERMS='2026-11-26-beta-v1', BETA_MAX_ACCOUNTS=100, BETA_CODE_TTL=600;
const BETA_SENDER='signin@auth.projectzero.work';
const BETA_COOKIE='__Host-pz_beta_challenge';
function emailReady(env){
 return env.CUSTOMER_ACCESS==='beta'&&env.EMAIL_LOGIN_MODE==='invite_only'&&typeof env.BETA_EMAIL?.send==='function'&&typeof env.BETA_AUTH_LIMIT?.limit==='function'&&typeof env.TURNSTILE_SITE_KEY==='string'&&/^[A-Za-z0-9_-]{10,100}$/.test(env.TURNSTILE_SITE_KEY)&&typeof env.TURNSTILE_SECRET==='string'&&env.TURNSTILE_SECRET.length>10;
}
function authReady(env){return googleReady(env)||emailReady(env)}
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const betaCookie=(v,secs)=>cookieValue(BETA_COOKIE,v,secs);
const betaFormCSS='label{display:block;margin:12px 0}input[type=email],input[type=text]{font:inherit;padding:10px;border:1px solid #aaa;border-radius:7px;width:100%;max-width:380px;min-height:44px}button.button{font:inherit;cursor:pointer}a.button{margin-right:6px}.error{color:#923b2c}ul.workspace-list{padding-left:20px}';
function betaPage(title,body,status=200,headers={},challenge=false){
 const csp=secureHeaders['content-security-policy']+(challenge?"; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com":"");
 return page(title,'<style>'+betaFormCSS+'</style>'+body,status,{'content-security-policy':csp,'referrer-policy':'same-origin',...headers});
}
async function boundedForm(req,max=4096){
 if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers.get('content-type')||'')||Number(req.headers.get('content-length')||0)>max||!req.body)return null;
 const reader=req.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let out='',n=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>max){await reader.cancel();return null}out+=decoder.decode(value,{stream:true})}out+=decoder.decode();const p=new URLSearchParams(out);for(const k of p.keys())if(p.getAll(k).length!==1)return null;return p}catch{return null}finally{reader.releaseLock()}
}
function normalizeEmail(v){
 if(typeof v!=='string')return null;const s=v.trim().toLowerCase();
 if(s.length>254||!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(s)||s.split('@')[0].startsWith('.')||s.split('@')[0].endsWith('.')||s.includes('..'))return null;return s;
}
async function verifyBot(req,env,token){
 const ip=req.headers.get('CF-Connecting-IP');if(!ip||ip.length>64||typeof token!=='string'||!token||token.length>2048)return false;
 try{const r=await limitedJson('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token,remoteip:ip})},16384);return r.success===true&&r.hostname==='account.projectzero.work'&&r.action==='beta_email'}catch{return false}
}
function randomCode(){const a=new Uint32Array(1);do{crypto.getRandomValues(a)}while(a[0]>=4200000000);return String(a[0]%100000000).padStart(8,'0')}
async function cleanupBeta(db,now){
 await db.batch([db.prepare('DELETE FROM beta_email_challenges WHERE expires_at<=?').bind(now),db.prepare('DELETE FROM beta_email_limits WHERE expires_at<=?').bind(now),db.prepare('DELETE FROM sessions WHERE expires_at<=? OR revoked_at IS NOT NULL').bind(now)]);
}
async function takeBudget(db,bucket,window,limit,expiry){
 return !!await db.prepare('INSERT INTO beta_email_limits(bucket,window,count,expires_at) VALUES(?,?,1,?) ON CONFLICT(bucket,window) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(bucket,window,expiry,limit).first();
}
async function emailBudget(db,req,email,now){
 const date=new Date(now*1000),day=date.toISOString().slice(0,10),month=day.slice(0,7);
 const dayEnd=(Math.floor(now/86400)+1)*86400;
 const monthEnd=Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)/1000);
 const ip=await hash('beta-ip:'+req.headers.get('CF-Connecting-IP')),addr=await hash('beta-recipient:'+email);
 // Per recipient and IP first, then account-wide daily and monthly ceilings.
 return await takeBudget(db,'to:'+addr,day,3,dayEnd)&&await takeBudget(db,'ip:'+ip,day,8,dayEnd)&&await takeBudget(db,'global-day',day,30,dayEnd)&&await takeBudget(db,'global-month',month,300,monthEnd);
}
function signupPage(env,message='',status=200){
 return betaPage('Free beta','<h1>Sign in or redeem your beta invitation.</h1><p>Invitation-only free access. No subscription or credit card required.</p>'+(message?'<p class="error" role="alert">'+escapeHTML(message)+'</p>':'')+'<form method="post" action="/auth/email"><label>Email address <input type="email" name="email" maxlength="254" autocomplete="email" required></label><label>Invitation code (new accounts only) <input type="text" name="invite" maxlength="43" autocomplete="off" spellcheck="false"></label><label><input type="checkbox" name="accept" value="yes" required> I agree to the <a href="https://www.projectzero.work/terms">Terms of Service</a> and have read the <a href="https://www.projectzero.work/privacy">Privacy Policy</a>.</label><div class="cf-turnstile" data-sitekey="'+env.TURNSTILE_SITE_KEY+'" data-action="beta_email"></div><button class="button" type="submit">Email my sign-in code</button></form><p class="muted">Already have a beta account? Leave the invitation code blank. Enter your emailed sign-in code in this browser. Don’t store passwords, credentials or sensitive client data.</p><p><a href="mailto:contact@projectzero.work?subject=Project%20Zero%20beta%20request">Request an invitation</a></p><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>',status,{},true);
}
function verifyPage(message='',status=200){
 return betaPage('Check your email','<h1>Check your email.</h1><p>Enter the eight-digit sign-in code we sent. It expires in ten minutes. You may need to check your spam folder.</p>'+(message?'<p class="error" role="alert">'+escapeHTML(message)+'</p>':'')+'<form method="post" action="/auth/verify"><label>Sign-in code <input type="text" name="code" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="one-time-code" required></label><button class="button" type="submit">Continue to my workspace</button></form><p><a href="/auth/signup">Request another code</a></p>',status);
}
async function betaRate(req,env){const ip=req.headers.get('CF-Connecting-IP');return !!ip&&ip.length<=64&&(await env.BETA_AUTH_LIMIT.limit({key:ip}))?.success===true;}
async function requestBetaCode(req,env,u){
 if(!originOK(req,u))return json({error:'Forbidden'},403);
 if(!await betaRate(req,env))return signupPage(env,'Too many requests. Please try again later.',429);
 const form=await boundedForm(req),email=normalizeEmail(form?.get('email'));if(!email||form.get('accept')!=='yes')return signupPage(env,'Enter a valid email address and accept the beta terms.',400);
 if(!await verifyBot(req,env,form.get('cf-turnstile-response')))return signupPage(env,'Complete the security check and try again.',403);
 const db=env.COMMERCIAL_DB,now=nowSeconds();
 await cleanupBeta(db,now);
 // The owner uses Google. New testers must hold an unexpired invitation for this mailbox.
 if(email===normalizeEmail(env.OWNER_EMAIL))return signupPage(env,'Please use owner sign in with Google on the account page.',403);
 const existing=await findBetaIdentity(db,email);
 const invite=form.get('invite')?.trim()||'';let inviteHash=null;
 if(!existing){
  if(!token43(invite))return signupPage(env,'An approved invitation is required for new accounts. Request access by email.',403);
  inviteHash=await hash(invite);
  if(!await validInvite(db,inviteHash,email,now))return signupPage(env,'An approved invitation is required for new accounts. Request access by email.',403);
 }
 if(!await emailBudget(db,req,email,now))return signupPage(env,'Too many requests. Please try again later.',429);
 const challenge=randomToken(),code=randomCode(),challengeHash=await hash(challenge);
 await db.prepare('INSERT INTO beta_email_challenges(challenge_hash,email,code_hash,expires_at,invite_hash) VALUES(?,?,?,?,?)').bind(challengeHash,email,await hash(challenge+':'+code),now+BETA_CODE_TTL,inviteHash).run();
 try{
  await env.BETA_EMAIL.send({to:email,from:{email:BETA_SENDER,name:'Project Zero'},replyTo:'contact@projectzero.work',subject:'Your Project Zero beta sign-in code',text:'Your Project Zero sign-in code is '+code+'. Enter it in the browser where you requested it. It expires in 10 minutes. If you did not request this code, ignore this email. Never share the code.'});
 }catch{
  await db.prepare('DELETE FROM beta_email_challenges WHERE challenge_hash=?').bind(challengeHash).run();
  return signupPage(env,'Email delivery is temporarily unavailable. Please try again later.',503);
 }
 return new Response(null,{status:303,headers:{location:'/auth/verify','cache-control':'no-store','referrer-policy':'no-referrer','set-cookie':betaCookie(challenge,BETA_CODE_TTL)}});
}
async function findBetaIdentity(db,email,subject){
 subject=subject||'email:'+await hash(email);
 return db.prepare("SELECT u.id,b.workspace_id FROM users u JOIN beta_accounts b ON b.user_id=u.id JOIN workspaces w ON w.id=b.workspace_id JOIN memberships m ON m.workspace_id=w.id AND m.user_id=u.id JOIN workspace_entitlements e ON e.workspace_id=w.id WHERE u.oidc_subject=? AND u.email=? AND u.disabled_at IS NULL AND w.deleted_at IS NULL AND m.role='owner' AND e.state='active'").bind(subject,email).first();
}
const validInvite=(db,h,email,now)=>db.prepare('SELECT id FROM beta_invitations WHERE code_hash=? AND email=? AND expires_at>? AND redeemed_at IS NULL AND revoked_at IS NULL').bind(h,email,now).first();
async function betaIdentity(db,email,inviteHash=null,googleSubject=null,ownerAllowed=false){
 const subject=googleSubject||'email:'+await hash(email);
 const found=await findBetaIdentity(db,email,subject);if(found)return found;
 if(!ownerAllowed&&!token43Hash(inviteHash))return null;
 const id=crypto.randomUUID(),wid=crypto.randomUUID(),now=nowSeconds();
 // D1 batch is atomic; recheck invitation right at provisioning and consume it only for a newly created identity.
 const gate=ownerAllowed?'1=1':'EXISTS(SELECT 1 FROM beta_invitations WHERE code_hash=? AND email=? AND expires_at>? AND redeemed_at IS NULL AND revoked_at IS NULL)';
 await db.batch([
  db.prepare("INSERT OR IGNORE INTO users(id,oidc_subject,email) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM users WHERE lower(email)=?) AND (SELECT COUNT(*) FROM beta_accounts)<? AND "+gate).bind(id,subject,email,email,BETA_MAX_ACCOUNTS,...(ownerAllowed?[]:[inviteHash,email,now])),
  db.prepare("INSERT INTO workspaces(id,name) SELECT ?,'My workspace' WHERE EXISTS(SELECT 1 FROM users WHERE id=?)").bind(wid,id),
  db.prepare("INSERT INTO memberships(workspace_id,user_id,role) SELECT ?,?,'owner' WHERE EXISTS(SELECT 1 FROM workspaces WHERE id=?)").bind(wid,id,wid),
  db.prepare("INSERT INTO workspace_entitlements(workspace_id,plan,state,project_limit,integration_limit,sync_daily_limit,retention_days) SELECT ?,'private_beta','active',3,0,0,30 WHERE EXISTS(SELECT 1 FROM workspaces WHERE id=?)").bind(wid,wid),
  db.prepare('INSERT INTO beta_accounts(user_id,workspace_id,accepted_terms) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM workspaces WHERE id=?)').bind(id,wid,BETA_TERMS,wid),
  db.prepare("INSERT INTO audit_events(workspace_id,id,actor_id,action,resource_type,resource_id) SELECT ?,?,?,'beta.created','workspace',? WHERE EXISTS(SELECT 1 FROM workspaces WHERE id=?)").bind(wid,crypto.randomUUID(),id,wid,wid),
  ...(!ownerAllowed?[db.prepare('UPDATE beta_invitations SET redeemed_at=? WHERE code_hash=? AND email=? AND EXISTS(SELECT 1 FROM beta_accounts WHERE user_id=? AND workspace_id=?)').bind(now,inviteHash,email,id,wid)]:[])
 ]);
 return await findBetaIdentity(db,email,subject);
}
const token43Hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
async function confirmBetaCode(req,env,u){
 if(!originOK(req,u))return json({error:'Forbidden'},403);
 if(!await betaRate(req,env))return verifyPage('Too many requests. Please try again later.',429);
 const form=await boundedForm(req,256),code=form?.get('code'),challenge=cookie(req,BETA_COOKIE);
 if(!token43(challenge)||!code||!/^[0-9]{8}$/.test(code))return verifyPage('Enter a valid code or request a new one.',400);
 const db=env.COMMERCIAL_DB,now=nowSeconds(),h=await hash(challenge);
 // Count guesses atomically; the token cannot be used in another browser.
 const attempt=await db.prepare('UPDATE beta_email_challenges SET attempts=attempts+1 WHERE challenge_hash=? AND expires_at>? AND attempts<5 RETURNING attempts').bind(h,now).first();
 if(!attempt)return verifyPage('This code has expired or reached the attempt limit. Request a new one.',400);
 const claimed=await db.prepare('DELETE FROM beta_email_challenges WHERE challenge_hash=? AND code_hash=? AND expires_at>? RETURNING email,invite_hash').bind(h,await hash(challenge+':'+code),now).first();
 if(!claimed)return verifyPage('Incorrect code. Please try again or request a new one.',400);
 const user=claimed.email===normalizeEmail(env.OWNER_EMAIL)?null:await betaIdentity(db,claimed.email,claimed.invite_hash);
 if(!user)return betaPage('Beta access','<h1>Beta access unavailable</h1><p>The beta may be full or this account may use another sign-in method. Please contact <a href="mailto:contact@projectzero.work">contact@projectzero.work</a>.</p>',409,{'set-cookie':betaCookie('',0)});
 const sessionToken=randomToken();
 await db.batch([
  db.prepare('DELETE FROM sessions WHERE user_id=? AND (expires_at<=? OR revoked_at IS NOT NULL)').bind(user.id,now),
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hash(sessionToken),user.id,now+43200)
 ]);
 const headers=new Headers({location:'/','cache-control':'no-store','referrer-policy':'no-referrer'});headers.append('set-cookie',betaCookie('',0));headers.append('set-cookie',cookieValue('__Host-pz_session',sessionToken,43200));
 return new Response(null,{status:303,headers});
}
async function betaAdmin(req,u,env,user){
 const db=env.COMMERCIAL_DB;
 if(!await isBetaOwner(db,user,env))return json({error:'Not found'},404);
 const now=nowSeconds();let issued='',message='';
 if(req.method==='POST'){
  if(!originOK(req,u))return json({error:'Forbidden'},403);
  const form=await boundedForm(req,1024),action=form?.get('action');
  if(action==='issue'){
   const email=normalizeEmail(form.get('email'));
   if(!email||email===normalizeEmail(env.OWNER_EMAIL))return json({error:'Enter a tester email address'},400);
   if(await db.prepare('SELECT 1 FROM users WHERE lower(email)=?').bind(email).first())return betaPage('Beta invitations','<h1>Already registered</h1><p>This email already has an account. Ask the tester to sign in.</p><a href="/admin/beta">Back to invitations</a>',409);
   const code=randomToken(),h=await hash(code),id=crypto.randomUUID();
   // Atomically limit outstanding invites and supersede a previous unused invite for the same email.
   const result=await db.batch([
    db.prepare('UPDATE beta_invitations SET revoked_at=? WHERE email=? AND redeemed_at IS NULL AND revoked_at IS NULL').bind(now,email),
    db.prepare('INSERT INTO beta_invitations(id,code_hash,email,created_at,expires_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM beta_invitations WHERE expires_at>? AND redeemed_at IS NULL AND revoked_at IS NULL)+(SELECT COUNT(*) FROM beta_accounts)<? AND NOT EXISTS(SELECT 1 FROM users WHERE lower(email)=?)').bind(id,h,email,now,now+14*86400,now,BETA_MAX_ACCOUNTS,email)
   ]);
   if(result[1]?.meta?.changes!==1)return betaPage('Beta invitations','<h1>Invitation unavailable</h1><p>The beta is full or this address already has an account.</p><a href="/admin/beta">Back to invitations</a>',409);
   issued='<div class="notice"><h2>New invitation for '+escapeHTML(email)+'</h2><p>Copy this code now: it will not be displayed again. Send it directly to this approved tester, along with <a href="/auth/login">the Google redemption page</a> or <a href="/auth/signup">email redemption</a>. It expires in 14 days and can only be redeemed once for this email.</p><label>Invitation code <input type="text" readonly value="'+escapeHTML(code)+'"></label></div>';
  }else if(action==='revoke'&&validId(form.get('id'))){
   await db.prepare('UPDATE beta_invitations SET revoked_at=? WHERE id=? AND redeemed_at IS NULL AND revoked_at IS NULL').bind(now,form.get('id')).run();message='<p role="status">Unused invitation revoked.</p>';
  }else return json({error:'Invalid invitation action'},400);
 }else if(req.method!=='GET')return json({error:'Method not allowed'},405);
 const count=await db.prepare('SELECT COUNT(*) n FROM beta_accounts').bind().first();
 const invitations=await rows(db.prepare('SELECT id,email,created_at,expires_at,redeemed_at,revoked_at FROM beta_invitations ORDER BY created_at DESC LIMIT 200').bind());
 const state=i=>i.redeemed_at?'Redeemed':i.revoked_at?'Revoked':i.expires_at<=now?'Expired':'Pending';
 const list=invitations.map(i=>'<li><strong>'+escapeHTML(i.email)+'</strong> · '+state(i)+' · expires '+new Date(i.expires_at*1000).toISOString().slice(0,10)+(state(i)==='Pending'?'<form method="post" action="/admin/beta"><input type="hidden" name="action" value="revoke"><input type="hidden" name="id" value="'+escapeHTML(i.id)+'"><button class="button" type="submit">Revoke invite</button></form>':'')+'</li>').join('');
 return betaPage('Beta invitations','<p><a href="/">← My account</a></p><h1>Beta invitations</h1><p>'+count.n+' of '+BETA_MAX_ACCOUNTS+' beta accounts registered. Access is free; no payment information.</p>'+message+issued+'<h2>Generate a free invitation code</h2><form method="post" action="/admin/beta"><input type="hidden" name="action" value="issue"><label>Approved tester email <input type="email" name="email" maxlength="254" required></label><button class="button" type="submit">Generate invitation code</button></form><p class="muted">Codes expire in 14 days. Reissuing replaces an unused invitation; codes do not expire registered accounts.</p><h2>Recent invitations</h2><ul>'+list+'</ul>');
}
async function betaWorkspace(db,user){
 return db.prepare('SELECT b.workspace_id,u.email,w.name,b.accepted_terms,b.accepted_at FROM beta_accounts b JOIN users u ON u.id=b.user_id JOIN workspaces w ON w.id=b.workspace_id JOIN memberships m ON m.workspace_id=w.id AND m.user_id=u.id WHERE b.user_id=? AND u.disabled_at IS NULL AND w.deleted_at IS NULL AND m.role=\'owner\'').bind(user.id).first();
}
async function betaExport(db,user){
 const b=await betaWorkspace(db,user);if(!b)return json({error:'Not found'},404);
 const [projects,tasks]=await Promise.all([
  rows(db.prepare('SELECT p.id,p.name,p.website,p.created_at,p.archived_at,o.concept,o.audience,o.product_type,o.business_model,o.budget_cents,o.work_mode,o.preferred_assistant,o.custom_instructions FROM projects p LEFT JOIN project_onboarding o ON o.workspace_id=p.workspace_id AND o.project_id=p.id WHERE p.workspace_id=? ORDER BY p.name LIMIT 100').bind(b.workspace_id)),
  rows(db.prepare('SELECT id,project_id,title,description,priority,status,assignee,revision,created_at,updated_at FROM tasks WHERE workspace_id=? ORDER BY id LIMIT 1000').bind(b.workspace_id))
 ]);
 const r=json({account:{email:b.email,accepted_terms:b.accepted_terms,accepted_at:b.accepted_at},workspace:{name:b.name},projects,tasks});r.headers.set('content-disposition','attachment; filename="project-zero-beta-export.json"');return r;
}
async function betaDelete(req,u,db,user){
 const b=await betaWorkspace(db,user);if(!b)return json({error:'Not found'},404);
 if(req.method==='GET')return betaPage('Delete account','<h1>Delete your beta account</h1><p>This permanently removes your workspace, projects, tasks, and active sign-in sessions. Backups may retain deleted information for their limited retention period. <a href="/account/export">Download your data first.</a></p><p>For security, sign out and sign back in before deleting your account.</p><form method="post" action="/account/delete"><label>Type DELETE to confirm <input type="text" name="confirm" required maxlength="6"></label><button class="button" type="submit">Permanently delete my account</button></form><p><a href="/">Cancel</a></p>');
 if(req.method!=='POST'||!originOK(req,u))return json({error:'Forbidden'},403);
 const token=cookie(req,'__Host-pz_session'),form=await boundedForm(req,256),s=await db.prepare("SELECT 1 ok FROM sessions WHERE token_hash=? AND user_id=? AND revoked_at IS NULL AND expires_at>? AND created_at>=datetime('now','-10 minutes')").bind(await hash(token),user.id,nowSeconds()).first();
 if(form?.get('confirm')!=='DELETE'||!s)return betaPage('Delete account','<h1>Unable to delete</h1><p>Sign out, sign in again, and type DELETE to confirm.</p><a href="/">Back to account</a>',403);
 // Delete only a beta's exclusive, self-owned workspace and its identity.
 const result=await db.batch([
  db.prepare('DELETE FROM workspaces WHERE id=? AND EXISTS(SELECT 1 FROM beta_accounts WHERE user_id=? AND workspace_id=?) AND (SELECT COUNT(*) FROM memberships WHERE workspace_id=?)=1 AND (SELECT COUNT(*) FROM memberships WHERE user_id=?)=1').bind(b.workspace_id,user.id,b.workspace_id,b.workspace_id,user.id),
  db.prepare('DELETE FROM users WHERE id=? AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=?)').bind(user.id,user.id),
  db.prepare('DELETE FROM beta_email_challenges WHERE email=?').bind(b.email)
 ]);
 if(result[0]?.meta?.changes!==1||result[1]?.meta?.changes!==1)return betaPage('Delete account','<h1>Unable to delete safely</h1><p>Contact privacy@projectzero.work for assistance.</p><a href="/">Back to account</a>',409);
 return new Response(null,{status:303,headers:{location:'/','cache-control':'no-store','set-cookie':cookieValue('__Host-pz_session','',0)}});
}

const TASK_PRIORITIES=['P0','P1','P2','Exposure'];
const TASK_STATES=['Not started','In progress','Blocked','Ready to verify','Done','Deferred'];
async function roadmap(req,u,db,user,wid,pid){
 if(!validId(wid)||!validId(pid))return json({error:'Not found'},404);
 const m=await membership(db,user,wid);if(!m)return json({error:'Not found'},404);
 const ent=await db.prepare("SELECT state FROM workspace_entitlements WHERE workspace_id=?").bind(wid).first();
 if(ent?.state!=='active')return json({error:'Workspace entitlement inactive'},403);
 const profile=await projectProfile(db,wid,pid);if(!profile)return json({error:'Not found'},404);
 if(req.method==='GET')return json({tasks:await rows(db.prepare("SELECT id,title,description,priority,status,revision,updated_at FROM tasks WHERE workspace_id=? AND project_id=? ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,created_at,id LIMIT 100").bind(wid,pid))});
 if(req.method!=='POST'||!writeRole(m)||!originOK(req,u))return json({error:'Forbidden'},403);
 const b=await limitedJSON(req);if(!b)return json({error:'Invalid request'},400);
 const projectSQL='EXISTS(SELECT 1 FROM projects WHERE workspace_id=? AND id=? AND archived_at IS NULL)';
 if(b.action==='create'){
  const title=typeof b.title==='string'?b.title.trim():'',description=typeof b.description==='string'?b.description.trim():null;
  if(!title||title.length>180||description===null||description.length>1500||!TASK_PRIORITIES.includes(b.priority))return json({error:'Enter a valid task title, priority and notes.'},400);
  const id=crypto.randomUUID(),result=await db.batch([
   db.prepare("INSERT INTO tasks(workspace_id,project_id,id,title,description,priority,status) SELECT ?,?,?,?,?,?,'Not started' WHERE "+permissionSQL+" AND "+projectSQL+" AND (SELECT COUNT(*) FROM tasks WHERE workspace_id=? AND project_id=?)<50").bind(wid,pid,id,title,description,b.priority,wid,user.id,wid,pid,wid,pid),
   db.prepare("INSERT INTO audit_events(workspace_id,id,actor_id,action,resource_type,resource_id) SELECT ?,?,?,'task.created','task',? WHERE changes()=1").bind(wid,crypto.randomUUID(),user.id,id)
  ]);
  return result[0]?.meta?.changes===1?json({id},201):json({error:'Project task limit reached or workspace unavailable.'},409);
 }
 if(b.action==='status'){
  if(!validId(b.id)||!Number.isSafeInteger(b.revision)||b.revision<1||!TASK_STATES.includes(b.status))return json({error:'Invalid task update'},400);
  const result=await db.batch([
   db.prepare('UPDATE tasks SET status=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE workspace_id=? AND project_id=? AND id=? AND revision=? AND '+permissionSQL+' AND '+projectSQL).bind(b.status,wid,pid,b.id,b.revision,wid,user.id,wid,pid),
   db.prepare("INSERT INTO audit_events(workspace_id,id,actor_id,action,resource_type,resource_id) SELECT ?,?,?,'task.status','task',? WHERE changes()=1").bind(wid,crypto.randomUUID(),user.id,b.id)
  ]);
  return result[0]?.meta?.changes===1?json({updated:true}):json({error:'Task changed or is unavailable. Reload and try again.'},409);
 }
 return json({error:'Invalid task action'},400);
}

export default {async scheduled(event,env){if(betaMode(env)){const now=nowSeconds();await cleanupBeta(env.COMMERCIAL_DB,now);await env.COMMERCIAL_DB.prepare('DELETE FROM oauth_states WHERE expires_at<=? OR used_at IS NOT NULL').bind(now).run();}},async fetch(req,env){try{
 const u=new URL(req.url);
 // Public informational pages are isolated; all customer access remains explicitly gated.
 if(u.origin!==ACCOUNT_ORIGIN)return json({error:'Not found'},404);
 if(['GET','HEAD'].includes(req.method)){
  if(u.pathname==='/robots.txt')return accountRobots(req);
  if(['/privacy','/privacy/','/terms','/terms/','/sitemap.xml'].includes(u.pathname))return Response.redirect(PUBLIC_ORIGIN+u.pathname.replace(/\/$/,'') ,301);
  if(u.pathname==='/')return await accountHome(req,env);
 }
 if(u.pathname==='/auth/signup')return emailReady(env)&&req.method==='GET'?signupPage(env):json({error:'Public signup is disabled'},503);
 if(u.pathname==='/auth/email')return emailReady(env)&&req.method==='POST'?await requestBetaCode(req,env,u):json({error:'Sign-in unavailable'},503);
 if(u.pathname==='/auth/verify')return emailReady(env)?(req.method==='GET'?verifyPage():req.method==='POST'?await confirmBetaCode(req,env,u):json({error:'Method not allowed'},405)):json({error:'Sign-in unavailable'},503);
 if(u.pathname==='/auth/login'){
  if(googleBetaMode(env)&&googleReady(env)){
   if(req.method==='GET')return googleBetaPage();
   if(req.method!=='POST'||!originOK(req,u))return json({error:'Forbidden'},403);
   const form=await boundedForm(req,512),invite=form?.get('invite')?.trim()||'';
   if(form?.get('accept')!=='yes')return googleBetaPage('Accept the terms to continue.',400);
   if(invite&&!token43(invite))return googleBetaPage('Enter the full invitation code.',400);
   return await login(req,env,invite?await hash(invite):null);
  }
  return req.method==='GET'?await login(req,env):json({error:'Method not allowed'},405);
 }
 if(u.pathname==='/auth/google/callback')return req.method==='GET'?await callback(req,env,u):json({error:'Method not allowed'},405);
 if(u.pathname==='/auth/logout')return req.method==='POST'&&authReady(env)?await logout(req,env):json({error:'Sign-in unavailable'},503);
 if(u.pathname==='/internal/readiness')return json({error:'Not found'},404);
 if(!authReady(env))return json({error:'Customer access disabled'},503);
 const db=env.COMMERCIAL_DB;
 if(u.pathname==='/api/v1/assistant/project')return betaMode(env)?json({error:'Assistant connections are not available during beta'},403):await assistantRead(req,db);
 if(!['GET','POST','DELETE'].includes(req.method))return json({error:'Method not allowed'},405);
 const user=await session(req,db);if(!user)return json({error:'Authentication required'},401);
 if(u.pathname==='/admin/beta')return betaMode(env)?await betaAdmin(req,u,env,user):json({error:'Not found'},404);
 if(betaMode(env)&&u.pathname==='/account/export'&&req.method==='GET')return await betaExport(db,user);
 if(betaMode(env)&&u.pathname==='/account/delete')return await betaDelete(req,u,db,user);
 if(req.method==='GET'&&u.pathname==='/assets/customer-setup-v1.js')return setupResponse(SETUP_JS,'application/javascript; charset=utf-8');
 const setup=u.pathname.match(/^\/workspaces\/([^/]+)\/setup$/);
 if(setup&&req.method==='GET'&&validId(setup[1])){const wid=setup[1],member=await membership(db,user,wid);if(!member)return json({error:'Not found'},404);if(!writeRole(member))return json({error:'Forbidden'},403);const entitlement=await db.prepare('SELECT state FROM workspace_entitlements WHERE workspace_id=?').bind(wid).first();if(entitlement?.state!=='active')return json({error:'Workspace entitlement inactive'},403);return setupResponse(SETUP_HTML.replace('WORKSPACE_ID',wid).replace('BETA_MODE',betaMode(env)?'yes':'no'),'text/html; charset=utf-8');}
 const roadmapMatch=u.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/roadmap$/);if(roadmapMatch)return await roadmap(req,u,db,user,roadmapMatch[1],roadmapMatch[2]);
 const projectMatch=u.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/(onboarding|assistant-keys)(?:\/([^/]+))?$/);
 if(projectMatch){const [,wid,pid,kind,keyId]=projectMatch;if(!validId(wid)||!validId(pid)||(keyId&&!validId(keyId)))return json({error:'Not found'},404);const member=await membership(db,user,wid);if(!member)return json({error:'Not found'},404);const ent=await db.prepare("SELECT state FROM workspace_entitlements WHERE workspace_id=?").bind(wid).first();if(ent?.state!=='active')return json({error:'Workspace entitlement inactive'},403);const profile=await projectProfile(db,wid,pid);if(!profile)return json({error:'Not found'},404);if(kind==='assistant-keys'){if(betaMode(env))return json({error:'Secure assistant connections are not available during beta. Copy instructions instead.'},403);return await keys(req,u,db,user,wid,pid,member,profile,keyId);}if(req.method!=='GET'||keyId)return json({error:'Method not allowed'},405);return json({project:profile,instructions:projectInstructions(profile),assistantSetup:{required:false,connectionAvailable:profile.work_mode!=='Manual'&&profile.preferred_assistant!=='None',scopes:['project:read','tasks:read']}});}
 const createMatch=u.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/projects$/);if(req.method==='POST'&&createMatch&&validId(createMatch[1])){const wid=createMatch[1],member=await membership(db,user,wid);if(!member)return json({error:'Not found'},404);return await createProject(req,u,db,user,wid,member);}
 if(req.method!=='GET')return json({error:'Method not allowed'},405);
 if(u.pathname==='/api/v1/workspaces')return json({workspaces:await rows(db.prepare('SELECT w.id,w.name,m.role FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? AND w.deleted_at IS NULL ORDER BY w.name LIMIT 100').bind(user.id))});
 const match=u.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/(overview|projects|tasks|integrations|entitlements)$/);if(!match||!validId(match[1]))return json({error:'Not found'},404);
 const [,wid,kind]=match;const member=await membership(db,user,wid);if(!member)return json({error:'Not found'},404);
 const ent=await db.prepare('SELECT plan,state,project_limit,integration_limit,sync_daily_limit,retention_days FROM workspace_entitlements WHERE workspace_id=?').bind(wid).first();
 if(kind==='entitlements')return json({entitlement:ent,limits:ent?PLAN_LIMITS[ent.plan]||null:null});
 if(ent?.state!=='active')return json({error:'Workspace entitlement inactive'},403);
 if(kind==='projects')return json({projects:await rows(db.prepare('SELECT id,name,website,created_at FROM projects WHERE workspace_id=? AND archived_at IS NULL ORDER BY name LIMIT 100').bind(wid))});
 if(kind==='tasks')return json({tasks:await rows(db.prepare("SELECT id,project_id,title,priority,status,assignee,revision,updated_at FROM tasks WHERE workspace_id=? ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,updated_at DESC LIMIT 100").bind(wid))});
 if(kind==='integrations')return json({integrations:await rows(db.prepare('SELECT id,project_id,provider,display_name,state,last_sync_at FROM integrations WHERE workspace_id=? ORDER BY display_name LIMIT 100').bind(wid))});
 const [projects,tasks,integrations]=await Promise.all([db.prepare('SELECT COUNT(*) n FROM projects WHERE workspace_id=? AND archived_at IS NULL').bind(wid).first(),db.prepare("SELECT COUNT(*) total,COALESCE(SUM(priority='P0' AND status NOT IN ('Done','Deferred')),0) critical,COALESCE(SUM(status='Blocked'),0) blocked FROM tasks WHERE workspace_id=?").bind(wid).first(),db.prepare("SELECT COUNT(*) total,COALESCE(SUM(state='connected'),0) connected FROM integrations WHERE workspace_id=?").bind(wid).first()]);
 return json({workspace:{id:member.id,name:member.name,role:member.role},projects:projects.n,tasks,integrations,financials:null,financialsStatus:'Not connected'});
 }catch{return json({error:'Service unavailable'},503)}
}};

