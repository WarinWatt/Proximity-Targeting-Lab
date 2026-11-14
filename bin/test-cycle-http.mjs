// Opt-in acceptance test for the local release test environment. Uses five
// independent login sessions so PHP's session lock cannot serialize the test.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const base=process.env.CYCLE_TEST_URL??'http://127.0.0.1:8090';
assert.equal(new URL(base).hostname,'127.0.0.1');
assert.equal(process.env.CYCLE_HTTP_TEST,'1','Set CYCLE_HTTP_TEST=1 for the disposable/local release environment');
const container=process.env.CYCLE_TEST_WEB_CONTAINER??'proximity-release-web-1';
const prefix=`http-cycle-${randomBytes(8).toString('hex')}`;
const sha=randomBytes(32).toString('hex');
function sql(code){
 const bootstrap=`<?php $c=json_decode(file_get_contents(getenv('PROXIMITY_CONFIG')?:'/data/proximity-config.json'),true);$db=new PDO('mysql:host='.getenv('PROXIMITY_DB_HOST').';dbname=proximity_lab;charset=utf8mb4',$c['user'],$c['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);`;
 return execFileSync('docker',['exec','-i',container,'php'],{input:bootstrap+code,encoding:'utf8'}).trim();
}
async function session(){
 let r=await fetch(`${base}/api.php?action=session`);let data=await r.json();let cookie=r.headers.get('set-cookie').split(';')[0];
 r=await fetch(`${base}/api.php?action=login`,{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':data.csrf},body:JSON.stringify({username:'owner.demo',password:'LabTest!2026-owner'})});
 data=await r.json();assert.equal(r.status,200,JSON.stringify(data));cookie=r.headers.get('set-cookie')?.split(';')[0]??cookie;
 return async(action,body)=>{const res=await fetch(`${base}/api.php?action=${action}`,{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':data.csrf},body:JSON.stringify(body)});return {status:res.status,data:await res.json()};};
}
let campaign;
try {
 const clients=await Promise.all(Array.from({length:5},()=>session()));
 campaign=Number(sql(`if($db->query("SELECT COUNT(*) FROM cycle_runs WHERE station_id BETWEEN 1 AND 5 AND state IN ('queued','playing')")->fetchColumn())throw new RuntimeException('Stations must be idle before HTTP test');$q=$db->prepare("INSERT INTO cycle_campaigns(user_id,title,target,bid,budget,sha) SELECT id,?,'any',1200,2400,? FROM users WHERE username='owner.demo'");$q->execute(['${prefix}','${sha}']);echo $db->lastInsertId();`));
 const payload={target:'adult',ready:{[campaign]:sha}};
 const results=await Promise.all(clients.map((client,i)=>client('cycle-auction',{...payload,station_id:i+1,key:`${prefix}-${i}`})));
 for(const result of results)assert.equal(result.status,200,JSON.stringify(result));
 const winners=results.map((r,i)=>r.data.id?{id:r.data.id,station:i+1}:null).filter(Boolean);
 assert.equal(winners.length,2,'only two of five concurrent requests fit budget');
 assert.equal(Number(sql(`echo $db->query("SELECT SUM(price) FROM cycle_runs WHERE campaign_id=${campaign} AND state IN ('queued','playing')")->fetchColumn();`)),2400);
 const first=winners[0];
 assert.equal((await clients[first.station-1]('cycle-auction',{...payload,station_id:first.station,key:`${prefix}-${first.station-1}`})).data.id,first.id);
 assert.equal((await clients[first.station-1]('cycle-auction',{...payload,target:'senior',station_id:first.station,key:`${prefix}-${first.station-1}`})).status,409);
 assert.equal((await clients[first.station-1]('cycle-start',{id:first.id,station_id:first.station})).status,200);
 const loser=results.findIndex(r=>!r.data.id);
 assert.equal((await clients[loser]('cycle-auction',{...payload,station_id:loser+1,key:`${prefix}-playing`})).data.id,null,'playing also reserves budget');
 assert.equal((await clients[first.station-1]('cycle-cancel',{id:first.id,station_id:first.station})).status,200);
 assert.ok((await clients[loser]('cycle-auction',{...payload,station_id:loser+1,key:`${prefix}-released`})).data.id,'cancellation frees budget for another station');
 assert.equal(Number(sql(`echo $db->query("SELECT COUNT(*) FROM cycle_ledger l JOIN cycle_runs r ON r.id=l.run_id WHERE r.campaign_id=${campaign}")->fetchColumn();`)),0);
 console.log('HTTP concurrency passed: five independent sessions, two affordable reservations, playing hold, retry validation, cancellation release, no charges.');
} finally {
 if(campaign)sql(`$db->beginTransaction();$db->exec("DELETE a FROM audit_events a JOIN cycle_runs r ON a.entity_id=r.id WHERE r.campaign_id=${campaign} AND a.action LIKE 'cycle-%'");$db->exec("DELETE l FROM cycle_ledger l JOIN cycle_runs r ON r.id=l.run_id WHERE r.campaign_id=${campaign}");$db->exec("DELETE FROM cycle_runs WHERE campaign_id=${campaign}");$db->exec("DELETE FROM cycle_campaigns WHERE id=${campaign}");$db->commit();`);
}
