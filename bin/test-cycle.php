<?php
declare(strict_types=1);
// Run only against a disposable MariaDB: this test creates its own fixture tables.
if (getenv('CYCLE_TEST_DISPOSABLE') !== '1') throw new RuntimeException('Disposable database opt-in required');
$db = new PDO('mysql:host='.(getenv('PROXIMITY_DB_HOST') ?: '127.0.0.1').';dbname=proximity_lab;charset=utf8mb4', 'root', getenv('MARIADB_ROOT_PASSWORD'), [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
if (($argv[1] ?? '') === 'worker') {
    function reply(int $status, array $data): never { echo json_encode(['status'=>$status,'data'=>$data]); exit; }
    $body=json_decode($argv[3],true,512,JSON_THROW_ON_ERROR);$action=$argv[2];$method='POST';$user=['id'=>1,'role'=>'owner'];
    require __DIR__.'/../web/cycle-api.php';exit;
}
function check(bool $ok,string $label): void { if(!$ok)throw new RuntimeException($label);echo "OK {$label}\n"; }
function launch(string $action,array $body): array {
    $p=proc_open([PHP_BINARY,__FILE__,'worker',$action,json_encode($body)], [1=>['pipe','w'],2=>['pipe','w']],$pipes);
    return [$p,$pipes];
}
function collect(array $job): array {
    [$p,$pipes]=$job;$out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);foreach($pipes as $pipe)fclose($pipe);
    if(proc_close($p)!==0)throw new RuntimeException($err);return json_decode($out,true,512,JSON_THROW_ON_ERROR);
}
function callCycle(string $action,array $body): array {return collect(launch($action,$body));}
function migrate():void { $p=proc_open([PHP_BINARY,__DIR__.'/../web/cycle-migrate.php'],[], $pipes);if(proc_close($p)!==0)throw new RuntimeException('Migration failed'); }
$db->exec('CREATE TABLE users(id INT PRIMARY KEY)');$db->exec('INSERT INTO users VALUES(1)');
$db->exec('CREATE TABLE stations(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(80) NOT NULL,active BOOLEAN NOT NULL DEFAULT 1)');
$db->exec("INSERT INTO stations VALUES(1,'Existing station',1)");
$db->exec('CREATE TABLE audit_events(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,action VARCHAR(80),entity_id INT)');
migrate();
$walletMigration=require __DIR__.'/../db/migrations/004_wallet.php';$walletMigration($db);
check((int)$db->query('SELECT COUNT(*) FROM stations')->fetchColumn()===5,'five stations seeded');
check($db->query('SELECT name FROM stations WHERE id=1')->fetchColumn()==='Existing station','existing station preserved');
$db->exec("ALTER TABLE stations ADD code VARCHAR(40) NULL");$db->exec("UPDATE stations SET code=CONCAT('ST-',LPAD(id,2,'0'))");$db->exec('ALTER TABLE stations MODIFY code VARCHAR(40) NOT NULL, ADD UNIQUE(code)');
$db->exec('DELETE FROM stations WHERE id=5');migrate();migrate();
check($db->query('SELECT code FROM stations WHERE id=5')->fetchColumn()==='ST-05','migration repeats with central station codes');
$sha=str_repeat('a',64);
$db->prepare("INSERT INTO cycle_campaigns(user_id,title,target,bid,budget,sha,funded,escrow_minor) VALUES(1,'Shared','any',1200,6000,?,1,6000)")->execute([$sha]);
$payload=['target'=>'adult','ready'=>[1=>$sha]];$jobs=[];
for($i=1;$i<=5;$i++)$jobs[]=launch('cycle-auction',$payload+['station_id'=>$i,'key'=>sprintf('five-station-key-%02d',$i)]);
$ids=[];foreach($jobs as $i=>$job){$r=collect($job);check($r['status']===200 && $r['data']['id']!==null,'parallel station '.($i+1).' queued');$ids[$i+1]=$r['data']['id'];}
check((int)$db->query("SELECT SUM(price) FROM cycle_runs WHERE state='queued'")->fetchColumn()===6000,'shared reservations equal budget');
$retry=callCycle('cycle-auction',$payload+['key'=>'five-station-key-01']);check($retry['status']===200&&$retry['data']['id']===$ids[1],'default station and matching retry');
foreach([['station_id'=>2],['target'=>'senior'],['ready'=>[]]] as $change){$r=callCycle('cycle-auction',array_replace($payload,['key'=>'five-station-key-01'],$change));check($r['status']===409,'conflicting idempotency payload rejected');}
check(callCycle('cycle-auction',$payload+['station_id'=>1,'key'=>'another-station-key'])['status']===409,'station-specific busy check');
check(callCycle('cycle-start',['id'=>$ids[2]])['status']===409,'cross-station run rejected');
check(callCycle('cycle-start',['id'=>$ids[2],'station_id'=>2])['status']===200,'station-specific start');
$db->exec('UPDATE stations SET active=0 WHERE id=3');
check(callCycle('cycle-start',['id'=>$ids[3],'station_id'=>3])['status']===409,'archived station cannot start');
check(callCycle('cycle-cancel',['id'=>$ids[3],'station_id'=>3])['status']===200,'archived station can release reservation');
check(callCycle('cycle-auction',$payload+['station_id'=>3,'key'=>'archived-station-key'])['status']===409,'archived station cannot allocate');
$db->exec('UPDATE stations SET active=1 WHERE id=3');
check(callCycle('cycle-auction',$payload+['station_id'=>3,'key'=>'released-station-key'])['data']['id']!==null,'cancel releases reservation');
check(callCycle('cycle-finish',['id'=>$ids[2],'station_id'=>2])['status']===200,'finish settles reservation');
check(callCycle('cycle-finish',['id'=>$ids[2],'station_id'=>2])['status']===200,'finish is idempotent');
$none=callCycle('cycle-auction',$payload+['station_id'=>2,'key'=>'exhausted-budget-key']);check($none['status']===200&&$none['data']['id']===null,'spent plus queued and playing reservations prevent overspend');
check((int)$db->query('SELECT spent FROM cycle_campaigns WHERE id=1')->fetchColumn()===1200,'one playback settlement only');
check(callCycle('cycle-review',['id'=>$ids[2],'station_id'=>2,'decision'=>'refunded','reason'=>'Test'])['status']===200,'refund under campaign lock');
check(callCycle('cycle-review',['id'=>$ids[2],'station_id'=>2,'decision'=>'refunded','reason'=>'Test'])['status']===200,'refund retry');
check((int)$db->query('SELECT spent FROM cycle_campaigns WHERE id=1')->fetchColumn()===0,'refund applied once');
check(callCycle('cycle-auction',$payload+['station_id'=>2,'key'=>'refunded-budget-key'])['data']['id']!==null,'refund releases budget');
check((int)$db->query('SELECT COUNT(*) FROM cycle_ledger')->fetchColumn()===2,'only playback charge and refund; no engagement charges');
$db->exec('UPDATE cycle_runs SET request_payload_sha256=NULL WHERE id='.$ids[1]);
check(callCycle('cycle-auction',$payload+['key'=>'five-station-key-01'])['status']===409,'unverifiable legacy payload cannot reuse key');
$db->exec("UPDATE cycle_runs SET state='failed' WHERE state IN ('queued','playing')");$db->exec('UPDATE cycle_campaigns SET budget=2400,escrow_minor=2400 WHERE id=1');
$jobs=[];for($i=1;$i<=5;$i++)$jobs[]=launch('cycle-auction',$payload+['station_id'=>$i,'key'=>sprintf('contended-budget-%02d',$i)]);
$allocated=0;foreach($jobs as $job){$r=collect($job);check($r['status']===200,'contended allocation returns cleanly');if($r['data']['id']!==null)$allocated++;}
check($allocated===2,'five concurrent stations cannot reserve more than two affordable bids');
check((int)$db->query("SELECT SUM(price) FROM cycle_runs WHERE state IN ('queued','playing')")->fetchColumn()===2400,'contended reservations stay within shared budget');
echo "Cycle backend acceptance tests passed\n";
