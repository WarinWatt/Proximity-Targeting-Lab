<?php
// Included only after session, CSRF and user checks in api.php.
function roleCycle(array $roles):void{global $user;if(!in_array($user['role'],$roles,true))reply(403,['error'=>'Role denied']);}
function cycleInt($value,int $min,int $max):int{if(filter_var($value,FILTER_VALIDATE_INT)===false||$value<$min||$value>$max)reply(422,['error'=>'Invalid integer']);return (int)$value;}
if($action==='cycle-advertiser'&&$method==='GET'){
 roleCycle(['customer','owner']);
 $q=$db->prepare("SELECT c.id,c.title,c.target,c.bid,c.budget,c.spent,c.sha,c.mime,COALESCE(r.held,0) held FROM cycle_campaigns c LEFT JOIN (SELECT campaign_id,SUM(price) held FROM cycle_runs WHERE state IN ('queued','playing') GROUP BY campaign_id) r ON r.campaign_id=c.id WHERE c.user_id=? ORDER BY c.id DESC");$q->execute([$user['id']]);$campaigns=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$db->prepare("SELECT r.station_id,s.name,COUNT(*) runs,SUM(r.state='completed') completed,SUM(r.state='failed') failed FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN stations s ON s.id=r.station_id WHERE c.user_id=? GROUP BY r.station_id,s.name ORDER BY r.station_id");$q->execute([$user['id']]);$stations=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$db->prepare("SELECT COALESCE(SUM(IF(l.kind='charge',l.amount,0)),0) charge,-COALESCE(SUM(IF(l.kind='refund',l.amount,0)),0) refund,COALESCE(SUM(l.amount),0) net FROM cycle_ledger l JOIN cycle_runs r ON r.id=l.run_id JOIN cycle_campaigns c ON c.id=r.campaign_id WHERE c.user_id=?");$q->execute([$user['id']]);$totals=$q->fetch(PDO::FETCH_ASSOC);
 $q=$db->prepare('SELECT r.id,r.station_id,r.campaign_id,r.target,r.price,r.state,r.started_at,r.completed_at,r.review,r.reason,c.title FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id WHERE c.user_id=? ORDER BY r.id DESC LIMIT 100');$q->execute([$user['id']]);$runs=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$db->prepare('SELECT a.run_id,a.clip_ms,a.looking_ms,a.stopped_ms,a.confidence,a.source,a.created_at FROM cycle_attention a JOIN cycle_runs r ON r.id=a.run_id JOIN cycle_campaigns c ON c.id=r.campaign_id WHERE c.user_id=? ORDER BY a.id DESC LIMIT 100');$q->execute([$user['id']]);
 reply(200,['campaigns'=>$campaigns,'stations'=>$stations,'totals'=>$totals,'runs'=>$runs,'attention'=>$q->fetchAll(PDO::FETCH_ASSOC)]);
}
if($action==='cycle-list'&&$method==='GET'){
 $customer=$user['role']==='customer';$q=$db->prepare('SELECT id,user_id,title,target,bid,budget,spent,sha,mime FROM cycle_campaigns'.($customer?' WHERE user_id=?':'').' ORDER BY id');$q->execute($customer?[$user['id']]:[]);$c=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$db->prepare('SELECT r.* FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id'.($customer?' WHERE c.user_id=?':'').' ORDER BY r.id DESC LIMIT 100');$q->execute($customer?[$user['id']]:[]);$runs=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$db->prepare('SELECT l.* FROM cycle_ledger l JOIN cycle_runs r ON r.id=l.run_id JOIN cycle_campaigns c ON c.id=r.campaign_id'.($customer?' WHERE c.user_id=?':'').' ORDER BY l.id DESC LIMIT 100');$q->execute($customer?[$user['id']]:[]);reply(200,['campaigns'=>$c,'runs'=>$runs,'ledger'=>$q->fetchAll(PDO::FETCH_ASSOC)]);
}
if($action==='cycle-media'&&$method==='GET'){
 $q=$db->prepare('SELECT user_id,media,mime FROM cycle_campaigns WHERE id=?');$q->execute([(int)($_GET['id']??0)]);$c=$q->fetch(PDO::FETCH_ASSOC);if(!$c)reply(404,['error'=>'Not found']);if($user['role']==='customer'&&$c['user_id']!=$user['id'])reply(403,['error'=>'Denied']);header('Content-Type: '.$c['mime']);header('X-Content-Type-Options: nosniff');echo $c['media'];exit;
}
if($method!=='POST')reply(404,['error'=>'Unknown cycle endpoint']);
if($action==='cycle-buy'){
 roleCycle(['customer','owner']);$title=trim((string)($body['title']??''));if(!$title||mb_strlen($title)>80)reply(422,['error'=>'Title required']);$target=$body['target']??'';if(!in_array($target,['adult','senior','any'],true))reply(422,['error'=>'Invalid target']);$bid=cycleInt($body['bid']??0,1200,1000000);$budget=cycleInt($body['budget']??0,$bid,100000000);
 $raw=base64_decode($body['media']??'',true);if(!$raw||strlen($raw)>8*1024*1024)reply(422,['error'=>'Video must be <= 8 MB']);$mime=(new finfo(FILEINFO_MIME_TYPE))->buffer($raw);if(!in_array($mime,['video/mp4','video/webm'],true))reply(422,['error'=>'MP4 / WebM only']);
 $db->prepare('INSERT INTO cycle_campaigns(user_id,title,target,bid,budget,sha,mime,media) VALUES (?,?,?,?,?,?,?,?)')->execute([$user['id'],$title,$target,$bid,$budget,hash('sha256',$raw),$mime,$raw]);reply(200,['id'=>(int)$db->lastInsertId()]);
}
roleCycle($action==='cycle-review'?['reviewer','owner']:['operator','owner']);
$stationId=cycleInt($body['station_id']??1,1,PHP_INT_MAX);
// Reads after campaign lock waits must see other stations' committed reservations.
$db->exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
$db->beginTransaction();try{
 // All writers: station, campaigns in ascending ID order, then run.
 $q=$db->prepare('SELECT * FROM stations WHERE id=? FOR UPDATE');$q->execute([$stationId]);$station=$q->fetch(PDO::FETCH_ASSOC);if(!$station)throw new RuntimeException('Station missing');
 if($action==='cycle-auction'){
  $key=(string)($body['key']??'');if(!preg_match('/^[a-zA-Z0-9-]{16,80}$/',$key))throw new RuntimeException('Invalid request key');
  $target=$body['target']??'';if(!in_array($target,['adult','senior'],true))throw new RuntimeException('Invalid simulated target');
  $ready=$body['ready']??[];if(!is_array($ready))throw new RuntimeException('Invalid cache readiness');
  foreach($ready as $campaign=>$sha){if(!ctype_digit((string)$campaign)||!is_string($sha)||!preg_match('/^[a-f0-9]{64}$/D',$sha))throw new RuntimeException('Invalid cache readiness');}
  ksort($ready,SORT_NUMERIC);$payloadHash=hash('sha256',json_encode([$stationId,$target,$ready],JSON_THROW_ON_ERROR));
  $q=$db->prepare('SELECT id,station_id,request_payload_sha256 FROM cycle_runs WHERE request_key=?');$q->execute([$key]);if($existing=$q->fetch(PDO::FETCH_ASSOC)){
   if((int)$existing['station_id']!==$stationId||!is_string($existing['request_payload_sha256'])||!hash_equals($existing['request_payload_sha256'],$payloadHash))throw new RuntimeException('Request key conflicts with station or payload');
   $db->commit();reply(200,['id'=>(int)$existing['id']]);
  }
  if(!$station['active'])throw new RuntimeException('Station archived');
  $q=$db->prepare("SELECT id FROM cycle_runs WHERE station_id=? AND state IN ('queued','playing') LIMIT 1");$q->execute([$stationId]);if($q->fetchColumn())throw new RuntimeException('Finish or cancel the current slot first');
  $campaigns=$db->query('SELECT id,target,bid,budget,spent,sha FROM cycle_campaigns ORDER BY id ASC FOR UPDATE')->fetchAll(PDO::FETCH_ASSOC);
  $reserved=[];foreach($db->query("SELECT campaign_id,SUM(price) AS reserved FROM cycle_runs WHERE state IN ('queued','playing') GROUP BY campaign_id")->fetchAll(PDO::FETCH_ASSOC) as $reservation)$reserved[$reservation['campaign_id']]=(int)$reservation['reserved'];
  usort($campaigns,fn($a,$b)=>((int)$b['bid']<=>(int)$a['bid'])?:((int)$a['id']<=>(int)$b['id']));$trace=[];$winner=null;
  foreach($campaigns as $c){$why=[];if($c['target']!=='any'&&$c['target']!==$target)$why[]='target mismatch';if(!isset($ready[$c['id']])||!hash_equals($c['sha'],(string)$ready[$c['id']]))$why[]='cache not ready';if($c['budget']-$c['spent']-($reserved[$c['id']]??0)<$c['bid'])$why[]='insufficient budget';$trace[]=['campaign'=>$c['id'],'bid'=>$c['bid'],'reasons'=>$why];if(!$why&&!$winner)$winner=$c;}
  if(!$winner){$db->commit();reply(200,['id'=>null,'trace'=>$trace,'message'=>'No eligible campaign; no charge']);}
  $db->prepare("INSERT INTO cycle_runs(station_id,campaign_id,request_key,request_payload_sha256,target,price,state,trace_json) VALUES (?,?,?,?,?,?, 'queued',?)")->execute([$stationId,$winner['id'],$key,$payloadHash,$target,$winner['bid'],json_encode($trace)]);$id=(int)$db->lastInsertId();$db->commit();reply(200,['id'=>$id,'trace'=>$trace]);
 }
 $id=(int)($body['id']??0);$q=$db->prepare('SELECT campaign_id FROM cycle_runs WHERE id=? AND station_id=?');$q->execute([$id,$stationId]);$campaignId=$q->fetchColumn();if(!$campaignId)throw new RuntimeException('Run missing at station');
 $q=$db->prepare('SELECT id FROM cycle_campaigns WHERE id=? FOR UPDATE');$q->execute([$campaignId]);if(!$q->fetchColumn())throw new RuntimeException('Campaign missing');
 $q=$db->prepare('SELECT * FROM cycle_runs WHERE id=? AND station_id=? FOR UPDATE');$q->execute([$id,$stationId]);$r=$q->fetch(PDO::FETCH_ASSOC);if(!$r||(int)$r['campaign_id']!==(int)$campaignId)throw new RuntimeException('Run changed');
 if($action==='cycle-start'){
  if(!$station['active'])throw new RuntimeException('Station archived');
  if($r['state']==='queued')$db->prepare("UPDATE cycle_runs SET state='playing',started_at=NOW(6) WHERE id=?")->execute([$id]);elseif($r['state']!=='playing')throw new RuntimeException('Cannot start this state');
 }elseif($action==='cycle-finish'){
  if($r['state']==='playing'){$db->prepare("INSERT INTO cycle_ledger(run_id,kind,amount) VALUES (?,'charge',?)")->execute([$id,$r['price']]);$db->prepare('UPDATE cycle_campaigns SET spent=spent+? WHERE id=?')->execute([$r['price'],$r['campaign_id']]);$db->prepare("UPDATE cycle_runs SET state='completed',completed_at=NOW(6),review='pending' WHERE id=?")->execute([$id]);}elseif($r['state']!=='completed')throw new RuntimeException('Start playback first');
 }elseif($action==='cycle-cancel'){
  if(!in_array($r['state'],['queued','playing','failed'],true))throw new RuntimeException('Already charged; use review');$db->prepare("UPDATE cycle_runs SET state='failed' WHERE id=?")->execute([$id]);
 }elseif($action==='cycle-review'){
  if($r['state']!=='completed')throw new RuntimeException('Review after completion only');$decision=$body['decision']??'';$reason=trim((string)($body['reason']??''));if(!in_array($decision,['approved','refunded'],true)||!$reason||mb_strlen($reason)>500)throw new RuntimeException('Decision and reason required');
  if($r['review']!==$decision){if($r['review']==='refunded')throw new RuntimeException('Refund is final');if($decision==='refunded'){$db->prepare("INSERT INTO cycle_ledger(run_id,kind,amount) VALUES (?,'refund',?)")->execute([$id,-$r['price']]);$db->prepare('UPDATE cycle_campaigns SET spent=spent-? WHERE id=?')->execute([$r['price'],$r['campaign_id']]);}$db->prepare('UPDATE cycle_runs SET review=?,reason=? WHERE id=?')->execute([$decision,$reason,$id]);}
 }else throw new RuntimeException('Unknown action');
 $db->prepare('INSERT INTO audit_events(user_id,action,entity_id) VALUES (?,?,?)')->execute([$user['id'],$action,$id]);$db->commit();reply(200,['ok'=>true]);
}catch(Throwable $e){if($db->inTransaction())$db->rollBack();reply(409,['error'=>$e instanceof RuntimeException?$e->getMessage():'Transaction failed']);}
