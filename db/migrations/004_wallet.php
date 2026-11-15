<?php
declare(strict_types=1);
return static function(PDO $db):void {
 $db->exec("CREATE TABLE IF NOT EXISTS wallet_accounts(user_id INT PRIMARY KEY,available_minor BIGINT NOT NULL DEFAULT 0,CHECK(available_minor>=0),FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB");
 $db->exec("INSERT IGNORE INTO wallet_accounts(user_id) SELECT id FROM users");
 $db->exec("ALTER TABLE cycle_campaigns ADD COLUMN IF NOT EXISTS funded BOOLEAN NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS closed BOOLEAN NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS escrow_minor BIGINT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS purchase_key VARCHAR(120) NULL, ADD COLUMN IF NOT EXISTS purchase_payload_hash CHAR(64) NULL");
 $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_cycle_purchase_key ON cycle_campaigns(purchase_key)");
 $db->exec("ALTER TABLE cycle_runs ADD COLUMN IF NOT EXISTS escrow_funded BOOLEAN NOT NULL DEFAULT 0");
 $db->exec("CREATE TABLE IF NOT EXISTS wallet_ledger(id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL,actor_id INT NOT NULL,campaign_id INT NULL,run_id INT NULL,kind VARCHAR(24) NOT NULL,amount_minor BIGINT NOT NULL,available_after_minor BIGINT NOT NULL,request_key VARCHAR(120) NOT NULL UNIQUE,payload_hash CHAR(64) NOT NULL,reason VARCHAR(500) NOT NULL,created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),INDEX(user_id,id),CHECK(available_after_minor>=0),FOREIGN KEY(user_id) REFERENCES wallet_accounts(user_id),FOREIGN KEY(actor_id) REFERENCES users(id),FOREIGN KEY(campaign_id) REFERENCES cycle_campaigns(id),FOREIGN KEY(run_id) REFERENCES cycle_runs(id)) ENGINE=InnoDB");
 foreach(['UPDATE','DELETE'] as $op)$db->exec('CREATE OR REPLACE TRIGGER wallet_ledger_no_'.strtolower($op)." BEFORE {$op} ON wallet_ledger FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Wallet ledger is append-only'");
};
