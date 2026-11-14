<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
[$script,$username,$role]=$argv+[null,null,null];
if(!is_string($username)||!preg_match('/^[a-zA-Z0-9_-]{3,60}$/',$username)||!in_array($role,['customer','operator','reviewer','owner'],true))throw new RuntimeException('Usage: provision-account.php username role');
$path=getenv('PROXIMITY_CONFIG')?:'/var/lib/data-systems-lab/data/proximity-config.json';
$config=json_decode(file_get_contents($path),true,512,JSON_THROW_ON_ERROR);
$host=getenv('PROXIMITY_DB_HOST')?:'warin_db';
$db=new PDO("mysql:host={$host};dbname=proximity_lab;charset=utf8mb4",$config['user'],$config['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$password=bin2hex(random_bytes(24));
$q=$db->prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)');$q->execute([$username,password_hash($password,PASSWORD_DEFAULT),$role]);
$secret=dirname($path).'/'.$username.'-initial-credentials.json';
$handle=fopen($secret,'x');if(!$handle)throw new RuntimeException('Credential file already exists');chmod($secret,0600);fwrite($handle,json_encode(['username'=>$username,'password'=>$password,'role'=>$role],JSON_PRETTY_PRINT));fclose($handle);
echo "Account provisioned; initial credentials saved outside web root.\n";
