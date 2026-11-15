<?php
declare(strict_types=1);
// This suite creates fixture tables; use only a fresh disposable database.
if(getenv('WALLET_TEST_DISPOSABLE')!=='1')throw new RuntimeException('Disposable database opt-in required');
$db=new PDO('mysql:host='.(getenv('PROXIMITY_DB_HOST')?:'127.0.0.1').';dbname=proximity_lab;charset=utf8mb4','root',getenv('MARIADB_ROOT_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
if(($argv[1]??'')==='worker'){
 function reply(int $status,array $data):never {echo json_encode(['status'=>$status,'data'=>$data]);exit;}
 $action=$argv[2];$body=json_decode($argv[3],true,512,JSON_THROW_ON_ERROR);$user=json_decode($argv[4],true,512,JSON_THROW_ON_ERROR);$method=$argv[5]??'POST';
 require __DIR__.'/../web/'.(str_starts_with($action,'wallet')?'wallet-api.php':'cycle-api.php');exit;
}
function ok(bool $value,string $label):void {if(!$value)throw new RuntimeException($label);echo "PASS {$label}\n";}
function launch(string $action,array $body,int $id=2,string $role='customer',string $method='POST'):array {
 $p=proc_open([PHP_BINARY,__FILE__,'worker',$action,json_encode($body),json_encode(['id'=>$id,'role'=>$role]),$method],[1=>['pipe','w'],2=>['pipe','w']],$pipes);return [$p,$pipes];
}
function collect(array $job):array {[$p,$pipes]=$job;$out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);foreach($pipes as $pipe)fclose($pipe);if(proc_close($p)!==0)throw new RuntimeException($err.$out);return json_decode($out,true,512,JSON_THROW_ON_ERROR);}
function call(string $action,array $body=[],int $id=2,string $role='customer',string $method='POST'):array{return collect(launch($action,$body,$id,$role,$method));}
function success(array $r,string $label):array {if($r['status']!==200)throw new RuntimeException($label.' '.json_encode($r));ok(true,$label);return $r['data'];}
function snapshot(int $available,int $escrow,string $label,int $user=2):array {$s=success(call('wallet',[],$user,'customer','GET'),$label);ok($s['available_minor']===$available&&$s['escrow_minor']===$escrow,$label.' balances');return $s;}
function grant(int $owner,int $amount,string $key):array{return call('wallet-grant',['user_id'=>$owner,'amount_minor'=>$amount,'key'=>$key,'reason'=>'Administrative test credit'],1,'owner');}
function auction(int $campaign,int $station,string $key):array {global $db;$q=$db->prepare('SELECT sha FROM cycle_campaigns WHERE id=?');$q->execute([$campaign]);return call('cycle-auction',['station_id'=>$station,'target'=>'adult','ready'=>[$campaign=>$q->fetchColumn()],'key'=>$key],4,'operator');}
$db->exec('CREATE TABLE users(id INT PRIMARY KEY,username VARCHAR(80),role VARCHAR(20))');$db->exec("INSERT INTO users VALUES(1,'owner','owner'),(2,'customer','customer'),(3,'other','customer'),(4,'operator','operator'),(5,'reviewer','reviewer')");
$db->exec('CREATE TABLE stations(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(80),active BOOLEAN NOT NULL DEFAULT 1)');$db->exec('CREATE TABLE audit_events(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,action VARCHAR(80),entity_id INT)');
$p=proc_open([PHP_BINARY,__DIR__.'/../web/cycle-migrate.php'],[],$pipes);if(proc_close($p)!==0)throw new RuntimeException('Cycle migration failed');
$migrate=require __DIR__.'/../db/migrations/004_wallet.php';$migrate($db);$migrate($db);
snapshot(0,0,'migration gives no legacy credit');
ok(call('wallet-grant',['user_id'=>2,'amount_minor'=>6000,'key'=>'forbidden-grant-key','reason'=>'Test'])['status']===403,'customer cannot grant');
ok(grant(4,1000,'operator-grant-denied')['status']===409,'operator cannot receive grants');
foreach([0,-1,100000001,1.5,true,'100.1'] as $bad)ok(call('wallet-grant',['user_id'=>2,'amount_minor'=>$bad,'key'=>'invalid-amount-grant','reason'=>'Test'],1,'owner')['status']===409,'invalid grant amount rejected');
$g=success(grant(2,6000,'initial-wallet-grant'),'owner grant');$before=snapshot(6000,0,'granted');
$again=success(grant(2,6000,'initial-wallet-grant'),'grant retry');ok($again['id']===$g['id'],'grant retry returns same ledger ID');ok(snapshot(6000,0,'retry')===$before,'retry creates no ledger evidence twice');
ok(grant(2,6001,'initial-wallet-grant')['status']===409,'amount conflict');ok(grant(3,6000,'initial-wallet-grant')['status']===409,'recipient conflict');
$directory=success(call('wallet-customers',[],1,'owner','GET'),'owner directory');ok(count($directory['customers'])===3&&array_key_exists('escrow_minor',$directory['customers'][0]),'eligible directory has escrow');
ok(call('wallet-customers',[],2,'customer','GET')['status']===403,'directory protected');
// Accounts created after migration must also serialize on first use.
$db->exec("INSERT INTO users VALUES(10,'late','customer')");$jobs=[];
for($i=0;$i<5;$i++)$jobs[]=launch('wallet-grant',['user_id'=>10,'amount_minor'=>1200,'key'=>'late-account-grant-'.$i,'reason'=>'Test'],1,'owner');foreach($jobs as $job)success(collect($job),'first-use concurrent grant');snapshot(6000,0,'first-use balance',10);
$media=base64_encode(hex2bin('000000186674797069736f6d0000020069736f6d69736f32'));$buy=['title'=>'Funded test','target'=>'any','bid'=>1200,'budget'=>2400,'media'=>$media];
ok(call('cycle-buy',$buy)['status']===422,'purchase requires key');
$jobs=[];for($i=0;$i<3;$i++)$jobs[]=launch('cycle-buy',$buy+['key'=>'concurrent-buy-key-'.$i]);$wins=[];$losers=0;
foreach($jobs as $i=>$job){$r=collect($job);if($r['status']===200)$wins[]=[$r['data']['id'],'concurrent-buy-key-'.$i];else{ok($r['status']===409,'purchase fails cleanly');$losers++;}}
ok(count($wins)===2&&$losers===1,'concurrent campaigns cannot overspend wallet');snapshot(1200,4800,'prefunded two campaigns');
[$campaign,$purchaseKey]=$wins[0];$second=$wins[1][0];$retry=success(call('cycle-buy',$buy+['key'=>$purchaseKey]),'purchase replay');ok($retry['id']===$campaign,'purchase replay same campaign');
ok(call('cycle-buy',array_replace($buy,['key'=>$purchaseKey,'title'=>'Changed']))['status']===409,'purchase payload bound');
$jobs=[];for($i=1;$i<=5;$i++){$q=$db->prepare('SELECT sha FROM cycle_campaigns WHERE id=?');$q->execute([$campaign]);$jobs[]=launch('cycle-auction',['station_id'=>$i,'target'=>'adult','ready'=>[$campaign=>$q->fetchColumn()],'key'=>'wallet-auction-key-'.$i],4,'operator');}
$runs=[];foreach($jobs as $i=>$job){$r=success(collect($job),'five-station allocation');if($r['id'])$runs[]=['id'=>$r['id'],'station_id'=>$i+1];}ok(count($runs)===2,'only funded escrow is reserved across five stations');
$close=['id'=>$campaign,'key'=>'close-funded-campaign'];ok(call('cycle-close',$close)['status']===409,'close rejects queued runs');
$ref=$runs[0];success(call('cycle-start',$ref,4,'operator'),'start funded playback');ok(call('cycle-close',$close)['status']===409,'close rejects playing runs');success(call('cycle-finish',$ref,4,'operator'),'finish funded playback');success(call('cycle-finish',$ref,4,'operator'),'finish retry');snapshot(1200,3600,'completion consumes escrow only');
success(call('cycle-cancel',$runs[1],4,'operator'),'release second reservation');
ok(call('cycle-close',$close,3)['status']===409,'customer cannot close other campaign');
success(call('cycle-close',$close),'close releases unused escrow');snapshot(2400,2400,'closed available and escrow');success(call('cycle-close',$close),'close replay');success(call('cycle-close',['id'=>$campaign,'key'=>'another-close-request']),'different close key cannot double release');snapshot(2400,2400,'double close unchanged');
$review=$ref+['decision'=>'refunded','reason'=>'Review test'];success(call('cycle-review',$review,5,'reviewer'),'closed funded refund credits wallet');success(call('cycle-review',$review,5,'reviewer'),'closed refund retry');snapshot(3600,2400,'closed refund applied once');
success(call('cycle-close',['id'=>$second,'key'=>'close-second-by-owner'],1,'owner'),'owner closes customer campaign');snapshot(6000,0,'all funded money reconciles');
$none=success(auction($campaign,1,'closed-auction-request'),'closed excluded');ok($none['id']===null,'closed cannot enter auction');
// Both orderings must conserve money: refund restores open escrow or credits
// the already-closed wallet. Neither path may acquire a wallet after a campaign.
$raceCampaign=success(call('cycle-buy',$buy+['key'=>'buy-close-refund-race']),'buy race campaign')['id'];
$raceRun=success(auction($raceCampaign,1,'auction-refund-race'),'race auction')['id'];$raceRef=['id'=>$raceRun,'station_id'=>1];
success(call('cycle-start',$raceRef,4,'operator'),'race start');success(call('cycle-finish',$raceRef,4,'operator'),'race finish');
$jobs=[launch('cycle-close',['id'=>$raceCampaign,'key'=>'concurrent-close-race']),launch('cycle-review',$raceRef+['decision'=>'refunded','reason'=>'Concurrent review'],5,'reviewer')];
foreach($jobs as $job)success(collect($job),'concurrent close and refund');snapshot(6000,0,'close refund race conserves all credits');
// A concurrent replay must serialize before either inserting the campaign or
// debiting the wallet, including wallets with ample balance for both requests.
$same=$buy+['key'=>'identical-buy-race'];$jobs=[launch('cycle-buy',$same),launch('cycle-buy',$same)];$replays=[];foreach($jobs as $job)$replays[]=success(collect($job),'concurrent identical purchase')['id'];
ok($replays[0]===$replays[1],'concurrent purchase replay creates one campaign');snapshot(3600,2400,'identical purchase debits once');success(call('cycle-close',['id'=>$replays[0],'key'=>'close-identical-race']),'close identical purchase');
// Historical spend is retained. Its refund is never backed by a wallet debit.
$sha=str_repeat('b',64);$db->prepare("INSERT INTO cycle_campaigns(user_id,title,target,bid,budget,spent,sha) VALUES(2,'Legacy','any',1200,3600,1200,?)")->execute([$sha]);$legacy=(int)$db->lastInsertId();
$db->prepare("INSERT INTO cycle_runs(station_id,campaign_id,request_key,target,price,state,review) VALUES(1,?,'legacy-completed-key','adult',1200,'completed','pending')")->execute([$legacy]);$legacyRun=(int)$db->lastInsertId();
$db->prepare("INSERT INTO cycle_ledger(run_id,kind,amount) VALUES(?,'charge',1200)")->execute([$legacyRun]);
ok(success(auction($legacy,1,'unfunded-auction-key'),'legacy excluded')['id']===null,'unfunded campaign cannot auction');
success(call('wallet-fund',['id'=>$legacy,'key'=>'fund-legacy-campaign']),'fund remaining legacy budget');snapshot(3600,2400,'fund excludes historical spend');
success(call('cycle-review',['id'=>$legacyRun,'station_id'=>1,'decision'=>'refunded','reason'=>'Legacy review'],5,'reviewer'),'refund historical run after funding');snapshot(3600,2400,'legacy refund creates no spendable money');
success(call('cycle-close',['id'=>$legacy,'key'=>'close-legacy-funded']),'close funded legacy');snapshot(6000,0,'legacy refund cannot inflate grants');
// A pre-wallet active run still settles but cannot be funded in flight.
$db->prepare("INSERT INTO cycle_campaigns(user_id,title,target,bid,budget,sha) VALUES(2,'Legacy active','any',1200,2400,?)")->execute([$sha]);$legacyActive=(int)$db->lastInsertId();
$db->prepare("INSERT INTO cycle_runs(station_id,campaign_id,request_key,target,price,state) VALUES(1,?,'legacy-queued-run-key','adult',1200,'queued')")->execute([$legacyActive]);$activeRun=(int)$db->lastInsertId();
ok(call('wallet-fund',['id'=>$legacyActive,'key'=>'fund-active-legacy'])['status']===409,'cannot fund legacy active run');
success(call('cycle-start',['id'=>$activeRun],4,'operator'),'legacy queued can start');success(call('cycle-finish',['id'=>$activeRun],4,'operator'),'legacy queued settles unchanged');snapshot(6000,0,'historical settlement never debits wallet');
success(call('cycle-close',['id'=>$legacyActive,'key'=>'close-unfunded-legacy']),'legacy close');
success(call('cycle-review',['id'=>$activeRun,'decision'=>'refunded','reason'=>'Old run'],5,'reviewer'),'closed legacy refund');snapshot(6000,0,'closed legacy refund never credits wallet');
foreach(['UPDATE wallet_ledger SET amount_minor=0 LIMIT 1','DELETE FROM wallet_ledger LIMIT 1'] as $sql){try{$db->exec($sql);throw new RuntimeException('Ledger mutation accepted');}catch(PDOException $e){ok($e->getCode()==='45000','wallet ledger immutable');}}
$balance=(int)$db->query('SELECT available_minor FROM wallet_accounts WHERE user_id=2')->fetchColumn();$sum=(int)$db->query('SELECT SUM(amount_minor) FROM wallet_ledger WHERE user_id=2')->fetchColumn();ok($balance===$sum,'wallet balance reconciles to immutable ledger');
ok((int)$db->query("SELECT COUNT(*) FROM audit_events WHERE action LIKE 'wallet.%'")->fetchColumn()===(int)$db->query('SELECT COUNT(*) FROM wallet_ledger')->fetchColumn(),'every wallet movement audited');
echo "Wallet backend acceptance tests passed\n";
