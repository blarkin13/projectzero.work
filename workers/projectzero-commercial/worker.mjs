
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'referrer-policy':'no-referrer'}});
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(s);
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('');
async function session(req,db){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)__Host-pz_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];if(!token)return null;return db.prepare('SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND u.disabled_at IS NULL').bind(await hash(token),Math.floor(Date.now()/1000)).first()}
async function membership(db,user,workspace){return db.prepare('SELECT m.role,w.id,w.name FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? AND m.workspace_id=? AND w.deleted_at IS NULL').bind(user.id,workspace).first()}
const PLAN_LIMITS={private_beta:{projects:3,integrations:4,daily:20,retention:30},starter:{projects:3,integrations:6,daily:30,retention:30},professional:{projects:10,integrations:25,daily:100,retention:90},agency:{projects:25,integrations:60,daily:250,retention:180}};
const rows=async stmt=>(await stmt.all()).results;
export default {async fetch(req,env){try{
 const u=new URL(req.url);
 // No public host is attached. Remain fail-closed even if one is attached accidentally.
 if(u.pathname==='/internal/readiness'&&req.method==='GET'){const tables=await env.COMMERCIAL_DB.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN ('users','workspaces','memberships','sessions','projects','tasks','integrations','metrics','audit_events','workspace_entitlements','sync_budget','oauth_states')").first();return json({mode:'closed',schemaReady:tables?.n===12,signupEnabled:false,billingEnabled:false});}
 if(env.CUSTOMER_ACCESS!=='enabled')return json({error:'Customer access disabled'},503);
 if(u.pathname==='/auth/signup'||u.pathname==='/auth/login')return json({error:'Identity provider not configured'},503);
 if(req.method!=='GET')return json({error:'Method not allowed'},405);
 const user=await session(req,env.COMMERCIAL_DB);if(!user)return json({error:'Authentication required'},401);
 const db=env.COMMERCIAL_DB;
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
