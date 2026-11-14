<?php
// CLI-only, idempotent bootstrap. Never serves credentials over HTTP.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$path=getenv('PROXIMITY_CONFIG')?:'/var/lib/data-systems-lab/data/proximity-config.json';
if(file_exists($path)){$config=json_decode(file_get_contents($path),true);}else{$config=['user'=>'proximity_app','password'=>bin2hex(random_bytes(32))];}
$dbHost=getenv('PROXIMITY_DB_HOST')?:'warin_db';$rootPassword=getenv('MARIADB_ROOT_PASSWORD');if(!$rootPassword)throw new RuntimeException('MARIADB_ROOT_PASSWORD is required');
$root=new PDO("mysql:host={$dbHost};charset=utf8mb4",'root',$rootPassword,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$root->exec('CREATE DATABASE IF NOT EXISTS proximity_lab CHARACTER SET utf8mb4');
$root->exec('CREATE USER IF NOT EXISTS proximity_app@\'%\' IDENTIFIED BY '.$root->quote($config['password']));
$root->exec("GRANT SELECT,INSERT,UPDATE,DELETE ON proximity_lab.* TO proximity_app@'%'");
$root->exec('USE proximity_lab');
$root->exec('CREATE TABLE IF NOT EXISTS users(id INT AUTO_INCREMENT PRIMARY KEY,username VARCHAR(80) UNIQUE NOT NULL,password_hash VARCHAR(255) NOT NULL,role VARCHAR(20) NOT NULL)');
$root->exec('CREATE TABLE IF NOT EXISTS stations(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(80) NOT NULL,active BOOLEAN NOT NULL DEFAULT 1)');
$root->exec('CREATE TABLE IF NOT EXISTS audit_events(id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL,action VARCHAR(80) NOT NULL,entity_id INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id))');
$root->exec('CREATE TABLE IF NOT EXISTS auth_attempts(id BIGINT AUTO_INCREMENT PRIMARY KEY,ip VARCHAR(64),attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(ip,attempted_at))');
if(getenv('PROXIMITY_CREATE_DEMOS')==='1')foreach(['customer','operator','reviewer','owner'] as $role){$q=$root->prepare('INSERT IGNORE INTO users(username,password_hash,role) VALUES (?,?,?)');$q->execute([$role.'.demo',password_hash('LabTest!2026-'.$role,PASSWORD_DEFAULT),$role]);}
$q=$root->prepare('INSERT IGNORE INTO stations(id,name) VALUES (?,?)');foreach(['ประตูทางเข้า','โถงยอดนิยม','หน้าร้านค้า','ทางเดิน','ทางออก'] as $i=>$name)$q->execute([$i+1,$name]);
file_put_contents($path,json_encode($config));chmod($path,0640);echo "Local database ready\n";
