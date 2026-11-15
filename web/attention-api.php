<?php
// Manual simulation telemetry only. Never writes a charge or changes campaign spend.
if($method!=='POST')reply(405,['error'=>'POST required']);
if(!in_array($user['role'],['operator','owner'],true))reply(403,['error'=>'Operator required']);
$key=(string)($body['key']??'');if(!preg_match('/^[a-zA-Z0-9-]{16,80}$/',$key))reply(422,['error'=>'Invalid observation key']);
foreach(['id','clip_ms','looking_ms','stopped_ms'] as $field)if(!isset($body[$field])||filter_var($body[$field],FILTER_VALIDATE_INT)===false)reply(422,['error'=>'Integer fields required']);
$id=(int)$body['id'];$clip=(int)$body['clip_ms'];$looking=(int)$body['looking_ms'];$stopped=(int)$body['stopped_ms'];$confidence=$body['confidence']??null;
if($clip<1||$clip>3600000||$looking<0||$looking>$clip||$stopped<0||$stopped>$clip||!is_numeric($confidence)||!is_finite((float)$confidence)||$confidence<0||$confidence>1)reply(422,['error'=>'Invalid attention measurement']);
$hash=hash('sha256',json_encode([$id,$clip,$looking,$stopped,(float)$confidence]));
try{
 $db->beginTransaction();$q=$db->prepare('SELECT r.state FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.user_id WHERE r.id=? AND u.is_demo=? FOR UPDATE');$q->execute([$id,(int)!empty($user['is_demo'])]);if($q->fetchColumn()!=='completed'){$db->rollBack();reply(409,['error'=>'Completed playback required']);}
 $q=$db->prepare('SELECT id,payload_hash FROM cycle_attention WHERE observation_key=?');$q->execute([$key]);$old=$q->fetch(PDO::FETCH_ASSOC);
 if($old){$db->commit();if(!hash_equals($old['payload_hash'],$hash))reply(409,['error'=>'Observation key conflicts']);reply(200,['id'=>(int)$old['id'],'billable'=>false,'duplicate'=>true]);}
 $q=$db->prepare('INSERT INTO cycle_attention(run_id,observation_key,clip_ms,looking_ms,stopped_ms,confidence,metric_version,payload_hash) VALUES (?,?,?,?,?,?,?,?)');$q->execute([$id,$key,$clip,$looking,$stopped,$confidence,'manual-v1',$hash]);$event=(int)$db->lastInsertId();$db->commit();reply(200,['id'=>$event,'billable'=>false,'threshold_exceeded'=>$looking*2>$clip,'message'=>'Manual simulation; no engagement charge']);
}catch(Throwable $e){if($db->inTransaction())$db->rollBack();reply(409,['error'=>'Could not record attention']);}
