<?php
declare(strict_types=1);

$host = getenv('PROXIMITY_DB_HOST') ?: 'db';
$password = getenv('MARIADB_ROOT_PASSWORD');
if (!$password) throw new RuntimeException('MARIADB_ROOT_PASSWORD is required');
$db = new PDO("mysql:host={$host};dbname=proximity_lab;charset=utf8mb4", 'root', $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

$required = ['schema_migrations','accounts','station_keys','media_assets','campaigns','creatives','manifests','budget_leases','ingest_batches','metric_versions','station_events','ledger_entries','station_heartbeats'];
$table = $db->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?');
foreach ($required as $name) {
    $table->execute([$name]);
    if ((int)$table->fetchColumn() !== 1) throw new RuntimeException("Missing table: {$name}");
}

$suffix = bin2hex(random_bytes(5));
$db->prepare('INSERT INTO accounts(name) VALUES (?)')->execute(["Database test {$suffix}"]);
$accountId = (int)$db->lastInsertId();
$campaign = $db->prepare("INSERT INTO campaigns(account_id,name,budget_minor,currency,base_price_minor,starts_at,ends_at) VALUES (?,?,?,?,?,NOW(6),DATE_ADD(NOW(6),INTERVAL 1 DAY))");
$campaign->execute([$accountId, "Immutability {$suffix}", 1000, 'THB', 10]);
$campaignId = (int)$db->lastInsertId();
$db->prepare("INSERT INTO ledger_entries(idempotency_key,campaign_id,entry_type,amount_minor,currency) VALUES (?,?, 'fund',1000,'THB')")->execute(["db-test-{$suffix}", $campaignId]);
$ledgerId = (int)$db->lastInsertId();

foreach (["UPDATE ledger_entries SET amount_minor=0 WHERE id={$ledgerId}", "DELETE FROM ledger_entries WHERE id={$ledgerId}"] as $sql) {
    try {
        $db->exec($sql);
        throw new RuntimeException('Immutable ledger mutation unexpectedly succeeded');
    } catch (PDOException $error) {
        if ($error->getCode() !== '45000') throw $error;
    }
}

fwrite(STDOUT, "Central database acceptance tests OK\n");
