<?php
declare(strict_types=1);
return static function(PDO $db):void{
 $db->exec("CREATE TABLE IF NOT EXISTS cycle_attention(id BIGINT AUTO_INCREMENT PRIMARY KEY,run_id INT NOT NULL,observation_key VARCHAR(80) NOT NULL UNIQUE,clip_ms INT NOT NULL,looking_ms INT NOT NULL,stopped_ms INT NOT NULL,confidence DECIMAL(5,4) NOT NULL,source VARCHAR(24) NOT NULL DEFAULT 'manual-simulation',metric_version VARCHAR(40) NOT NULL,payload_hash CHAR(64) NOT NULL,billable BOOLEAN NOT NULL DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(run_id) REFERENCES cycle_runs(id),CHECK(clip_ms>0 AND looking_ms>=0 AND looking_ms<=clip_ms AND stopped_ms>=0 AND stopped_ms<=clip_ms),CHECK(confidence>=0 AND confidence<=1),CHECK(billable=0))");
 foreach(['UPDATE','DELETE'] as $op)$db->exec('CREATE OR REPLACE TRIGGER cycle_attention_no_'.strtolower($op)." BEFORE {$op} ON cycle_attention FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Attention telemetry is append-only'");
};
