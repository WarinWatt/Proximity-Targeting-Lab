<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');
function reply(int $code,array $data): never {http_response_code($code);echo json_encode($data,JSON_UNESCAPED_UNICODE);exit;}
// Demo credentials and API are deliberately unavailable on public hostnames.
$host=parse_url('http://'.($_SERVER['HTTP_HOST']??''),PHP_URL_HOST);
if(!in_array($host,['localhost','127.0.0.1'],true))reply(403,['error'=>'Local test environment only']);
session_name('proximity_lab');session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict','path'=>'/pages/content-decision-lab/','secure'=>false]);session_start();
try{$configPath=getenv('PROXIMITY_CONFIG')?:'/var/lib/data-systems-lab/data/proximity-config.json';$config=json_decode(file_get_contents($configPath),true,512,JSON_THROW_ON_ERROR);$dbHost=getenv('PROXIMITY_DB_HOST')?:'warin_db';$db=new PDO("mysql:host={$dbHost};dbname=proximity_lab;charset=utf8mb4",$config['user'],$config['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);}catch(Throwable $e){reply(503,['error'=>'Database unavailable']);}
$action=$_GET['action']??'session';$method=$_SERVER['REQUEST_METHOD'];$body=json_decode(file_get_contents('php://input'),true)??[];
if(!isset($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(24));
if($method==='POST'){
 $originHost=parse_url($_SERVER['HTTP_ORIGIN']??'',PHP_URL_HOST);if(!in_array($originHost,['localhost','127.0.0.1'],true))reply(403,['error'=>'Origin denied']);
 if(!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??''))reply(403,['error'=>'CSRF denied']);
}
if($action==='session')reply(200,['user'=>$_SESSION['user']??null,'csrf'=>$_SESSION['csrf']]);
if($action==='login'&&$method==='POST'){
 $ip=$_SERVER['REMOTE_ADDR']??'unknown';$q=$db->prepare('SELECT COUNT(*) FROM auth_attempts WHERE ip=? AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)');$q->execute([$ip]);if((int)$q->fetchColumn()>=30)reply(429,['error'=>'Too many attempts; retry after 15 minutes']);
 $db->prepare('INSERT INTO auth_attempts(ip) VALUES (?)')->execute([$ip]);
 $q=$db->prepare('SELECT id,username,password_hash,role FROM users WHERE username=?');$q->execute([(string)($body['username']??'')]);$u=$q->fetch(PDO::FETCH_ASSOC);
 if(!$u||!password_verify((string)($body['password']??''),$u['password_hash']))reply(401,['error'=>'Username or password incorrect']);
 session_regenerate_id(true);unset($u['password_hash']);$_SESSION['user']=$u;$_SESSION['csrf']=bin2hex(random_bytes(24));reply(200,['user'=>$u,'csrf'=>$_SESSION['csrf']]);
}
if($action==='logout'&&$method==='POST'){$_SESSION=[];session_destroy();reply(200,['ok'=>true]);}
$user=$_SESSION['user']??null;if(!$user)reply(401,['error'=>'Login required']);
if(str_starts_with($action,'cycle-'))require __DIR__.'/cycle-api.php';
if($action==='stations'&&$method==='GET')reply(200,['stations'=>$db->query('SELECT * FROM stations ORDER BY id')->fetchAll(PDO::FETCH_ASSOC)]);
if($action==='station'&&$method==='POST'){
 if(!in_array($user['role'],['operator','owner'],true))reply(403,['error'=>'Operator or owner required']);
 $name=trim((string)($body['name']??''));if($name===''||mb_strlen($name)>80)reply(422,['error'=>'Name required (max 80)']);
 $id=(int)($body['id']??0);$active=!empty($body['active'])?1:0;
 $db->beginTransaction();try{if($id){$q=$db->prepare('SELECT id FROM stations WHERE id=? FOR UPDATE');$q->execute([$id]);if(!$q->fetchColumn()){ $db->rollBack();reply(404,['error'=>'Station not found']);}$db->prepare('UPDATE stations SET name=?,active=? WHERE id=?')->execute([$name,$active,$id]);}else{$db->prepare('INSERT INTO stations(name,active) VALUES (?,?)')->execute([$name,1]);$id=(int)$db->lastInsertId();}$db->prepare('INSERT INTO audit_events(user_id,action,entity_id) VALUES (?,?,?)')->execute([$user['id'],'station.save',$id]);$db->commit();}catch(Throwable $e){$db->rollBack();reply(409,['error'=>'Could not save station']);}reply(200,['id'=>$id]);
}
if($action==='audit'&&$method==='GET'){if(!in_array($user['role'],['operator','reviewer','owner'],true))reply(403,['error'=>'Role denied']);reply(200,['events'=>$db->query('SELECT id,user_id,action,entity_id,created_at FROM audit_events ORDER BY id DESC LIMIT 100')->fetchAll(PDO::FETCH_ASSOC)]);}
reply(404,['error'=>'Unknown endpoint']);
