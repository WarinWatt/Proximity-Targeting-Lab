<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit(1);}
$authLibrary=__DIR__.'/../web/auth-lib.php';
if(!is_file($authLibrary))$authLibrary=rtrim(getenv('PROXIMITY_WEB_ROOT')?:'/var/www/html','/\\').'/auth-lib.php';
require_once $authLibrary;
$options=getopt('',['enable','disable','days:']);if(isset($options['enable'])&&isset($options['disable']))throw new RuntimeException('Choose --enable or --disable');
$days=filter_var($options['days']??14,FILTER_VALIDATE_INT);if($days===false||$days<1||$days>14)throw new RuntimeException('--days must be 1–14');
$configPath=getenv('PROXIMITY_CONFIG')?:'/data/proximity-config.json';$password=getenv('MARIADB_ROOT_PASSWORD');if(!$password)throw new RuntimeException('MARIADB_ROOT_PASSWORD required');$host=getenv('PROXIMITY_DB_HOST')?:'db';
$db=new PDO("mysql:host={$host};dbname=proximity_lab;charset=utf8mb4",'root',$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$lock=authDemoLock();try {
 $manifest=authDemoRead();
 if(isset($options['disable'])){$manifest['enabled']=false;$manifest['epoch']=bin2hex(random_bytes(16));$manifest['profiles']=$manifest['profiles']??[];authDemoWrite($manifest);echo "Demo mode disabled; accounts and ledgers preserved\n";exit;}
 $db->beginTransaction();$db->query('SELECT id FROM auth_admin_lock WHERE id=1 FOR UPDATE')->fetchColumn();$profiles=[];
 foreach(['customer'=>['customer'],'operator'=>['operator'],'reviewer'=>['reviewer'],'owner'=>['owner'],'manager'=>['customer','operator','reviewer','owner']] as $label=>$roles){
  $username='trial-'.$label;$q=$db->prepare('SELECT id FROM users WHERE username=?');$q->execute([$username]);$id=$q->fetchColumn();
  if($id){$u=authAccount($db,(int)$id);$profile=authDemoProfile($manifest,$u);$expected=$roles;$assigned=$u['roles'];sort($expected);sort($assigned);if(!$u['is_demo']||!$profile||!is_string($profile['password']??null)||!password_verify($profile['password'],$u['password_hash'])||$expected!==$assigned)throw new RuntimeException('Existing trial account is not aligned with private manifest; no passwords changed');$secret=$profile['password'];}
  else{$secret=bin2hex(random_bytes(18));$db->prepare('INSERT INTO users(username,password_hash,role,is_demo,display_name) VALUES(?,?,?,1,?)')->execute([$username,password_hash($secret,PASSWORD_DEFAULT),$roles[0],'Trial '.ucfirst($label)]);$id=(int)$db->lastInsertId();$q=$db->prepare('INSERT INTO user_roles VALUES(?,?)');foreach($roles as $role)$q->execute([$id,$role]);}
  $profiles[]=['id'=>(int)$id,'username'=>$username,'password'=>$secret,'roles'=>$roles];
 }
 $manifest=['enabled'=>isset($options['enable'])?true:(bool)($manifest['enabled']??false),'expires_at'=>isset($options['enable'])?gmdate('c',time()+86400*$days):($manifest['expires_at']??gmdate('c',time()+86400*$days)),'epoch'=>bin2hex(random_bytes(16)),'profiles'=>$profiles];
 // Publish credentials before commit: any failure rolls back newly created
 // accounts. Existing hashes are never reset. No credentials go to stdout.
 authDemoWrite($manifest);$db->commit();echo 'Five trial profiles provisioned; demo mode '.($manifest['enabled']?'enabled':'disabled')."; credentials remain in private manifest\n";
}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}finally{flock($lock,LOCK_UN);fclose($lock);}
