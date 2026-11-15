<?php
declare(strict_types=1);

$host = getenv('PROXIMITY_DB_HOST') ?: 'db';
$password = getenv('MARIADB_ROOT_PASSWORD');
if (!$password) throw new RuntimeException('MARIADB_ROOT_PASSWORD is required');
$db = new PDO("mysql:host={$host};dbname=proximity_lab;charset=utf8mb4", 'root', $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

$checks = [
    'wallet balance differs from wallet ledger' => 'SELECT w.user_id FROM wallet_accounts w LEFT JOIN (SELECT user_id,SUM(amount_minor) amount FROM wallet_ledger GROUP BY user_id) l ON l.user_id=w.user_id WHERE w.available_minor<>COALESCE(l.amount,0) LIMIT 1',
    'negative campaign escrow' => 'SELECT id FROM cycle_campaigns WHERE escrow_minor<0 LIMIT 1',
    'closed campaign retains escrow' => 'SELECT id FROM cycle_campaigns WHERE closed=1 AND escrow_minor<>0 LIMIT 1',
    'funded reservation exceeds escrow' => "SELECT c.id FROM cycle_campaigns c JOIN (SELECT campaign_id,SUM(price) reserved FROM cycle_runs WHERE state IN ('queued','playing') AND escrow_funded=1 GROUP BY campaign_id) r ON r.campaign_id=c.id WHERE r.reserved>c.escrow_minor LIMIT 1",
    'lease consumption exceeds cap' => 'SELECT id FROM budget_leases WHERE consumed_minor > cap_minor LIMIT 1',
    'ledger currency differs from campaign' => 'SELECT l.id FROM ledger_entries l JOIN campaigns c ON c.id=l.campaign_id WHERE l.currency<>c.currency LIMIT 1',
    'attention event missing metric version' => "SELECT event_key FROM station_events WHERE event_type='attention' AND metric_version_id IS NULL LIMIT 1",
    'play event missing manifest context' => "SELECT event_key FROM station_events WHERE event_type='play' AND (manifest_id IS NULL OR lease_id IS NULL OR creative_id IS NULL OR media_sha256 IS NULL) LIMIT 1",
    'validated metric lacks validation time' => "SELECT id FROM metric_versions WHERE status='validated' AND validated_at IS NULL LIMIT 1",
];
foreach ($checks as $name => $sql) {
    if ($db->query($sql)->fetchColumn() !== false) {
        fwrite(STDERR, "Invariant failed: {$name}\n");
        exit(1);
    }
}
fwrite(STDOUT, "Central database invariants OK\n");
