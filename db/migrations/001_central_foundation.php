<?php
declare(strict_types=1);

return static function (PDO $db): void {
    $statements = [
        "ALTER TABLE stations
            ADD COLUMN IF NOT EXISTS code VARCHAR(40) NULL,
            ADD COLUMN IF NOT EXISTS protocol_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS status ENUM('provisioning','online','degraded','disabled') NOT NULL DEFAULT 'provisioning',
            ADD COLUMN IF NOT EXISTS last_seen_at DATETIME(6) NULL,
            ADD COLUMN IF NOT EXISTS last_seq_no BIGINT UNSIGNED NOT NULL DEFAULT 0",
        "UPDATE stations SET code=CONCAT('ST-',LPAD(id,2,'0')) WHERE code IS NULL",
        "ALTER TABLE stations MODIFY code VARCHAR(40) NOT NULL",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_station_code ON stations(code)",
        "CREATE TABLE IF NOT EXISTS accounts(
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(160) NOT NULL,
            status ENUM('active','suspended') NOT NULL DEFAULT 'active',
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS station_keys(
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            station_id INT NOT NULL,
            key_version INT UNSIGNED NOT NULL,
            public_key VARBINARY(64) NOT NULL,
            valid_from DATETIME(6) NOT NULL,
            revoked_at DATETIME(6) NULL,
            UNIQUE(station_id,key_version),
            FOREIGN KEY(station_id) REFERENCES stations(id)
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS media_assets(
            sha256 CHAR(64) PRIMARY KEY,
            account_id BIGINT UNSIGNED NOT NULL,
            mime_type VARCHAR(80) NOT NULL,
            byte_size BIGINT UNSIGNED NOT NULL,
            duration_ms INT UNSIGNED NOT NULL,
            storage_path VARCHAR(500) NOT NULL,
            approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            FOREIGN KEY(account_id) REFERENCES accounts(id),
            CHECK(byte_size > 0), CHECK(duration_ms > 0)
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS campaigns(
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            account_id BIGINT UNSIGNED NOT NULL,
            name VARCHAR(160) NOT NULL,
            status ENUM('draft','pending_review','active','paused','exhausted','completed') NOT NULL DEFAULT 'draft',
            budget_minor BIGINT UNSIGNED NOT NULL,
            currency CHAR(3) NOT NULL DEFAULT 'THB',
            base_price_minor BIGINT UNSIGNED NOT NULL,
            starts_at DATETIME(6) NOT NULL,
            ends_at DATETIME(6) NOT NULL,
            row_version INT UNSIGNED NOT NULL DEFAULT 1,
            FOREIGN KEY(account_id) REFERENCES accounts(id),
            CHECK(ends_at > starts_at)
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS creatives(
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            campaign_id BIGINT UNSIGNED NOT NULL,
            media_sha256 CHAR(64) NOT NULL,
            variant_key VARCHAR(32) NOT NULL DEFAULT 'A',
            traffic_weight SMALLINT UNSIGNED NOT NULL DEFAULT 100,
            targeting_rules JSON NOT NULL,
            UNIQUE(campaign_id,variant_key),
            FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
            FOREIGN KEY(media_sha256) REFERENCES media_assets(sha256),
            CHECK(traffic_weight <= 10000)
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS manifests(
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            station_id INT NOT NULL,
            version BIGINT UNSIGNED NOT NULL,
            protocol_version SMALLINT UNSIGNED NOT NULL,
            body_json JSON NOT NULL,
            body_sha256 CHAR(64) NOT NULL,
            signature VARBINARY(128) NOT NULL,
            valid_until DATETIME(6) NOT NULL,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            UNIQUE(station_id,version),
            FOREIGN KEY(station_id) REFERENCES stations(id)
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS budget_leases(
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            campaign_id BIGINT UNSIGNED NOT NULL,
            station_id INT NOT NULL,
            manifest_id BIGINT UNSIGNED NOT NULL,
            cap_minor BIGINT UNSIGNED NOT NULL,
            consumed_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
            status ENUM('active','exhausted','expired','reconciled','revoked') NOT NULL DEFAULT 'active',
            expires_at DATETIME(6) NOT NULL,
            reconciled_at DATETIME(6) NULL,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
            FOREIGN KEY(station_id) REFERENCES stations(id),
            FOREIGN KEY(manifest_id) REFERENCES manifests(id),
            CHECK(consumed_minor <= cap_minor)
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS ingest_batches(
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            station_id INT NOT NULL,
            boot_epoch CHAR(36) NOT NULL,
            first_seq BIGINT UNSIGNED NOT NULL,
            last_seq BIGINT UNSIGNED NOT NULL,
            payload_sha256 CHAR(64) NOT NULL,
            signature VARBINARY(128) NOT NULL,
            received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            UNIQUE(station_id,payload_sha256),
            FOREIGN KEY(station_id) REFERENCES stations(id),
            CHECK(last_seq >= first_seq)
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS metric_versions(
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            version VARCHAR(40) NOT NULL,
            status ENUM('draft','validated','retired') NOT NULL DEFAULT 'draft',
            validated_at DATETIME(6) NULL,
            evidence_uri VARCHAR(500) NULL,
            UNIQUE(name,version)
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS station_events(
            event_key VARCHAR(120) PRIMARY KEY,
            station_id INT NOT NULL,
            boot_epoch CHAR(36) NOT NULL,
            seq BIGINT UNSIGNED NOT NULL,
            batch_id BIGINT UNSIGNED NOT NULL,
            event_type ENUM('play','attention','health') NOT NULL,
            manifest_id BIGINT UNSIGNED NULL,
            lease_id BIGINT UNSIGNED NULL,
            creative_id BIGINT UNSIGNED NULL,
            media_sha256 CHAR(64) NULL,
            metric_version_id BIGINT UNSIGNED NULL,
            occurred_at DATETIME(6) NOT NULL,
            received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            monotonic_ms BIGINT UNSIGNED NOT NULL,
            payload_json JSON NOT NULL,
            UNIQUE(station_id,boot_epoch,seq),
            FOREIGN KEY(station_id) REFERENCES stations(id),
            FOREIGN KEY(batch_id) REFERENCES ingest_batches(id),
            FOREIGN KEY(manifest_id) REFERENCES manifests(id),
            FOREIGN KEY(lease_id) REFERENCES budget_leases(id),
            FOREIGN KEY(creative_id) REFERENCES creatives(id),
            FOREIGN KEY(media_sha256) REFERENCES media_assets(sha256),
            FOREIGN KEY(metric_version_id) REFERENCES metric_versions(id),
            CHECK((event_type='attention' AND metric_version_id IS NOT NULL) OR event_type<>'attention')
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS ledger_entries(
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            idempotency_key VARCHAR(160) NOT NULL UNIQUE,
            campaign_id BIGINT UNSIGNED NOT NULL,
            lease_id BIGINT UNSIGNED NULL,
            event_key VARCHAR(120) NULL,
            entry_type ENUM('fund','reserve','spend','release','refund','adjust') NOT NULL,
            amount_minor BIGINT UNSIGNED NOT NULL,
            currency CHAR(3) NOT NULL,
            reverses_entry_id BIGINT UNSIGNED NULL,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            UNIQUE(event_key,entry_type),
            FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
            FOREIGN KEY(lease_id) REFERENCES budget_leases(id),
            FOREIGN KEY(event_key) REFERENCES station_events(event_key),
            FOREIGN KEY(reverses_entry_id) REFERENCES ledger_entries(id)
        ) ENGINE=InnoDB",
        "CREATE TABLE IF NOT EXISTS station_heartbeats(
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            station_id INT NOT NULL,
            manifest_version BIGINT UNSIGNED NULL,
            outbox_depth INT UNSIGNED NOT NULL,
            disk_free_bytes BIGINT UNSIGNED NOT NULL,
            clock_offset_ms INT NOT NULL,
            lease_state_json JSON NOT NULL,
            received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            INDEX(station_id,received_at),
            FOREIGN KEY(station_id) REFERENCES stations(id)
        ) ENGINE=InnoDB"
    ];
    foreach ($statements as $sql) {
        $db->exec($sql);
    }

    foreach (['ledger_entries', 'station_events'] as $table) {
        foreach (['UPDATE', 'DELETE'] as $operation) {
            $trigger = 'deny_' . strtolower($operation) . '_' . $table;
            $db->exec("DROP TRIGGER IF EXISTS {$trigger}");
            $db->exec("CREATE TRIGGER {$trigger} BEFORE {$operation} ON {$table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Immutable event or ledger row'");
        }
    }
};
