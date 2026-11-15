<?php
function authRoles(PDO $db,int $id):array {$q=$db->prepare('SELECT role FROM user_roles WHERE user_id=? ORDER BY role');$q->execute([$id]);return $q->fetchAll(PDO::FETCH_COLUMN);}
function authAccount(PDO $db,int $id):?array {$q=$db->prepare('SELECT id,username,password_hash,role,active,is_demo,display_name,email,auth_version FROM users WHERE id=?');$q->execute([$id]);$u=$q->fetch(PDO::FETCH_ASSOC);if(!$u)return null;foreach(['id','active','is_demo','auth_version'] as $f)$u[$f]=(int)$u[$f];$u['roles']=authRoles($db,$id);return $u;}
function authPublic(array $u,?string $role=null):array {unset($u['password_hash']);if($role!==null)$u['role']=$role;return $u;}
function authDemoPath():string {
 global $configPath;$path=getenv('PROXIMITY_DEMO_CONFIG')?:dirname($configPath??(getenv('PROXIMITY_CONFIG')?:'/data/proximity-config.json')).'/proximity-demo-access.json';
 $parent=realpath(dirname($path));if($parent===false||!is_dir($parent))throw new RuntimeException('Private demo configuration directory missing');
 $resolved=$parent.DIRECTORY_SEPARATOR.basename($path);$web=realpath(__DIR__);$normal=fn($v)=>strtolower(str_replace('\\','/',$v));if(str_starts_with($normal($resolved),rtrim($normal($web),'/').'/'))throw new RuntimeException('Demo manifest must be outside web root');
 if(is_link($resolved))throw new RuntimeException('Demo manifest cannot be a symlink');return $resolved;
}
function authDemoRead():array {try{$path=authDemoPath();if(!is_file($path))return [];$data=json_decode(file_get_contents($path),true,512,JSON_THROW_ON_ERROR);return is_array($data)?$data:[];}catch(Throwable $e){return [];}}
function authDemoEnabled(array $manifest):bool {return ($manifest['enabled']??false)===true&&is_string($manifest['expires_at']??null)&&strtotime($manifest['expires_at'])>time()&&is_array($manifest['profiles']??null);}
function authDemoProfile(array $manifest,array $u):?array {foreach($manifest['profiles']??[] as $p)if(is_array($p)&&(int)($p['id']??0)===$u['id']&&($p['username']??null)===$u['username'])return $p;return null;}
function authDemoAllowed(array $u,array $manifest):bool {return $u['is_demo']===1&&authDemoEnabled($manifest);}
function authDemoWrite(array $manifest):void {
 $path=authDemoPath();$tmp=tempnam(dirname($path),'.demo-');if($tmp===false)throw new RuntimeException('Cannot create private manifest');
 try{if(!chmod($tmp,0600)||file_put_contents($tmp,json_encode($manifest,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR))===false)throw new RuntimeException('Cannot write private manifest');
  if(PHP_OS_FAMILY!=='Windows'&&function_exists('posix_geteuid')&&posix_geteuid()===0){if(!chown($tmp,'www-data')||!chgrp($tmp,'www-data'))throw new RuntimeException('Cannot assign demo manifest to PHP service');}
  if(!rename($tmp,$path))throw new RuntimeException('Cannot publish private manifest');
 }finally{if(is_file($tmp))unlink($tmp);}
}
function authDemoLock(){ $path=authDemoPath().'.lock';if(is_link($path))throw new RuntimeException('Invalid manifest lock');$h=fopen($path,'c');if(!$h||!flock($h,LOCK_EX))throw new RuntimeException('Cannot lock demo configuration');chmod($path,0600);if(PHP_OS_FAMILY!=='Windows'&&function_exists('posix_geteuid')&&posix_geteuid()===0){chown($path,'www-data');chgrp($path,'www-data');}return $h; }
function authForget():void {$_SESSION=[];session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(24));}
function authRefresh(PDO $db):?array {
 $old=$_SESSION['user']??null;if(!$old)return null;$u=authAccount($db,(int)$old['id']);$manifest=authDemoRead();
 if(!$u||!$u['active']||(int)($old['auth_version']??0)!==$u['auth_version']||!in_array($old['role']??'', $u['roles'],true)||($u['is_demo']&&(!authDemoAllowed($u,$manifest)||($_SESSION['demo_epoch']??null)!==($manifest['epoch']??null)))){authForget();return null;}
 $u=authPublic($u,$old['role']);$_SESSION['user']=$u;return $u;
}
function authLogin(array $u,string $role):array {session_regenerate_id(true);$public=authPublic($u,$role);$_SESSION['user']=$public;$_SESSION['csrf']=bin2hex(random_bytes(24));$_SESSION['last_seen']=time();if($u['is_demo'])$_SESSION['demo_epoch']=authDemoRead()['epoch']??null;else unset($_SESSION['demo_epoch']);return ['user'=>$public,'csrf'=>$_SESSION['csrf']];}
function authRate(PDO $db,string $purpose,int $limit):void {
 $bucket=hash('sha256',($_SERVER['REMOTE_ADDR']??'unknown').'|'.$purpose);$db->beginTransaction();try{
  $q=$db->prepare('INSERT INTO auth_rate_limits(bucket,window_started,attempts) VALUES(?,NOW(),0) ON DUPLICATE KEY UPDATE bucket=VALUES(bucket)');$q->execute([$bucket]);
  $q=$db->prepare('SELECT attempts,window_started < DATE_SUB(NOW(),INTERVAL 15 MINUTE) expired FROM auth_rate_limits WHERE bucket=? FOR UPDATE');$q->execute([$bucket]);$r=$q->fetch(PDO::FETCH_ASSOC);$attempts=$r['expired']?0:(int)$r['attempts'];
  if($attempts>=$limit){$db->rollBack();reply(429,['error'=>'Too many attempts; retry after 15 minutes']);}
  $db->prepare('UPDATE auth_rate_limits SET attempts=?,window_started=IF(?,NOW(),window_started) WHERE bucket=?')->execute([$attempts+1,(int)$r['expired'],$bucket]);$db->commit();
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
function authText($value,int $max,string $label,bool $required=true):string {if(!is_string($value)||mb_strlen(trim($value))>$max||($required&&trim($value)===''))throw new InvalidArgumentException('Invalid '.$label);return trim($value);}
function authUsername($value):string {$v=authText($value,80,'username');if(!preg_match('/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/D',$v))throw new InvalidArgumentException('Username must be 3–80 letters, digits, dot, dash or underscore');return $v;}
function authEmail($value):string {$v=authText($value,254,'email');if(filter_var($v,FILTER_VALIDATE_EMAIL)===false)throw new InvalidArgumentException('Valid email required');return $v;}
function authPassword($value):string {if(!is_string($value)||mb_strlen($value)<12||strlen($value)>72)throw new InvalidArgumentException('Password must contain at least 12 characters and at most 72 bytes');return $value;}
function authAudit(PDO $db,int $actor,string $action,int $entity):void {$db->prepare('INSERT INTO audit_events(user_id,action,entity_id) VALUES(?,?,?)')->execute([$actor,$action,$entity]);}
