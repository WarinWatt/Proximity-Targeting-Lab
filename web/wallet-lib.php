<?php
// Internal helpers; caller authenticates and provides a transaction.
function walletInt($value,int $min=1,int $max=100000000):int {
 if(is_bool($value)||(!is_int($value)&&!is_string($value))||filter_var($value,FILTER_VALIDATE_INT)===false||$value<$min||$value>$max)throw new RuntimeException('Invalid integer minor units');return (int)$value;
}
function walletKey(array $body,string $operation,int $actor):string {
 $key=$body['key']??null;if(!is_string($key)||!preg_match('/^[a-zA-Z0-9-]{16,80}$/D',$key))throw new RuntimeException('Idempotency key required');return $operation.':'.$actor.':'.$key;
}
function walletHash(array $payload):string {return hash('sha256',json_encode($payload,JSON_THROW_ON_ERROR));}
function walletBegin(PDO $db):void {$db->exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');$db->beginTransaction();}
function walletLock(PDO $db,int $id):int {
 $q=$db->prepare('SELECT available_minor FROM wallet_accounts WHERE user_id=? FOR UPDATE');$q->execute([$id]);$balance=$q->fetchColumn();if($balance!==false)return (int)$balance;
 // An upsert takes an exclusive lock; INSERT IGNORE would take a shared
 // duplicate-key lock and deadlock when simultaneous callers upgrade it.
 $insert=$db->prepare('INSERT INTO wallet_accounts(user_id) SELECT id FROM users WHERE id=? ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)');$insert->execute([$id]);
 $q->execute([$id]);$balance=$q->fetchColumn();if($balance===false)throw new RuntimeException('Wallet user missing');return (int)$balance;
}
function walletReplay(PDO $db,string $key,string $hash):?array {
 $q=$db->prepare('SELECT * FROM wallet_ledger WHERE request_key=?');$q->execute([$key]);$row=$q->fetch(PDO::FETCH_ASSOC);if(!$row)return null;
 if(!hash_equals($row['payload_hash'],$hash))throw new RuntimeException('Idempotency key payload conflict');return ['ok'=>true,'id'=>(int)($row['campaign_id']??$row['id']),'available_minor'=>(int)$row['available_after_minor']];
}
function walletMove(PDO $db,int $owner,int $actor,string $kind,int $amount,string $key,string $hash,string $reason,?int $campaign=null,?int $run=null):int {
 $q=$db->prepare('UPDATE wallet_accounts SET available_minor=available_minor+? WHERE user_id=? AND available_minor+? >= 0');$q->execute([$amount,$owner,$amount]);if($q->rowCount()!==1&&$amount!==0)throw new RuntimeException('Insufficient wallet balance');
 $q=$db->prepare('SELECT available_minor FROM wallet_accounts WHERE user_id=?');$q->execute([$owner]);$balance=(int)$q->fetchColumn();
 $db->prepare('INSERT INTO wallet_ledger(user_id,actor_id,campaign_id,run_id,kind,amount_minor,available_after_minor,request_key,payload_hash,reason) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute([$owner,$actor,$campaign,$run,$kind,$amount,$balance,$key,$hash,$reason]);
 $db->prepare('INSERT INTO audit_events(user_id,action,entity_id) VALUES(?,?,?)')->execute([$actor,'wallet.'.$kind,(int)$db->lastInsertId()]);return $balance;
}
function walletSnapshot(PDO $db,int $owner):array {
 $q=$db->prepare('SELECT available_minor FROM wallet_accounts WHERE user_id=?');$q->execute([$owner]);$available=(int)($q->fetchColumn()?:0);
 $q=$db->prepare('SELECT COALESCE(SUM(escrow_minor),0) FROM cycle_campaigns WHERE user_id=? AND funded=1 AND closed=0');$q->execute([$owner]);$escrow=(int)$q->fetchColumn();
 $q=$db->prepare("SELECT COALESCE(SUM(amount_minor),0) FROM wallet_ledger WHERE user_id=? AND kind='admin_credit'");$q->execute([$owner]);$grants=(int)$q->fetchColumn();
 $q=$db->prepare('SELECT * FROM wallet_ledger WHERE user_id=? ORDER BY id DESC LIMIT 100');$q->execute([$owner]);return ['available_minor'=>$available,'escrow_minor'=>$escrow,'grant_total_minor'=>$grants,'ledger'=>$q->fetchAll(PDO::FETCH_ASSOC)];
}
