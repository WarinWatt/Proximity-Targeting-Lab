<?php
declare(strict_types=1);
ini_set('display_errors','0');
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');
function reply(int $code,array $data): never {http_response_code($code);echo json_encode($data,JSON_UNESCAPED_UNICODE);exit;}
$host=strtolower((string)parse_url('http://'.($_SERVER['HTTP_HOST']??''),PHP_URL_HOST));
$local=in_array($host,['localhost','127.0.0.1'],true);
$allowed=array_filter(array_map('trim',explode(',',getenv('PROXIMITY_ALLOWED_HOSTS')?:'localhost,127.0.0.1')));
if(!in_array($host,$allowed,true))reply(403,['error'=>'Host denied']);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');
$cookiePath=rtrim(str_replace('\\','/',dirname($_SERVER['SCRIPT_NAME']??'/api.php')),'/').'/';
session_name('proximity_lab');session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict','path'=>$cookiePath,'secure'=>!$local]);session_start();
if(isset($_SESSION['last_seen'])&&time()-$_SESSION['last_seen']>1800){$_SESSION=[];session_regenerate_id(true);}
$_SESSION['last_seen']=time();
try{$configPath=getenv('PROXIMITY_CONFIG')?:'/var/lib/data-systems-lab/data/proximity-config.json';$config=json_decode(file_get_contents($configPath),true,512,JSON_THROW_ON_ERROR);$dbHost=getenv('PROXIMITY_DB_HOST')?:'warin_db';$db=new PDO("mysql:host={$dbHost};dbname=proximity_lab;charset=utf8mb4",$config['user'],$config['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);}catch(Throwable $e){reply(503,['error'=>'Database unavailable']);}
$action=$_GET['action']??'session';$method=$_SERVER['REQUEST_METHOD'];
if(!in_array($method,['GET','POST'],true)){header('Allow: GET, POST');reply(405,['error'=>'Method not allowed']);}
if((int)($_SERVER['CONTENT_LENGTH']??0)>12*1024*1024)reply(413,['error'=>'Request too large']);
$raw=file_get_contents('php://input');$body=[];
if($raw!==''){try{$body=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($body))reply(422,['error'=>'JSON object required']);}catch(JsonException $e){reply(400,['error'=>'Invalid JSON']);}}
if(!isset($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(24));
if($method==='POST'){
 $expectedOrigin=($local?'http':'https').'://'.($_SERVER['HTTP_HOST']??'');if(($_SERVER['HTTP_ORIGIN']??'')!==$expectedOrigin)reply(403,['error'=>'Origin denied']);
 if(!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??''))reply(403,['error'=>'CSRF denied']);
}
require_once __DIR__.'/auth-lib.php';
try{$user=authRefresh($db);}catch(Throwable $e){reply(503,['error'=>'Account verification unavailable']);}
require __DIR__.'/auth-api.php';
if(!$user)reply(401,['error'=>'Login required']);
session_write_close(); // Allow concurrent station requests; DB transactions enforce shared budgets.
if($action==='wallet'||str_starts_with($action,'wallet-'))require __DIR__.'/wallet-api.php';
if(in_array($action,['owner-summary','system-health','owner-stations','owner-station'],true))require __DIR__.'/health-api.php';
if($action==='cycle-attention')require __DIR__.'/attention-api.php';
if(str_starts_with($action,'cycle-'))require __DIR__.'/cycle-api.php';
if($action==='stations'&&$method==='GET')reply(200,['stations'=>$db->query('SELECT * FROM stations ORDER BY id')->fetchAll(PDO::FETCH_ASSOC)]);
if($action==='station'&&$method==='POST'){
 if($user['is_demo'])reply(403,['error'=>'Demo accounts cannot modify shared stations']);
 if(!in_array($user['role'],['operator','owner'],true))reply(403,['error'=>'Operator or owner required']);
 $name=trim((string)($body['name']??''));if($name===''||mb_strlen($name)>80)reply(422,['error'=>'Name required (max 80)']);
 $id=(int)($body['id']??0);$active=!empty($body['active'])?1:0;
 $db->beginTransaction();try{if($id){$q=$db->prepare('SELECT id FROM stations WHERE id=? FOR UPDATE');$q->execute([$id]);if(!$q->fetchColumn()){ $db->rollBack();reply(404,['error'=>'Station not found']);}$db->prepare('UPDATE stations SET name=?,active=? WHERE id=?')->execute([$name,$active,$id]);}else{$db->prepare('INSERT INTO stations(name,active) VALUES (?,?)')->execute([$name,1]);$id=(int)$db->lastInsertId();}$db->prepare('INSERT INTO audit_events(user_id,action,entity_id) VALUES (?,?,?)')->execute([$user['id'],'station.save',$id]);$db->commit();}catch(Throwable $e){$db->rollBack();reply(409,['error'=>'Could not save station']);}reply(200,['id'=>$id]);
}
if($action==='audit'&&$method==='GET'){if(!in_array($user['role'],['operator','reviewer','owner'],true))reply(403,['error'=>'Role denied']);reply(200,['events'=>$db->query('SELECT a.id,a.user_id,a.action,a.entity_id,a.created_at FROM audit_events a JOIN users u ON u.id=a.user_id'.($user['is_demo']?' WHERE u.is_demo=1':'').' ORDER BY a.id DESC LIMIT 100')->fetchAll(PDO::FETCH_ASSOC)]);}
reply(404,['error'=>'Unknown endpoint']);
