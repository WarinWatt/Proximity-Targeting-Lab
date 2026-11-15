// Run only against the disposable release project; retain append-only fixtures.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
assert.equal(process.env.DEMO_ISOLATION_TEST,'1','Set DEMO_ISOLATION_TEST=1 to mutate the disposable test DB');
const base='http://127.0.0.1:8090',container='proximity-release-web-1';
const containers=JSON.parse(execFileSync('docker',['inspect',container,'proximity-release-db-1'],{encoding:'utf8'}));
for(const c of containers){assert.equal(c.Config.Labels['com.docker.compose.project'],'proximity-release');assert.equal(c.State.Running,true);}
assert.ok(containers[0].NetworkSettings.Ports['80/tcp'].some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='8090'));
const prefix=`iso-${randomBytes(8).toString('hex')}`,password=randomBytes(24).toString('hex');
let serial=0;const key=()=>`${prefix}-${++serial}`;
const media=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex').toString('base64');
function sql(code){return execFileSync('docker',['exec','-i',container,'php'],{encoding:'utf8',input:`<?php if(getenv('PROXIMITY_DB_HOST')!=='db')throw new RuntimeException('Wrong DB');$db=new PDO('mysql:host=db;dbname=proximity_lab;charset=utf8mb4','root',getenv('MARIADB_ROOT_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);${code}`}).trim();}
function ok(response,label='request'){assert.equal(response.status,200,`${label}: ${JSON.stringify(response.data)}`);return response.data;}
function denied(response,label){assert.ok([403,404,409].includes(response.status),`${label}: ${JSON.stringify(response)}`);assert.ok(!response.data.id,`${label}: foreign id exposed`);}
async function client(identity){
 let cookie='',csrf='';
 const call=async(action,body)=>{
  const response=await fetch(`${base}/api.php?action=${action}`,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
  const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map(c=>c.split(';')[0]).join('; ');
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={media:text};}
  if(data.csrf)csrf=data.csrf;return {status:response.status,data};
 };
 ok(await call('session'));
 if(!identity)return call;
 const login=ok(await call('login',{username:identity.username,password}),'login');
 assert.equal(Number(login.user.is_demo),identity.scope,'authentication must refresh demo flag');
 return call;
}
const fixture=JSON.parse(sql(`$out=[];$q=$db->prepare('INSERT INTO users(username,password_hash,role,is_demo) VALUES (?,?,?,?)');$roles=$db->prepare('INSERT INTO user_roles(user_id,role) VALUES (?,?)');foreach([0,1] as $scope){foreach(['owner','customer','operator','reviewer','multi'] as $name){$role=$name==='multi'?'operator':$name;$username='${prefix}-'.$scope.'-'.$name;$q->execute([$username,password_hash('${password}',PASSWORD_DEFAULT),$role,$scope]);$id=(int)$db->lastInsertId();$roles->execute([$id,$role]);if($name==='multi')$roles->execute([$id,'customer']);$out[$scope][$name]=['id'=>$id,'username'=>$username,'scope'=>$scope];}}$q=$db->prepare('INSERT INTO stations(name,code,active) VALUES (?,?,1)');for($i=0;$i<2;$i++){$q->execute(['${prefix} station '.$i,'${prefix}-'.$i]);$out['stations'][]=(int)$db->lastInsertId();}echo json_encode($out);`));
// Enable demo login only inside the verified disposable stack. Preserve an
// already-enabled manifest and never print its credentials or backup contents.
const manifestCreated=sql(`require '/var/www/html/auth-lib.php';if(!authDemoEnabled(authDemoRead())){$path=authDemoPath();if(is_file($path)){copy($path,$path.'.${prefix}');chmod($path.'.${prefix}',0600);}authDemoWrite(['enabled'=>true,'expires_at'=>gmdate('c',time()+3600),'epoch'=>'${prefix}','profiles'=>[]]);echo 'created';}`)==='created';
if(manifestCreated)process.once('exit',()=>sql(`require '/var/www/html/auth-lib.php';$path=authDemoPath();if((authDemoRead()['epoch']??null)==='${prefix}'){if(is_file($path.'.${prefix}'))rename($path.'.${prefix}',$path);else unlink($path);}`));
const groups=[];
for(const scope of [0,1]){
 const group={scope,identities:fixture[scope]};
 for(const role of ['owner','customer','operator','reviewer'])group[role]=await client(fixture[scope][role]);
 group.beforeSummary=ok(await group.owner('owner-summary')).summary;
 groups.push(group);
}
console.log(`Demo isolation fixtures: ${prefix}`);
let checks=0;async function check(name,fn){await fn();checks++;console.log(`PASS ${name}`);}
const grant=(id,amount=9600)=>({user_id:id,amount_minor:amount,key:key(),reason:prefix});
async function wallet(group){return ok(await group.customer('wallet'));}
async function buy(call,title,budget){return Number(ok(await call('cycle-buy',{title,target:'any',bid:1200,budget,media,key:key()})).id);}
function state(group){const ids=Object.values(group.identities).map(x=>x.id).join(',');return sql(`echo json_encode(['wallets'=>$db->query('SELECT * FROM wallet_accounts WHERE user_id IN (${ids}) ORDER BY user_id')->fetchAll(PDO::FETCH_ASSOC),'ledger'=>$db->query('SELECT * FROM wallet_ledger WHERE user_id IN (${ids}) ORDER BY id')->fetchAll(PDO::FETCH_ASSOC),'campaigns'=>$db->query('SELECT * FROM cycle_campaigns WHERE user_id IN (${ids}) ORDER BY id')->fetchAll(PDO::FETCH_ASSOC),'runs'=>$db->query('SELECT r.* FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id WHERE c.user_id IN (${ids}) ORDER BY r.id')->fetchAll(PDO::FETCH_ASSOC),'attention'=>$db->query('SELECT a.* FROM cycle_attention a JOIN cycle_runs r ON r.id=a.run_id JOIN cycle_campaigns c ON c.id=r.campaign_id WHERE c.user_id IN (${ids}) ORDER BY a.id')->fetchAll(PDO::FETCH_ASSOC)]);`);}

await check('wallet directory and grants isolate both scopes and honor secondary customer roles',async()=>{
 for(const group of groups){
  const other=groups[1-group.scope];
  const directory=ok(await group.owner('wallet-customers')).customers;
  for(const role of ['owner','customer','multi'])assert.ok(directory.some(u=>Number(u.id)===group.identities[role].id),`${role} membership missing`);
  for(const identity of Object.values(other.identities))assert.ok(!directory.some(u=>Number(u.id)===identity.id),'foreign directory entry');
  const before=state(other);
  denied(await group.owner('wallet-grant',grant(other.identities.customer.id)),'cross-scope grant');
  assert.equal(state(other),before,'denied grant mutated another scope');
  ok(await group.owner('wallet-grant',grant(group.identities.customer.id)));
  ok(await group.owner('wallet-grant',grant(group.identities.owner.id,2400)));
  ok(await group.owner('wallet-grant',grant(group.identities.multi.id,100)),'secondary customer role eligible');
  group.campaign=await buy(group.customer,`${prefix}-${group.scope}-customer`,4800);
  group.ownerCampaign=await buy(group.owner,`${prefix}-${group.scope}-owner`,2400);
  group.sha=ok(await group.operator('cycle-list')).campaigns.find(c=>Number(c.id)===group.campaign).sha;
 }
});

await check('campaign lists, advertiser details, media, close and funding isolate both scopes',async()=>{
 for(const group of groups){
  const other=groups[1-group.scope],foreign=[other.campaign,other.ownerCampaign];
  for(const role of ['owner','operator','reviewer','customer']){
   const list=ok(await group[role]('cycle-list'));
   assert.ok(list.campaigns.some(c=>Number(c.id)===group.campaign));
   assert.ok(list.campaigns.every(c=>!foreign.includes(Number(c.id))));
   if(role==='customer')assert.ok(list.campaigns.every(c=>Number(c.user_id)===group.identities.customer.id),'customer sees same-scope foreign tenant');
   denied(await group[role](`cycle-media&id=${other.campaign}`),'cross-scope media');
  }
  const advertised=ok(await group.customer('cycle-advertiser'));
  assert.ok(advertised.campaigns.every(c=>Number(c.id)===group.campaign));
  const before=state(other);
  denied(await group.owner('cycle-close',{id:other.campaign,key:key()}),'owner cross-scope close');
  denied(await group.owner('wallet-fund',{id:other.campaign,key:key()}),'owner cross-scope fund');
  assert.equal(state(other),before,'cross-scope campaign action mutated foreign state');
 }
});

async function auction(group,station,ready,requestKey=key()){
 const result=ok(await group.operator('cycle-auction',{station_id:station,target:'adult',ready,key:requestKey}),'auction');
 assert.ok(result.trace.every(row=>!groups.filter(g=>g!==group).some(g=>[g.campaign,g.ownerCampaign].includes(Number(row.campaign)))),'auction trace leaks foreign campaign');
 return result;
}
await check('opposite-scope candidates never win and queued slots do not block either direction',async()=>{
 for(const group of groups)assert.equal((await auction(group,fixture.stations[0],{[groups[1-group.scope].campaign]:groups[1-group.scope].sha})).id,null);
 for(const group of groups)group.runs=[];
 for(const [index,order] of [[0,groups],[1,[groups[1],groups[0]]]]){
  for(const group of order){
   const station=fixture.stations[index],requestKey=key();
   const result=await auction(group,station,Object.fromEntries(groups.map(g=>[g.campaign,g.sha])),requestKey);
   assert.ok(result.id);group.runs.push({id:Number(result.id),station_id:station,key:requestKey});
   const ownRetry=ok(await group.operator('cycle-auction',{station_id:station,target:'adult',ready:Object.fromEntries(groups.map(g=>[g.campaign,g.sha])),key:requestKey}));assert.equal(Number(ownRetry.id),Number(result.id));
  }
 }
 for(const group of groups){
  denied(await group.operator('cycle-auction',{station_id:fixture.stations[0],target:'adult',ready:{[group.campaign]:group.sha},key:key()}),'own queued slot remains busy');
  const other=groups[1-group.scope];
  denied(await group.operator('cycle-auction',{station_id:fixture.stations[0],target:'adult',ready:{[other.campaign]:other.sha},key:other.runs[0].key}),'cannot replay foreign auction key');
 }
});

await check('historical decision traces cannot leak foreign campaigns or customer tenants',async()=>{
 for(const group of groups){
  const other=groups[1-group.scope];
  sql(`$q=$db->prepare('UPDATE cycle_runs SET trace_json=? WHERE id=?');$q->execute([json_encode([['campaign'=>${group.campaign},'bid'=>1200],['campaign'=>${other.campaign},'bid'=>1200],['campaign'=>${group.ownerCampaign},'bid'=>1200]]),${group.runs[0].id}]);$q->execute(['${other.identities.customer.username}',${group.runs[1].id}]);`);
  for(const role of ['owner','operator','reviewer','customer']){
   const list=ok(await group[role]('cycle-list'));
   for(const ref of group.runs){
    const run=list.runs.find(r=>Number(r.id)===ref.id);assert.ok(run);
    const trace=JSON.parse(run.trace_json);
    assert.ok(trace.every(row=>Number(row.campaign)!==other.campaign));
    if(role==='customer')assert.ok(trace.every(row=>Number(row.campaign)===group.campaign));
    if(ref===group.runs[1])assert.deepEqual(trace,[]);
   }
  }
  for(const ref of group.runs){
   const detail=ok(await group.owner(`owner-station&id=${ref.station_id}`));
   for(const run of detail.runs)assert.ok(JSON.parse(run.trace_json).every(row=>Number(row.campaign)!==other.campaign));
  }
 }
});

await check('start, cancel, finish, review and attention cannot mutate opposite scope',async()=>{
 for(const group of groups){
  const other=groups[1-group.scope],ref=other.runs[0],before=state(other);
  for(const action of ['cycle-start','cycle-cancel'])denied(await group.operator(action,ref),action);
  assert.equal(state(other),before,'queued cross-scope operations changed state');
 }
 for(const group of groups)ok(await group.operator('cycle-start',group.runs[0]));
 for(const group of groups){
  const other=groups[1-group.scope],before=state(other);
  denied(await group.operator('cycle-finish',other.runs[0]),'cross-scope finish');
  denied(await group.operator('cycle-cancel',other.runs[0]),'cross-scope playing cancel');
  assert.equal(state(other),before,'playing cross-scope operations changed state');
 }
 for(const group of groups)ok(await group.operator('cycle-finish',group.runs[0]));
 for(const group of groups){
  const other=groups[1-group.scope],before=state(other);
  denied(await group.reviewer('cycle-review',{...other.runs[0],decision:'refunded',reason:prefix}),'cross-scope review');
  denied(await group.operator('cycle-attention',{id:other.runs[0].id,key:key(),clip_ms:15000,looking_ms:7600,stopped_ms:8000,confidence:0.95}),'cross-scope attention');
  assert.equal(state(other),before,'completed cross-scope operations changed state');
  const observation=ok(await group.operator('cycle-attention',{id:group.runs[0].id,key:key(),clip_ms:15000,looking_ms:7600,stopped_ms:8000,confidence:0.95}));assert.equal(observation.billable,false);
 }
});

await check('owner totals, station aggregates, detail usernames and health counts are scoped',async()=>{
 for(const group of groups){
  const other=groups[1-group.scope];
  const summary=ok(await group.owner('owner-summary')).summary;
  assert.equal(summary.charge-group.beforeSummary.charge,1200);
  assert.equal(summary.runs-group.beforeSummary.runs,2);
  assert.equal(summary.budget_hold-group.beforeSummary.budget_hold,1200);
  const stations=ok(await group.owner('owner-stations')).stations;
  for(const [index,station] of fixture.stations.entries()){
   const row=stations.find(s=>Number(s.id)===station);assert.equal(Number(row.runs),1);assert.equal(Number(row.held),index===0?0:1200);assert.equal(Number(row.charge),index===0?1200:0);
   const detail=ok(await group.owner(`owner-station&id=${station}`));
   assert.equal(detail.runs.length,1);assert.equal(Number(detail.runs[0].id),group.runs[index].id);
   assert.equal(detail.runs[0].owner_name,group.identities.customer.username);
   for(const identity of Object.values(other.identities))assert.ok(!JSON.stringify(detail).includes(identity.username),'foreign username leaked');
   const paged=ok(await group.owner(`owner-station&id=${station}&before=${other.runs[index].id+1}`));
   assert.ok(paged.runs.every(r=>Number(r.campaign_id)===group.campaign));
  }
  const health=ok(await group.operator('system-health'));
  const expected=JSON.parse(sql(`echo json_encode(['runs'=>(int)$db->query('SELECT COUNT(*) FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.user_id WHERE u.is_demo=${group.scope}')->fetchColumn(),'ledger'=>(int)$db->query('SELECT COUNT(*) FROM cycle_ledger l JOIN cycle_runs r ON r.id=l.run_id JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.user_id WHERE u.is_demo=${group.scope}')->fetchColumn()]);`));
  assert.equal(health.counts.runs,expected.runs);assert.equal(health.counts.ledger_entries,expected.ledger);
 }
});

await check('same-scope settlement, refund and owner close still conserve wallet funds',async()=>{
 for(const group of groups){
  ok(await group.operator('cycle-cancel',group.runs[1]));
  ok(await group.owner('cycle-close',{id:group.campaign,key:key()}));
  ok(await group.reviewer('cycle-review',{...group.runs[0],decision:'refunded',reason:prefix}));
  const balance=await wallet(group);assert.equal(Number(balance.available_minor),9600);assert.equal(Number(balance.escrow_minor),0);
 }
});

await check('playing slots never block opposite-scope auctions on shared stations',async()=>{
 const refs=[];
 for(const [index,order] of [[0,groups],[1,[groups[1],groups[0]]]]){
  for(const [position,group] of order.entries()){
   const campaign=ok(await group.operator('cycle-list')).campaigns.find(c=>Number(c.id)===group.ownerCampaign);
   const slot=await auction(group,fixture.stations[index],{[campaign.id]:campaign.sha});assert.ok(slot.id);
   const ref={id:Number(slot.id),station_id:fixture.stations[index]};refs.push({group,ref});
   if(position===0)ok(await group.operator('cycle-start',ref));
  }
 }
 for(const {group,ref} of refs)ok(await group.operator('cycle-cancel',ref));
 for(const group of groups){
  ok(await group.owner('cycle-close',{id:group.ownerCampaign,key:key()}));
  const ownerBalance=ok(await group.owner('wallet'));assert.equal(Number(ownerBalance.available_minor),2400);assert.equal(Number(ownerBalance.escrow_minor),0);
 }
});

await check('only real owner toggles demo access; disabling hides secrets and invalidates old demo sessions',async()=>{
 const real=groups[0],demo=groups[1];
 const initial=ok(await real.owner('demo-mode'),'real owner demo settings');
 assert.equal(initial.enabled,true);
 for(const call of [demo.owner,real.operator,real.reviewer,real.customer]){
  assert.equal((await call('demo-mode')).status,403,'demo settings role denied');
  assert.equal((await call('demo-mode',{enabled:false})).status,403,'demo toggle role denied');
 }
 async function profiles(){const response=await fetch(`${base}/api.php?action=demo-profiles`,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);return response.json();}
 const enabledProfiles=await profiles();assert.equal(enabledProfiles.enabled,true);
 const secrets=enabledProfiles.profiles.map(p=>p.password).filter(p=>typeof p==='string'&&p.length);
 try{
  assert.equal(ok(await real.owner('demo-mode',{enabled:false})).enabled,false);
  const hidden=await profiles();assert.equal(hidden.enabled,false);assert.deepEqual(hidden.profiles,[]);
  const serialized=JSON.stringify(hidden);assert.ok(!serialized.includes('password'));
  for(const secret of secrets)assert.ok(!serialized.includes(secret),'disabled profile response leaks a credential');
  for(const [role,endpoint] of [['owner','owner-summary'],['customer','wallet'],['operator','cycle-list'],['reviewer','cycle-list']]){
   assert.equal((await demo[role](endpoint)).status,401,`old demo ${role} session rejected`);
   assert.equal(ok(await demo[role]('session')).user,null);
  }
  const fresh=await client();
  assert.equal((await fresh('login',{username:demo.identities.customer.username,password})).status,403,'demo login disabled');
  ok(await real.customer('wallet'),'real session remains usable');
  assert.equal(ok(await real.owner('demo-mode')).enabled,false);
  assert.equal(ok(await real.owner('demo-mode',{enabled:true})).enabled,true);
  const restored=await profiles();assert.equal(restored.enabled,true);assert.equal(restored.profiles.length,enabledProfiles.profiles.length);
  assert.equal((await demo.operator('cycle-list')).status,401,'re-enabling must not revive an old demo session');
  const relogged=await client(demo.identities.owner);
  ok(await relogged('owner-summary'),'fresh demo login allowed after re-enable');
  assert.equal((await relogged('demo-mode',{enabled:false})).status,403,'fresh demo owner still cannot toggle');
 }finally{
  const current=ok(await real.owner('demo-mode'));
  if(current.enabled!==initial.enabled)ok(await real.owner('demo-mode',{enabled:initial.enabled}));
 }
});
console.log(`Demo isolation: ${checks} groups passed. Append-only fixtures retained: ${prefix}`);
