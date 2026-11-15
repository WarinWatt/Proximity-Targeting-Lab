<?php
require_once __DIR__.'/wallet-lib.php';
$walletScope=(int)!empty($user['is_demo']);
if($action==='wallet'&&$method==='GET'){
 if(!in_array($user['role'],['customer','owner'],true))reply(403,['error'=>'Role denied']);
 $db->beginTransaction();try{$snapshot=walletSnapshot($db,(int)$user['id']);$db->commit();reply(200,$snapshot);}catch(Throwable $e){if($db->inTransaction())$db->rollBack();reply(409,['error'=>'Wallet unavailable']);}
}
if($action==='wallet-customers'&&$method==='GET'){
 if($user['role']!=='owner')reply(403,['error'=>'Owner required']);
 $q=$db->prepare("SELECT u.id,u.username,COALESCE(w.available_minor,0) available_minor,COALESCE(c.escrow_minor,0) escrow_minor FROM users u LEFT JOIN wallet_accounts w ON w.user_id=u.id LEFT JOIN (SELECT user_id,SUM(escrow_minor) escrow_minor FROM cycle_campaigns WHERE funded=1 AND closed=0 GROUP BY user_id) c ON c.user_id=u.id WHERE u.is_demo=? AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role IN ('customer','owner')) ORDER BY u.id");$q->execute([$walletScope]);$rows=$q->fetchAll(PDO::FETCH_ASSOC);foreach($rows as &$row){$row['id']=(int)$row['id'];$row['available_minor']=(int)$row['available_minor'];$row['escrow_minor']=(int)$row['escrow_minor'];}unset($row);reply(200,['customers'=>$rows]);
}
if($method!=='POST'||!in_array($action,['wallet-grant','wallet-fund'],true))reply(404,['error'=>'Unknown wallet endpoint']);
if($action==='wallet-grant'?$user['role']!=='owner':!in_array($user['role'],['owner','customer'],true))reply(403,['error'=>'Role denied']);
try {
 $actor=(int)$user['id'];$key=walletKey($body,$action,$actor);
 if($action==='wallet-grant'){
  $owner=walletInt($body['user_id']??null,1,PHP_INT_MAX);$amount=walletInt($body['amount_minor']??null);if(!is_string($body['reason']??null))throw new RuntimeException('Grant reason required');$reason=trim($body['reason']);if($reason===''||mb_strlen($reason)>500)throw new RuntimeException('Grant reason required');
  $hash=walletHash([$action,$owner,$amount,$reason]);walletBegin($db);
  // Check scope and role membership before creating or locking a target wallet.
  $q=$db->prepare("SELECT u.id FROM users u WHERE u.id=? AND u.is_demo=? AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role IN ('customer','owner'))");$q->execute([$owner,$walletScope]);if(!$q->fetchColumn())throw new RuntimeException('Grant target unavailable');walletLock($db,$owner);
  if($result=walletReplay($db,$key,$hash)){$db->commit();reply(200,$result);}
  $balance=walletMove($db,$owner,$actor,'admin_credit',$amount,$key,$hash,$reason);$q=$db->prepare('SELECT id FROM wallet_ledger WHERE request_key=?');$q->execute([$key]);$id=(int)$q->fetchColumn();$db->commit();reply(200,['ok'=>true,'id'=>$id,'available_minor'=>$balance]);
 }
 $id=walletInt($body['id']??$body['campaign_id']??null,1,PHP_INT_MAX);$hash=walletHash([$action,$id]);walletBegin($db);
 // Owner discovery is read-only; ownership is checked again under campaign lock.
 $q=$db->prepare('SELECT c.user_id FROM cycle_campaigns c JOIN users u ON u.id=c.user_id WHERE c.id=? AND u.is_demo=?');$q->execute([$id,$walletScope]);$owner=$q->fetchColumn();if($owner===false)throw new RuntimeException('Campaign missing');$owner=(int)$owner;
 if($owner!==$actor)throw new RuntimeException('Own campaign required');walletLock($db,$owner);
 $q=$db->prepare('SELECT c.* FROM cycle_campaigns c JOIN users u ON u.id=c.user_id WHERE c.id=? AND u.is_demo=? FOR UPDATE');$q->execute([$id,$walletScope]);$c=$q->fetch(PDO::FETCH_ASSOC);if(!$c||(int)$c['user_id']!==$owner)throw new RuntimeException('Campaign changed');
 if($result=walletReplay($db,$key,$hash)){$db->commit();reply(200,$result);}
 if($c['closed']||$c['funded'])throw new RuntimeException('Campaign closed or already funded');
 $q=$db->prepare("SELECT id FROM cycle_runs WHERE campaign_id=? AND state IN ('queued','playing') LIMIT 1 FOR UPDATE");$q->execute([$id]);if($q->fetchColumn())throw new RuntimeException('Finish or cancel active runs before funding');
 $remaining=walletInt((int)$c['budget']-(int)$c['spent'],0);$balance=walletMove($db,$owner,$actor,'campaign_fund',-$remaining,$key,$hash,'Allocate remaining campaign budget',$id);
 $db->prepare('UPDATE cycle_campaigns SET funded=1,escrow_minor=? WHERE id=?')->execute([$remaining,$id]);$db->commit();reply(200,['ok'=>true,'id'=>$id,'available_minor'=>$balance]);
}catch(Throwable $e){if($db->inTransaction())$db->rollBack();reply(409,['error'=>$e instanceof RuntimeException?$e->getMessage():'Wallet transaction failed']);}
