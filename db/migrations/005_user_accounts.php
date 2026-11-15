<?php
declare(strict_types=1);
return static function(PDO $db):void {
 $db->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS display_name VARCHAR(120) NULL, ADD COLUMN IF NOT EXISTS email VARCHAR(254) NULL, ADD COLUMN IF NOT EXISTS auth_version BIGINT NOT NULL DEFAULT 1");
 $db->exec("CREATE TABLE IF NOT EXISTS user_roles(user_id INT NOT NULL,role VARCHAR(20) NOT NULL,PRIMARY KEY(user_id,role),FOREIGN KEY(user_id) REFERENCES users(id),CHECK(role IN ('customer','operator','reviewer','owner'))) ENGINE=InnoDB");
 $db->exec("INSERT IGNORE INTO user_roles(user_id,role) SELECT id,role FROM users WHERE role IN ('customer','operator','reviewer','owner')");
 $db->exec('CREATE TABLE IF NOT EXISTS auth_admin_lock(id INT PRIMARY KEY) ENGINE=InnoDB');$db->exec('INSERT IGNORE INTO auth_admin_lock VALUES(1)');
 $db->exec('CREATE TABLE IF NOT EXISTS auth_rate_limits(bucket CHAR(64) PRIMARY KEY,window_started DATETIME NOT NULL,attempts INT NOT NULL DEFAULT 0) ENGINE=InnoDB');
};
