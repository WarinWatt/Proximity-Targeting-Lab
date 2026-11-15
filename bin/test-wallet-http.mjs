// Opt-in acceptance tests. Only the disposable release containers are supported.
// Unique fixtures are retained: wallet/attention ledgers must remain append-only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';

assert.equal(process.env.WALLET_HTTP_TEST,'1','Set WALLET_HTTP_TEST=1 for the disposable release environment');
const base=process.env.WALLET_TEST_URL??'http://127.0.0.1:8090';
const url=new URL(base);
assert.equal(url.origin,'http://127.0.0.1:8090','Tests may only mutate the disposable release database');
assert.equal(url.pathname,'/');
const container='proximity-release-web-1';
const dbContainer='proximity-release-db-1';
const run=`wallet-http-${randomBytes(8).toString('hex')}`;
const password=randomBytes(24).toString('hex');
const media=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex').toString('base64');
let sequence=0;
const key=()=>`${run}-${++sequence}`;

function sql(code){
 const bootstrap=`<?php if(getenv('PROXIMITY_DB_HOST')!=='db')throw new RuntimeException('Unexpected DB host');$db=new PDO('mysql:host=db;dbname=proximity_lab;charset=utf8mb4','root',getenv('MARIADB_ROOT_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);`;
 return execFileSync('docker',['exec','-i',container,'php'],{input:bootstrap+code,encoding:'utf8'}).trim();
}
const inspect=JSON.parse(execFileSync('docker',['inspect',container,dbContainer],{encoding:'utf8'}));
for(const instance of inspect){
 assert.equal(instance.Config.Labels['com.docker.compose.project'],'proximity-release');
 assert.equal(instance.State.Running,true,`${instance.Name} must be running`);
}
assert.ok(inspect[0].NetworkSettings.Ports['80/tcp'].some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='8090'));
// This verified disposable environment shares an IP across repeated test suites.
sql('$db->exec("DELETE FROM auth_attempts");');

async function client(identity){
 let cookie='',csrf='';
 const call=async(action,body)=>{
  const response=await fetch(`${base}/api.php?action=${action}`,{
   method:body===undefined?'GET':'POST',
   headers:{Cookie:cookie,...(body===undefined?{}:{Origin:url.origin,'Content-Type':'application/json','X-CSRF-Token':csrf})},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)
  });
  const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map(c=>c.split(';')[0]).join('; ');
  const text=await response.text();let data;
  try{data=JSON.parse(text);}catch{throw new Error(`${action}: HTTP ${response.status}, expected JSON`);}
  if(data.csrf)csrf=data.csrf;
  return {status:response.status,data};
 };
 assert.equal((await call('session')).status,200);
 if(identity)expect(await call('login',{username:identity.username,password}),200,'fixture login');
 return call;
}
function expect(result,status,label){assert.equal(result.status,status,`${label}: ${JSON.stringify(result.data)}`);return result.data;}
async function wallet(call,available,escrow,label){
 const data=expect(await call('wallet'),200,label);
 assert.equal(Number(data.available_minor),available,`${label}: available`);
 assert.equal(Number(data.escrow_minor),escrow,`${label}: escrow`);
 assert.ok(Array.isArray(data.ledger),`${label}: ledger`);
 assert.equal(data.ledger.reduce((sum,entry)=>sum+Number(entry.amount_minor),0),available,`${label}: ledger reconciles to wallet`);
 for(const entry of data.ledger)assert.ok(Number(entry.user_id)>0&&Number(entry.available_after_minor)>=0,`${label}: valid ledger account and balance`);
 assert.ok(available>=0&&escrow>=0);
 return data;
}
const buy=(extra={})=>({title:`${run} campaign`,target:'any',bid:1200,budget:2400,media,key:key(),...extra});
const passed=[];
async function check(label,fn){await fn();passed.push(label);console.log(`PASS ${label}`);}

// No existing customer, balance, campaign, station or ledger row is changed by setup.
const identities=JSON.parse(sql(`$out=[];$q=$db->prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)');foreach(['owner','customer','customer2','operator','reviewer'] as $name){$role=$name==='customer2'?'customer':$name;$username='${run}-'.$name;$q->execute([$username,password_hash('${password}',PASSWORD_DEFAULT),$role]);$id=(int)$db->lastInsertId();$db->prepare('INSERT INTO user_roles(user_id,role) VALUES (?,?)')->execute([$id,$role]);$out[$name]=['id'=>$id,'username'=>$username];}echo json_encode($out);`));
console.log(`Disposable wallet fixtures: ${run}`);
const [owner,a,b,operator,reviewer,anonymous]=await Promise.all([
 client(identities.owner),client(identities.customer),client(identities.customer2),client(identities.operator),client(identities.reviewer),client()
]);
const aId=identities.customer.id,bId=identities.customer2.id;
let purchased=[];
let grantResponseIds;
let concurrentPurchaseResults;

await check('wallet role restrictions and owner customer directory',async()=>{
 expect(await anonymous('wallet'),401,'anonymous wallet');
 const directory=expect(await owner('wallet-customers'),200,'owner directory');
 for(const identity of [identities.customer,identities.customer2])assert.ok(directory.customers.some(c=>Number(c.id)===identity.id&&c.username===identity.username));
 for(const call of [a,b,operator,reviewer]){
  expect(await call('wallet-customers'),403,'directory role denied');
  expect(await call('wallet-grant',{user_id:aId,amount_minor:6000,key:key(),reason:run}),403,'grant role denied');
 }
 await wallet(a,0,0,'role denial leaves customer balance unchanged');
});

await check('grants are idempotent and conflicting payloads cannot change balances',async()=>{
 const grant={user_id:aId,amount_minor:6000,key:key(),reason:run};
 const original=expect(await owner('wallet-grant',grant),200,'grant');
 const before=await wallet(a,6000,0,'granted wallet');
 assert.equal(before.ledger.length,1);assert.equal(before.ledger[0].kind,'admin_credit');
 assert.equal(Number(before.ledger[0].user_id),aId);assert.equal(Number(before.ledger[0].amount_minor),6000);
 const replay=expect(await owner('wallet-grant',grant),200,'grant retry');
 grantResponseIds=[original.id,replay.id];
 assert.deepEqual(await wallet(a,6000,0,'duplicate grant wallet'),before);
 for(const changed of [{amount_minor:6001},{reason:`${run} changed`},{user_id:bId}])expect(await owner('wallet-grant',{...grant,...changed}),409,'grant key conflict');
 assert.deepEqual(await wallet(a,6000,0,'conflict wallet'),before);
 await wallet(b,0,0,'cross-tenant grant conflict');
 expect(await owner('wallet-grant',{user_id:bId,amount_minor:3600,key:key(),reason:run}),200,'tenant B grant');
 const other=expect(await a(`wallet&user_id=${bId}`),200,'tenant selector cannot expose another wallet');
 assert.equal(Number(other.available_minor),6000);
 assert.deepEqual(other.ledger,before.ledger);
});

await check('purchase requires a key and funds the entire campaign atomically under concurrency',async()=>{
 const missing=buy();delete missing.key;
 expect(await a('cycle-buy',missing),422,'purchase key required');
 expect(await b('cycle-buy',buy({budget:4800})),409,'unaffordable purchase');
 await wallet(b,3600,0,'unaffordable purchase rollback');
 const sessions=await Promise.all(Array.from({length:3},()=>client(identities.customer)));
 const payloads=sessions.map(()=>buy());
 let results=await Promise.all(sessions.map((call,i)=>call('cycle-buy',payloads[i])));
 concurrentPurchaseResults=structuredClone(results);
 // Keep exercising settlement even if the first concurrent attempt exposes a
 // deadlock. Retrying the same keys is safe; the original result still fails
 // the independent concurrency assertion at the end of this suite.
 for(let i=0;i<results.length;i++)if(/deadlock|Record has changed/i.test(results[i].data.error??''))results[i]=await sessions[i]('cycle-buy',payloads[i]);
 assert.equal(results.filter(r=>r.status===200).length,2,JSON.stringify(results));
 assert.equal(results.filter(r=>r.status===409).length,1,JSON.stringify(results));
 purchased=results.flatMap((r,i)=>r.status===200?[{id:Number(r.data.id),payload:payloads[i]}]:[]);
 await wallet(a,1200,4800,'concurrent purchase conservation');
 const first=purchased[0];
 assert.equal(Number(expect(await a('cycle-buy',first.payload),200,'purchase retry').id),first.id);
 expect(await a('cycle-buy',{...first.payload,title:`${run} conflict`}),409,'purchase key conflict');
 await wallet(a,1200,4800,'retry cannot double debit');
 const own=expect(await a('cycle-list'),200,'tenant A campaign list');
 const other=expect(await b('cycle-list'),200,'tenant B campaign list');
 for(const purchase of purchased){
  const campaign=own.campaigns.find(c=>Number(c.id)===purchase.id);assert.ok(campaign);
  assert.equal(Number(campaign.funded),1);assert.equal(Number(campaign.closed),0);assert.equal(Number(campaign.escrow_minor),2400);
  assert.ok(!other.campaigns.some(c=>Number(c.id)===purchase.id));
 }
});

// Dedicated stations avoid interfering with any other acceptance suite.
const stationId=Number(sql(`$q=$db->prepare('INSERT INTO stations(name,code,active) VALUES (?,?,1)');$q->execute(['${run}','${run}']);echo $db->lastInsertId();`));
async function auction(campaign){
 const listing=expect(await operator('cycle-list'),200,'operator list');
 const c=listing.campaigns.find(c=>Number(c.id)===campaign);assert.ok(c);
 return expect(await operator('cycle-auction',{station_id:stationId,target:'adult',key:key(),ready:{[campaign]:c.sha}}),200,'auction');
}
const close=(id,requestKey=key())=>({campaign_id:id,key:requestKey});

await check('queued and playing holds reject close; completion spends escrow once; attention is nonbillable',async()=>{
 const campaign=purchased[0].id;
 const slot=await auction(campaign);assert.ok(slot.id);
 const ref={id:Number(slot.id),station_id:stationId};purchased[0].ref=ref;
 expect(await a('cycle-close',close(campaign)),409,'queued close rejection');
 await wallet(a,1200,4800,'queued close rollback');
 expect(await operator('cycle-start',ref),200,'start');
 expect(await a('cycle-close',close(campaign)),409,'playing close rejection');
 await wallet(a,1200,4800,'playing close rollback');
 expect(await operator('cycle-finish',ref),200,'finish');
 const finished=await wallet(a,1200,3600,'completed debit');
 expect(await operator('cycle-finish',ref),200,'finish retry');
 assert.deepEqual(await wallet(a,1200,3600,'finish is idempotent'),finished);
 const observation={id:ref.id,key:key(),clip_ms:15000,looking_ms:7600,stopped_ms:8000,confidence:0.95};
 assert.equal(expect(await operator('cycle-attention',observation),200,'attention').billable,false);
 assert.equal(expect(await operator('cycle-attention',observation),200,'attention retry').duplicate,true);
 expect(await operator('cycle-attention',{...observation,looking_ms:7500}),409,'attention conflict');
 assert.deepEqual(await wallet(a,1200,3600,'attention leaves money unchanged'),finished);
 const list=expect(await operator('cycle-list'),200,'completed ledger');
 const entries=list.ledger.filter(l=>Number(l.run_id)===ref.id);
 assert.equal(entries.length,1);assert.equal(Number(entries[0].amount),1200);
});

await check('refund before close restores escrow and closing releases unused credits exactly once',async()=>{
 const first=purchased[0],review={...first.ref,decision:'refunded',reason:run};
 expect(await reviewer('cycle-review',review),200,'open campaign refund');
 const refunded=await wallet(a,1200,4800,'open refund restores escrow');
 expect(await reviewer('cycle-review',review),200,'refund retry');
 assert.deepEqual(await wallet(a,1200,4800,'refund retry cannot mint credits'),refunded);
 const payload=close(first.id);
 expect(await a('cycle-close',payload),200,'close refunded campaign');
 const closed=await wallet(a,3600,2400,'close releases full unused budget');
 expect(await a('cycle-close',payload),200,'close retry');
 assert.deepEqual(await wallet(a,3600,2400,'close retry cannot release twice'),closed);
 assert.equal((await auction(first.id)).id,null,'closed campaigns cannot reenter auctions');
});

await check('close before refund returns subsequent refund to available wallet, never stranded escrow',async()=>{
 const second=purchased[1];
 const slot=await auction(second.id);assert.ok(slot.id);
 const ref={id:Number(slot.id),station_id:stationId};
 expect(await operator('cycle-start',ref),200,'second start');
 expect(await operator('cycle-finish',ref),200,'second finish');
 await wallet(a,3600,1200,'second completed debit');
 expect(await a('cycle-close',close(second.id)),200,'close before refund');
 await wallet(a,4800,0,'close releases only unused credit');
 const review={...ref,decision:'refunded',reason:run};
 expect(await reviewer('cycle-review',review),200,'closed campaign refund');
 const refunded=await wallet(a,6000,0,'closed refund goes to available');
 expect(await reviewer('cycle-review',review),200,'closed refund retry');
 assert.deepEqual(await wallet(a,6000,0,'closed refund retry stable'),refunded);
 expect(await a('cycle-close',close(second.id)),200,'already closed with fresh key');
 await wallet(a,6000,0,'closed refund cannot be released a second time');
});

await check('legacy campaigns cannot auction until owner funds remaining budget; tenant isolation',async()=>{
 // Emulate an imported legacy campaign with 1200 of historical spend.
 const legacy=Number(sql(`$q=$db->prepare("INSERT INTO cycle_campaigns(user_id,title,target,bid,budget,spent,sha,mime,media) VALUES (?,?,'any',1200,2400,1200,?,'video/mp4',?)");$raw=base64_decode('${media}');$q->execute([${bId},'${run} legacy',hash('sha256',$raw),$raw]);echo $db->lastInsertId();`));
 assert.equal((await auction(legacy)).id,null,'unfunded legacy campaign excluded');
 const payload={campaign_id:legacy,key:key()};
 for(const action of ['wallet-fund','cycle-close']){
  const result=await a(action,{...payload,key:key()});
  expect(result,409,`${action} must deny another tenant`);
  assert.match(result.data.error,/Own campaign required/);
 }
 expect(await b('wallet-fund',payload),200,'legacy fund');
 const funded=await wallet(b,2400,1200,'only remaining budget is prefunded');
 expect(await b('wallet-fund',payload),200,'legacy funding retry');
 assert.deepEqual(await wallet(b,2400,1200,'fund retry stable'),funded);
 const slot=await auction(legacy);assert.ok(slot.id,'funded legacy campaign becomes eligible');
 expect(await b('cycle-close',close(legacy)),409,'legacy queued hold prevents close');
 expect(await operator('cycle-cancel',{id:Number(slot.id),station_id:stationId}),200,'cancel legacy slot');
 expect(await b('cycle-close',close(legacy)),200,'close funded legacy');
 await wallet(b,3600,0,'cancel and close return unused funding');
 await wallet(a,6000,0,'other tenant unaffected');
});

await check('concurrent identical purchase keys create one funded campaign and one wallet debit',async()=>{
 const clients=await Promise.all([client(identities.customer2),client(identities.customer2)]);
 const payload=buy();
 const responses=await Promise.all(clients.map(call=>call('cycle-buy',payload)));
 for(const response of responses)expect(response,200,'identical concurrent purchase');
 assert.equal(responses[0].data.id,responses[1].data.id);
 await wallet(b,1200,2400,'concurrent replay funds exactly once');
 expect(await b('cycle-close',close(Number(responses[0].data.id))),200,'close replay campaign');
 await wallet(b,3600,0,'replay campaign returns one allocation');
});

await check('wallet ledger rejects update and delete and final fixtures have no active holds',async()=>{
 const outcome=JSON.parse(sql(`$id=(int)$db->query('SELECT MIN(id) FROM wallet_ledger WHERE user_id=${aId}')->fetchColumn();$denied=0;foreach(["UPDATE wallet_ledger SET amount_minor=0 WHERE id={$id}","DELETE FROM wallet_ledger WHERE id={$id}"] as $statement){$db->beginTransaction();try{$db->exec($statement);}catch(PDOException $e){if($e->getCode()!=='45000')throw $e;$denied++;}finally{$db->rollBack();}}echo json_encode(['denied'=>$denied,'active'=>(int)$db->query("SELECT COUNT(*) FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id WHERE c.user_id IN (${aId},${bId}) AND r.state IN ('queued','playing')")->fetchColumn()]);`));
 assert.equal(outcome.denied,2);assert.equal(outcome.active,0);
 await wallet(a,6000,0,'final tenant A reconciliation');await wallet(b,3600,0,'final tenant B reconciliation');
});

const regressions=[];
for(const [label,verify] of [
 ['grant response identifies the same ledger entry on retry',()=>assert.equal(grantResponseIds[1],grantResponseIds[0],'grant retry must return the original ledger id')],
 ['affordable concurrent purchases succeed without deadlock',()=>{
  assert.equal(concurrentPurchaseResults.filter(r=>r.status===200).length,2,JSON.stringify(concurrentPurchaseResults));
  assert.equal(concurrentPurchaseResults.filter(r=>r.status===409).length,1,JSON.stringify(concurrentPurchaseResults));
  assert.ok(!concurrentPurchaseResults.some(r=>/deadlock|Record has changed/i.test(r.data.error??'')),JSON.stringify(concurrentPurchaseResults));
 }]
])try{await check(label,verify);}catch(error){console.error(`FAIL ${label}: ${error.message}`);regressions.push(error);}
if(regressions.length)throw new AggregateError(regressions,`${regressions.length} wallet regressions; fixtures ${run}`);

console.log(`Wallet HTTP acceptance: ${passed.length} checks passed. Append-only fixtures retained under ${run}.`);
