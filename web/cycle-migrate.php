<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$host=getenv('PROXIMITY_DB_HOST')?:'warin_db';$password=getenv('MARIADB_ROOT_PASSWORD');if(!$password)throw new RuntimeException('MARIADB_ROOT_PASSWORD is required');$d=new PDO("mysql:host={$host};dbname=proximity_lab;charset=utf8mb4",'root',$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$d->exec("CREATE TABLE IF NOT EXISTS cycle_campaigns(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL,title VARCHAR(80),target VARCHAR(20),bid INT NOT NULL,budget INT NOT NULL,spent INT NOT NULL DEFAULT 0,sha CHAR(64) NOT NULL,mime VARCHAR(40),media LONGBLOB,FOREIGN KEY(user_id) REFERENCES users(id))");
$d->exec("CREATE TABLE IF NOT EXISTS cycle_runs(id INT AUTO_INCREMENT PRIMARY KEY,station_id INT NOT NULL,campaign_id INT NOT NULL,request_key VARCHAR(80) UNIQUE NOT NULL,target VARCHAR(20),price INT NOT NULL,state VARCHAR(20),trace_json TEXT,started_at DATETIME(6),completed_at DATETIME(6),review VARCHAR(20),reason VARCHAR(500),FOREIGN KEY(station_id) REFERENCES stations(id),FOREIGN KEY(campaign_id) REFERENCES cycle_campaigns(id))");
$d->exec("CREATE TABLE IF NOT EXISTS cycle_ledger(id INT AUTO_INCREMENT PRIMARY KEY,run_id INT NOT NULL,kind VARCHAR(10),amount INT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(run_id,kind),FOREIGN KEY(run_id) REFERENCES cycle_runs(id))");
// Existing request payloads cannot be reconstructed: NULL deliberately rejects reuse.
$d->exec("ALTER TABLE cycle_runs ADD COLUMN IF NOT EXISTS request_payload_sha256 CHAR(64) NULL");
$d->exec("CREATE INDEX IF NOT EXISTS ix_cycle_station_state ON cycle_runs(station_id,state)");
$d->exec("CREATE INDEX IF NOT EXISTS ix_cycle_campaign_state ON cycle_runs(campaign_id,state)");
// Respect existing station metadata and archives; fill only missing pilot IDs.
// Central migrations may already require a unique station code.
$hasCode=(bool)$d->query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='stations' AND column_name='code'")->fetchColumn();
$seed=$d->prepare($hasCode?'INSERT INTO stations(id,name,active,code) SELECT ?,?,1,? WHERE NOT EXISTS (SELECT 1 FROM stations WHERE id=?)':'INSERT INTO stations(id,name,active) SELECT ?,?,1 WHERE NOT EXISTS (SELECT 1 FROM stations WHERE id=?)');
for($stationId=1;$stationId<=5;$stationId++){$values=[$stationId,'Station '.$stationId];if($hasCode)$values[]=sprintf('ST-%02d',$stationId);$values[]=$stationId;$seed->execute($values);}
echo "Cycle schema ready\n";
