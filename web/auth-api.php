<?php
// Included before the application dispatch, with the session still writable.
try {
 if($action==='session'&&$method==='GET')reply(200,['user'=>$user,'csrf'=>$_SESSION['csrf']]);
 if($action==='demo-profiles'&&$method==='GET'){
  $m=authDemoRead();$enabled=authDemoEnabled($m);$profiles=[];
  if($enabled)foreach($m['profiles'] as $p){if(!is_array($p)||!is_string($p['password']??null))continue;$u=authAccount($db,(int)($p['id']??0));if(!$u||!$u['active']||!$u['is_demo']||$u['username']!==($p['username']??null)||!password_verify($p['password'],$u['password_hash']))continue;$profiles[]=['id'=>$u['id'],'username'=>$u['username'],'display_name'=>$u['display_name'],'password'=>$p['password'],'roles'=>$u['roles']];}
  reply(200,['enabled'=>$enabled,'expires_at'=>$m['expires_at']??null,'profiles'=>$profiles]);
 }
 if($action==='login'&&$method==='POST'){
  $username=authUsername($body['username']??null);authRate($db,'login-ip',200);authRate($db,'login-user:'.strtolower($username),30);
  $q=$db->prepare('SELECT id FROM users WHERE username=?');$q->execute([$username]);$id=$q->fetchColumn();$u=$id?authAccount($db,(int)$id):null;$password=$body['password']??'';
  if(!is_string($password)||!$u||!$u['active']||!password_verify($password,$u['password_hash']))reply(401,['error'=>'Username or password incorrect']);
  // Legacy local test accounts remain local-only; none are ever prefilled.
  if((!$local&&!$u['is_demo']&&str_ends_with(strtolower($u['username']),'.demo'))||($u['is_demo']&&!authDemoAllowed($u,authDemoRead())))reply(403,['error'=>'Demo access disabled or expired']);
  $role=$body['role']??(in_array($u['role'],$u['roles'],true)?$u['role']:($u['roles'][0]??''));if(!is_string($role)||!in_array($role,$u['roles'],true))reply(403,['error'=>'Role not assigned']);
  if(password_needs_rehash($u['password_hash'],PASSWORD_DEFAULT))$db->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),$u['id']]);
  reply(200,authLogin($u,$role));
 }
 if($action==='logout'&&$method==='POST'){authForget();reply(200,['ok'=>true,'csrf'=>$_SESSION['csrf']]);}
 if($action==='register'&&$method==='POST'){
  authRate($db,'register',20);$username=authUsername($body['username']??null);if(str_ends_with(strtolower($username),'.demo')||str_starts_with(strtolower($username),'trial-'))throw new InvalidArgumentException('Username is reserved for trial accounts');$display=authText($body['display_name']??null,120,'display name');$email=authEmail($body['email']??null);$password=authPassword($body['password']??null);
  if(isset($body['roles'])&&$body['roles']!==['customer'])throw new InvalidArgumentException('Registration assigns customer only');if(isset($body['role'])&&$body['role']!=='customer')throw new InvalidArgumentException('Registration assigns customer only');
  $db->beginTransaction();$db->prepare("INSERT INTO users(username,password_hash,role,display_name,email) VALUES(?,?,'customer',?,?)")->execute([$username,password_hash($password,PASSWORD_DEFAULT),$display,$email]);$id=(int)$db->lastInsertId();$db->prepare("INSERT INTO user_roles VALUES(?,'customer')")->execute([$id]);authAudit($db,$id,'auth.register',$id);$db->commit();reply(201,authLogin(authAccount($db,$id),'customer'));
 }
 if(in_array($action,['role-switch','users','user-save','profile','demo-mode'],true)){
  if(!$user)reply(401,['error'=>'Login required']);
  if($action==='role-switch'&&$method==='POST'){$role=$body['role']??null;if(!is_string($role)||!in_array($role,$user['roles'],true))reply(403,['error'=>'Role not assigned']);reply(200,authLogin(authAccount($db,$user['id']),$role));}
  if($action==='demo-mode'){
   if($user['role']!=='owner'||$user['is_demo'])reply(403,['error'=>'Non-demo owner required']);
   if($method==='POST'){
    if(!is_bool($body['enabled']??null))throw new InvalidArgumentException('enabled must be boolean');$days=$body['extend_days']??null;if($days!==null&&(!is_int($days)||$days<1||$days>14))throw new InvalidArgumentException('extend_days must be 1–14');
    $lock=authDemoLock();try{$m=authDemoRead();if(!is_array($m['profiles']??null))throw new RuntimeException('Provision demo profiles with CLI first');$m['enabled']=$body['enabled'];if($m['enabled']&&($days!==null||strtotime($m['expires_at']??'')<=time()))$m['expires_at']=gmdate('c',time()+86400*($days??14));$m['epoch']=bin2hex(random_bytes(16));authDemoWrite($m);authAudit($db,$user['id'],'auth.demo-mode',$user['id']);}finally{flock($lock,LOCK_UN);fclose($lock);}
   }elseif($method!=='GET')reply(405,['error'=>'Method denied']);
   $m=authDemoRead();reply(200,['enabled'=>authDemoEnabled($m),'expires_at'=>$m['expires_at']??null,'source'=>'private-manifest','profile_count'=>count($m['profiles']??[])]);
  }
  if($action==='users'&&$method==='GET'){
   if($user['role']!=='owner')reply(403,['error'=>'Owner required']);$ids=$db->query('SELECT id FROM users'.($user['is_demo']?' WHERE is_demo=1':'').' ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);$rows=[];foreach($ids as $id)$rows[]=authPublic(authAccount($db,(int)$id));reply(200,['users'=>$rows]);
  }
  if($action==='user-save'&&$method==='POST'){
   if($user['role']!=='owner')reply(403,['error'=>'Owner required']);$id=$body['id']??null;if($id!==null&&(!is_int($id)||$id<1))throw new InvalidArgumentException('Invalid user ID');
   $username=authUsername($body['username']??null);$display=authText($body['display_name']??null,120,'display name');$email=authEmail($body['email']??null);$roles=$body['roles']??null;$active=$body['active']??null;
   if(!is_array($roles)||!array_is_list($roles)||!$roles||count(array_unique($roles,SORT_REGULAR))!==count($roles))throw new InvalidArgumentException('Assigned roles required');foreach($roles as $role)if(!is_string($role)||!in_array($role,['customer','operator','reviewer','owner'],true))throw new InvalidArgumentException('Invalid role');
   if(!in_array($active,[true,false,0,1],true))throw new InvalidArgumentException('active must be boolean');$active=(int)$active;$password=isset($body['password'])&&$body['password']!==''?authPassword($body['password']):null;
   $db->exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');$db->beginTransaction();$db->query('SELECT id FROM auth_admin_lock WHERE id=1 FOR UPDATE')->fetchColumn();
   // Recheck caller privileges under the same administration mutex.
   $caller=authAccount($db,$user['id']);if(!$caller||!$caller['active']||$caller['auth_version']!==$user['auth_version']||!in_array('owner',$caller['roles'],true))throw new RuntimeException('Owner access changed');
   $old=$id?authAccount($db,$id):null;if($id&&!$old)throw new RuntimeException('User missing');
   if($old&&authDemoProfile(authDemoRead(),$old)!==null)throw new RuntimeException('Reserved trial profile; manage access with demo-mode or provisioning CLI');
   if($user['is_demo']&&($id===$user['id']||($old&&!$old['is_demo'])))reply(403,['error'=>'Demo owners manage other demo accounts only']);
   if($id){$db->prepare('UPDATE users SET username=?,display_name=?,email=?,active=?,role=?,auth_version=auth_version+1'.($password!==null?',password_hash=?':'').' WHERE id=?')->execute(array_merge([$username,$display,$email,$active,$roles[0]],$password!==null?[password_hash($password,PASSWORD_DEFAULT)]:[],[$id]));$db->prepare('DELETE FROM user_roles WHERE user_id=?')->execute([$id]);}
   else{if($password===null)throw new InvalidArgumentException('Password required for new user');$db->prepare('INSERT INTO users(username,display_name,email,active,role,password_hash,is_demo) VALUES(?,?,?,?,?,?,?)')->execute([$username,$display,$email,$active,$roles[0],password_hash($password,PASSWORD_DEFAULT),(int)$user['is_demo']]);$id=(int)$db->lastInsertId();}
   $q=$db->prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)');foreach($roles as $role)$q->execute([$id,$role]);
   if(!$db->query("SELECT COUNT(*) FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.active=1 AND u.is_demo=0 AND r.role='owner'")->fetchColumn())throw new RuntimeException('Last active non-demo owner must be retained');
   authAudit($db,$user['id'],'auth.user-save',$id);$db->commit();reply(200,['ok'=>true,'id'=>$id]);
  }
  if($action==='profile'){
   if($method==='GET')reply(200,['user'=>$user,'csrf'=>$_SESSION['csrf']]);
   if($method==='POST'){
    $display=array_key_exists('display_name',$body)?authText($body['display_name'],120,'display name'):$user['display_name'];$email=array_key_exists('email',$body)?authEmail($body['email']):$user['email'];$password=isset($body['password'])?authPassword($body['password']):null;
    $db->beginTransaction();$q=$db->prepare('SELECT id FROM users WHERE id=? FOR UPDATE');$q->execute([$user['id']]);$current=authAccount($db,$user['id']);if(!$current||!$current['active']||$current['auth_version']!==$user['auth_version'])throw new RuntimeException('Account changed');
    if($password!==null&&authDemoProfile(authDemoRead(),$current)!==null)throw new RuntimeException('Reserved trial profile password; use provisioning CLI');
    if($password!==null&&(!is_string($body['current_password']??null)||!password_verify($body['current_password'],$current['password_hash'])))throw new RuntimeException('Current password incorrect');
    $db->prepare('UPDATE users SET display_name=?,email=?'.($password!==null?',password_hash=?,auth_version=auth_version+1':'').' WHERE id=?')->execute(array_merge([$display,$email],$password!==null?[password_hash($password,PASSWORD_DEFAULT)]:[],[$user['id']]));authAudit($db,$user['id'],'auth.profile',$user['id']);$db->commit();reply(200,authLogin(authAccount($db,$user['id']),$user['role']));
   }
  }
  reply(404,['error'=>'Unknown auth endpoint']);
 }
}catch(Throwable $e){if($db->inTransaction())$db->rollBack();$code=$e instanceof InvalidArgumentException?422:409;reply($code,['error'=>$e instanceof PDOException?'Account change could not be saved':($e instanceof RuntimeException||$e instanceof InvalidArgumentException?$e->getMessage():'Authentication unavailable')]);}
