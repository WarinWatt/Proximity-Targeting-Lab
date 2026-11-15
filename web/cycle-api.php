<?php
// Included only after session, CSRF and user checks in api.php.
require_once __DIR__.'/wallet-lib.php';
$cycleScope=(int)!empty($user['is_demo']);
function roleCycle(array $roles):void{global $user;if(!in_array($user['role'],$roles,true))reply(403,['error'=>'Role denied']);}
function cycleInt($value,int $min,int $max):int{if(filter_var($value,FILTER_VALIDATE_INT)===false||$value<$min||$value>$max)reply(422,['error'=>'Invalid integer']);return (int)$value;}
if($action==='cycle-advertiser'&&$method==='GET'){
 roleCycle(['customer','owner']);
 $q=$db->prepare("SELECT c.id,c.title,c.target,c.bid,c.budget,c.spent,c.sha,c.mime,c.funded,c.closed,c.escrow_minor,COALESCE(r.held,0) held FROM cycle_campaigns c LEFT JOIN (SELECT campaign_id,SUM(price) held FROM cycle_runs WHERE state IN ('queued','playing') GROUP BY campaign_id) r ON r.campaign_id=c.id WHERE c.user_id=? ORDER BY c.id DESC");$q->execute([$user['id']]);$campaigns=$q->fetchAll(PDO::FETCH_ASSOC);foreach($campaigns as &$c){$c['funded']=(int)$c['funded'];$c['closed']=(int)$c['closed'];}unset($c);
 $q=$db->prepare("SELECT r.station_id,s.name,COUNT(*) runs,SUM(r.state='completed') completed,SUM(r.state='failed') failed FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN stations s ON s.id=r.station_id WHERE c.user_id=? GROUP BY r.station_id,s.name ORDER BY r.station_id");$q->execute([$user['id']]);$stations=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$db->prepare("SELECT COALESCE(SUM(IF(l.kind='charge',l.amount,0)),0) charge,-COALESCE(SUM(IF(l.kind='refund',l.amount,0)),0) refund,COALESCE(SUM(l.amount),0) net FROM cycle_ledger l JOIN cycle_runs r ON r.id=l.run_id JOIN cycle_campaigns c ON c.id=r.campaign_id WHERE c.user_id=?");$q->execute([$user['id']]);$totals=$q->fetch(PDO::FETCH_ASSOC);
 $q=$db->prepare('SELECT r.id,r.station_id,r.campaign_id,r.target,r.price,r.state,r.started_at,r.completed_at,r.review,r.reason,c.title FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id WHERE c.user_id=? ORDER BY r.id DESC LIMIT 100');$q->execute([$user['id']]);$runs=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$db->prepare('SELECT a.run_id,a.clip_ms,a.looking_ms,a.stopped_ms,a.confidence,a.source,a.created_at FROM cycle_attention a JOIN cycle_runs r ON r.id=a.run_id JOIN cycle_campaigns c ON c.id=r.campaign_id WHERE c.user_id=? ORDER BY a.id DESC LIMIT 100');$q->execute([$user['id']]);
 reply(200,['campaigns'=>$campaigns,'stations'=>$stations,'totals'=>$totals,'runs'=>$runs,'attention'=>$q->fetchAll(PDO::FETCH_ASSOC)]);
}
if($action==='cycle-list'&&$method==='GET'){
 $customer=$user['role']==='customer';$scope=' JOIN users u ON u.id=c.user_id WHERE u.is_demo=?'.($customer?' AND c.user_id=?':'');$params=$customer?[$cycleScope,$user['id']]:[$cycleScope];
 $q=$db->prepare('SELECT c.id,c.user_id,c.title,c.target,c.bid,c.budget,c.spent,c.sha,c.mime,c.funded,c.closed,c.escrow_minor FROM cycle_campaigns c'.$scope.' ORDER BY c.id');$q->execute($params);$c=$q->fetchAll(PDO::FETCH_ASSOC);foreach($c as &$row){$row['funded']=(int)$row['funded'];$row['closed']=(int)$row['closed'];}unset($row);
 $q=$db->prepare('SELECT r.* FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id'.$scope.' ORDER BY r.id DESC LIMIT 100');$q->execute($params);$runs=$q->fetchAll(PDO::FETCH_ASSOC);
 // Older stored traces can contain candidates from before scope isolation.
 $visibleCampaigns=array_fill_keys(array_column($c,'id'),true);
 foreach($runs as &$run){$trace=json_decode($run['trace_json']??'',true);$run['trace_json']=json_encode(is_array($trace)?array_values(array_filter($trace,fn($row)=>is_array($row)&&isset($visibleCampaigns[(int)($row['campaign']??0)]))):[]);}unset($run);
 $q=$db->prepare('SELECT l.* FROM cycle_ledger l JOIN cycle_runs r ON r.id=l.run_id JOIN cycle_campaigns c ON c.id=r.campaign_id'.$scope.' ORDER BY l.id DESC LIMIT 100');$q->execute($params);reply(200,['campaigns'=>$c,'runs'=>$runs,'ledger'=>$q->fetchAll(PDO::FETCH_ASSOC)]);
}
if($action==='cycle-media'&&$method==='GET'){
 $q=$db->prepare('SELECT c.user_id,c.media,c.mime FROM cycle_campaigns c JOIN users u ON u.id=c.user_id WHERE c.id=? AND u.is_demo=?');$q->execute([(int)($_GET['id']??0),$cycleScope]);$c=$q->fetch(PDO::FETCH_ASSOC);if(!$c)reply(404,['error'=>'Not found']);if($user['role']==='customer'&&$c['user_id']!=$user['id'])reply(403,['error'=>'Denied']);header('Content-Type: '.$c['mime']);header('X-Content-Type-Options: nosniff');echo $c['media'];exit;
}
if($method!=='POST')reply(404,['error'=>'Unknown cycle endpoint']);
if($action==='cycle-buy'){
 if(!is_string($body['key']??null)||!preg_match('/^[a-zA-Z0-9-]{16,80}$/D',$body['key']))reply(422,['error'=>'Idempotency key required']);
 roleCycle(['customer','owner']);$title=trim((string)($body['title']??''));if(!$title||mb_strlen($title)>80)reply(422,['error'=>'Title required']);$target=$body['target']??'';if(!in_array($target,['adult','senior','any'],true))reply(422,['error'=>'Invalid target']);$bid=cycleInt($body['bid']??0,1200,1000000);$budget=cycleInt($body['budget']??0,$bid,100000000);
 $raw=base64_decode($body['media']??'',true);if(!$raw||strlen($raw)>8*1024*1024)reply(422,['error'=>'Video must be <= 8 MB']);$mime=(new finfo(FILEINFO_MIME_TYPE))->buffer($raw);if(!in_array($mime,['video/mp4','video/webm'],true))reply(422,['error'=>'MP4 / WebM only']);
 try{
  $actor=(int)$user['id'];$key=walletKey($body,'buy',$actor);$sha=hash('sha256',$raw);$hash=walletHash(['buy',$title,$target,$bid,$budget,$sha,$mime]);walletBegin($db);walletLock($db,$actor);
  if($result=walletReplay($db,$key,$hash)){$db->commit();reply(200,$result);}
  $db->prepare('INSERT INTO cycle_campaigns(user_id,title,target,bid,budget,sha,mime,media,funded,escrow_minor,purchase_key,purchase_payload_hash) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)')->execute([$actor,$title,$target,$bid,$budget,$sha,$mime,$raw,$budget,$key,$hash]);$id=(int)$db->lastInsertId();
  $balance=walletMove($db,$actor,$actor,'campaign_fund',-$budget,$key,$hash,'Prefund entire campaign budget',$id);$db->commit();reply(200,['ok'=>true,'id'=>$id,'available_minor'=>$balance]);
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();reply(409,['error'=>$e instanceof RuntimeException?$e->getMessage():'Purchase failed']);}
}
if($action==='cycle-close'){
 roleCycle(['customer','owner']);try{
  $actor=(int)$user['id'];$id=walletInt($body['id']??$body['campaign_id']??null,1,PHP_INT_MAX);$key=walletKey($body,'close',$actor);$hash=walletHash(['close',$id]);walletBegin($db);
  $q=$db->prepare('SELECT c.user_id FROM cycle_campaigns c JOIN users u ON u.id=c.user_id WHERE c.id=? AND u.is_demo=?');$q->execute([$id,$cycleScope]);$owner=$q->fetchColumn();if($owner===false)throw new RuntimeException('Campaign missing');$owner=(int)$owner;if($user['role']!=='owner'&&$owner!==$actor)throw new RuntimeException('Own campaign required');walletLock($db,$owner);
  $q=$db->prepare('SELECT c.* FROM cycle_campaigns c JOIN users u ON u.id=c.user_id WHERE c.id=? AND u.is_demo=? FOR UPDATE');$q->execute([$id,$cycleScope]);$c=$q->fetch(PDO::FETCH_ASSOC);if(!$c||(int)$c['user_id']!==$owner)throw new RuntimeException('Campaign changed');
  if($result=walletReplay($db,$key,$hash)){$db->commit();reply(200,$result);}
  $q=$db->prepare("SELECT id FROM cycle_runs WHERE campaign_id=? AND state IN ('queued','playing') LIMIT 1 FOR UPDATE");$q->execute([$id]);if($q->fetchColumn())throw new RuntimeException('Finish or cancel active runs before closing');
  $release=(!$c['closed']&&$c['funded'])?(int)$c['escrow_minor']:0;
  $balance=walletMove($db,$owner,$actor,'campaign_close',$release,$key,$hash,'Release unspent funded escrow',$id);
  $db->prepare('UPDATE cycle_campaigns SET closed=1,escrow_minor=0 WHERE id=?')->execute([$id]);$db->commit();reply(200,['ok'=>true,'id'=>$id,'available_minor'=>$balance]);
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();reply(409,['error'=>$e instanceof RuntimeException?$e->getMessage():'Close failed']);}
}
roleCycle($action==='cycle-review'?['reviewer','owner']:['operator','owner']);
$stationId=cycleInt($body['station_id']??1,1,PHP_INT_MAX);
// Reads after campaign lock waits must see other stations' committed reservations.
$db->exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
$db->beginTransaction();try{
 // All writers: station, wallets by user ID, campaigns by ID, then run.
 $q=$db->prepare('SELECT * FROM stations WHERE id=? FOR UPDATE');$q->execute([$stationId]);$station=$q->fetch(PDO::FETCH_ASSOC);if(!$station)throw new RuntimeException('Station missing');
 if($action==='cycle-auction'){
  $key=(string)($body['key']??'');if(!preg_match('/^[a-zA-Z0-9-]{16,80}$/',$key))throw new RuntimeException('Invalid request key');
  $target=$body['target']??'';if(!in_array($target,['adult','senior'],true))throw new RuntimeException('Invalid simulated target');
  $ready=$body['ready']??[];if(!is_array($ready))throw new RuntimeException('Invalid cache readiness');
  foreach($ready as $campaign=>$sha){if(!ctype_digit((string)$campaign)||!is_string($sha)||!preg_match('/^[a-f0-9]{64}$/D',$sha))throw new RuntimeException('Invalid cache readiness');}
  ksort($ready,SORT_NUMERIC);$payloadHash=hash('sha256',json_encode([$stationId,$target,$ready],JSON_THROW_ON_ERROR));
  $q=$db->prepare('SELECT r.id,r.station_id,r.request_payload_sha256 FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.user_id WHERE r.request_key=? AND u.is_demo=?');$q->execute([$key,$cycleScope]);if($existing=$q->fetch(PDO::FETCH_ASSOC)){
   if((int)$existing['station_id']!==$stationId||!is_string($existing['request_payload_sha256'])||!hash_equals($existing['request_payload_sha256'],$payloadHash))throw new RuntimeException('Request key conflicts with station or payload');
   $db->commit();reply(200,['id'=>(int)$existing['id']]);
  }
  if(!$station['active'])throw new RuntimeException('Station archived');
  $q=$db->prepare("SELECT r.id FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.user_id WHERE r.station_id=? AND r.state IN ('queued','playing') AND u.is_demo=? LIMIT 1");$q->execute([$stationId,$cycleScope]);if($q->fetchColumn())throw new RuntimeException('Finish or cancel the current slot first');
  // Read IDs first; all campaign insert/fund/close writers lock their wallet.
  $q=$db->prepare('SELECT id FROM users WHERE is_demo=? ORDER BY id ASC');$q->execute([$cycleScope]);foreach($q->fetchAll(PDO::FETCH_COLUMN) as $ownerId)walletLock($db,(int)$ownerId);
  $q=$db->prepare('SELECT c.id,c.target,c.bid,c.budget,c.spent,c.sha,c.funded,c.closed,c.escrow_minor FROM cycle_campaigns c JOIN users u ON u.id=c.user_id WHERE u.is_demo=? ORDER BY c.id ASC FOR UPDATE');$q->execute([$cycleScope]);$campaigns=$q->fetchAll(PDO::FETCH_ASSOC);
  $q=$db->prepare("SELECT r.campaign_id,SUM(r.price) AS reserved FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.user_id WHERE r.state IN ('queued','playing') AND u.is_demo=? GROUP BY r.campaign_id");$q->execute([$cycleScope]);$reserved=[];foreach($q->fetchAll(PDO::FETCH_ASSOC) as $reservation)$reserved[$reservation['campaign_id']]=(int)$reservation['reserved'];
  usort($campaigns,fn($a,$b)=>((int)$b['bid']<=>(int)$a['bid'])?:((int)$a['id']<=>(int)$b['id']));$trace=[];$winner=null;
  foreach($campaigns as $c){$why=[];if(!$c['funded'])$why[]='campaign not funded';if($c['closed'])$why[]='campaign closed';if($c['target']!=='any'&&$c['target']!==$target)$why[]='target mismatch';if(!isset($ready[$c['id']])||!hash_equals($c['sha'],(string)$ready[$c['id']]))$why[]='cache not ready';if(min((int)$c['budget']-(int)$c['spent'],(int)$c['escrow_minor'])-($reserved[$c['id']]??0)<$c['bid'])$why[]='insufficient budget';$trace[]=['campaign'=>$c['id'],'bid'=>$c['bid'],'reasons'=>$why];if(!$why&&!$winner)$winner=$c;}
  if(!$winner){$db->commit();reply(200,['id'=>null,'trace'=>$trace,'message'=>'No eligible campaign; no charge']);}
  $db->prepare("INSERT INTO cycle_runs(station_id,campaign_id,request_key,request_payload_sha256,target,price,state,trace_json,escrow_funded) VALUES (?,?,?,?,?,?, 'queued',?,1)")->execute([$stationId,$winner['id'],$key,$payloadHash,$target,$winner['bid'],json_encode($trace)]);$id=(int)$db->lastInsertId();$db->commit();reply(200,['id'=>$id,'trace'=>$trace]);
 }
 $id=(int)($body['id']??0);$q=$db->prepare('SELECT campaign_id FROM cycle_runs WHERE id=? AND station_id=?');$q->execute([$id,$stationId]);$campaignId=$q->fetchColumn();if(!$campaignId)throw new RuntimeException('Run missing at station');
 $q=$db->prepare('SELECT c.user_id FROM cycle_campaigns c JOIN users u ON u.id=c.user_id WHERE c.id=? AND u.is_demo=?');$q->execute([$campaignId,$cycleScope]);$ownerId=$q->fetchColumn();if(!$ownerId)throw new RuntimeException('Campaign missing');walletLock($db,(int)$ownerId);
 $q=$db->prepare('SELECT c.* FROM cycle_campaigns c JOIN users u ON u.id=c.user_id WHERE c.id=? AND u.is_demo=? FOR UPDATE');$q->execute([$campaignId,$cycleScope]);$campaign=$q->fetch(PDO::FETCH_ASSOC);if(!$campaign||(int)$campaign['user_id']!==(int)$ownerId)throw new RuntimeException('Campaign changed');
 $q=$db->prepare('SELECT * FROM cycle_runs WHERE id=? AND station_id=? FOR UPDATE');$q->execute([$id,$stationId]);$r=$q->fetch(PDO::FETCH_ASSOC);if(!$r||(int)$r['campaign_id']!==(int)$campaignId)throw new RuntimeException('Run changed');
 if($action==='cycle-start'){
  if(!$station['active'])throw new RuntimeException('Station archived');
  if($r['state']==='queued')$db->prepare("UPDATE cycle_runs SET state='playing',started_at=NOW(6) WHERE id=?")->execute([$id]);elseif($r['state']!=='playing')throw new RuntimeException('Cannot start this state');
 }elseif($action==='cycle-finish'){
  if($r['state']==='playing'){
   if($r['escrow_funded']){if(!$campaign['funded']||$campaign['closed']||(int)$campaign['escrow_minor']<(int)$r['price'])throw new RuntimeException('Campaign escrow unavailable');$db->prepare('UPDATE cycle_campaigns SET escrow_minor=escrow_minor-? WHERE id=?')->execute([$r['price'],$campaignId]);}
   $db->prepare("INSERT INTO cycle_ledger(run_id,kind,amount) VALUES (?,'charge',?)")->execute([$id,$r['price']]);$db->prepare('UPDATE cycle_campaigns SET spent=spent+? WHERE id=?')->execute([$r['price'],$r['campaign_id']]);$db->prepare("UPDATE cycle_runs SET state='completed',completed_at=NOW(6),review='pending' WHERE id=?")->execute([$id]);}elseif($r['state']!=='completed')throw new RuntimeException('Start playback first');
 }elseif($action==='cycle-cancel'){
  if(!in_array($r['state'],['queued','playing','failed'],true))throw new RuntimeException('Already charged; use review');$db->prepare("UPDATE cycle_runs SET state='failed' WHERE id=?")->execute([$id]);
 }elseif($action==='cycle-review'){
  if($r['state']!=='completed')throw new RuntimeException('Review after completion only');$decision=$body['decision']??'';$reason=trim((string)($body['reason']??''));if(!in_array($decision,['approved','refunded'],true)||!$reason||mb_strlen($reason)>500)throw new RuntimeException('Decision and reason required');
  if($r['review']!==$decision){if($r['review']==='refunded')throw new RuntimeException('Refund is final');if($decision==='refunded'){
   $db->prepare("INSERT INTO cycle_ledger(run_id,kind,amount) VALUES (?,'refund',?)")->execute([$id,-$r['price']]);$db->prepare('UPDATE cycle_campaigns SET spent=spent-? WHERE id=?')->execute([$r['price'],$r['campaign_id']]);
   if($r['escrow_funded']){
    if($campaign['closed'])walletMove($db,(int)$ownerId,(int)$user['id'],'closed_refund',(int)$r['price'],'run-refund:'.$id,walletHash(['closed_refund',$id,(int)$r['price']]),$reason,(int)$campaignId,$id);
    else $db->prepare('UPDATE cycle_campaigns SET escrow_minor=escrow_minor+? WHERE id=?')->execute([$r['price'],$campaignId]);
   }
  }$db->prepare('UPDATE cycle_runs SET review=?,reason=? WHERE id=?')->execute([$decision,$reason,$id]);}
 }else throw new RuntimeException('Unknown action');
 $db->prepare('INSERT INTO audit_events(user_id,action,entity_id) VALUES (?,?,?)')->execute([$user['id'],$action,$id]);$db->commit();reply(200,['ok'=>true]);
}catch(Throwable $e){if($db->inTransaction())$db->rollBack();reply(409,['error'=>$e instanceof RuntimeException?$e->getMessage():'Transaction failed']);}
