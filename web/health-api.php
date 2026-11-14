<?php
// Included by api.php after authentication; never opens its own connection.
if (!isset($db, $user, $action, $method) || !$user) {
    http_response_code(404);
    exit;
}
if (!in_array($action, ['owner-summary', 'system-health'], true)) return;
$roles = $action === 'owner-summary' ? ['owner'] : ['operator', 'owner'];
if (!in_array($user['role'] ?? '', $roles, true)) reply(403, ['error' => 'Role denied']);
if ($method !== 'GET') {
    header('Allow: GET');
    reply(405, ['error' => 'Method not allowed']);
}
try {
    if ($action === 'owner-summary') {
        // Separate scalar aggregates avoid multiplying ledger amounts by run joins.
        // Only queued/playing runs hold budget; completed runs are already charged.
        $row = $db->query("SELECT
          (SELECT COALESCE(SUM(amount),0) FROM cycle_ledger WHERE kind='charge') AS charge,
          (SELECT -COALESCE(SUM(amount),0) FROM cycle_ledger WHERE kind='refund') AS refund,
          (SELECT COALESCE(SUM(amount),0) FROM cycle_ledger) AS net,
          (SELECT COUNT(*) FROM cycle_runs WHERE state='completed' AND review='pending') AS pending_reviews,
          (SELECT COALESCE(SUM(price),0) FROM cycle_runs WHERE state IN ('queued','playing')) AS budget_hold,
          (SELECT COUNT(*) FROM cycle_runs) AS runs")->fetch(PDO::FETCH_ASSOC);
        foreach ($row as $key => $value) $row[$key] = (int)$value;
        reply(200, ['summary' => $row, 'currency' => 'THB', 'amount_unit' => 'satang', 'scope' => 'all_time', 'checked_at' => gmdate('c')]);
    }
    $started = microtime(true);
    // Proves these tables are readable, not that a screen or camera is online.
    $row = $db->query("SELECT
      (SELECT COUNT(*) FROM stations) AS stations,
      (SELECT COUNT(*) FROM stations WHERE active=1) AS active_stations,
      (SELECT COUNT(*) FROM cycle_runs) AS runs,
      (SELECT COUNT(*) FROM cycle_ledger) AS ledger_entries")->fetch(PDO::FETCH_ASSOC);
    foreach ($row as $key => $value) $row[$key] = (int)$value;
    reply(200, ['database' => ['status' => 'ok', 'query_ms' => round((microtime(true)-$started)*1000, 2)], 'counts' => $row, 'device_health' => 'unknown', 'device_health_reason' => 'No device heartbeat is recorded; active stations are configuration only.', 'checked_at' => gmdate('c')]);
} catch (Throwable $e) {
    reply(503, ['error' => 'Dashboard data unavailable']);
}
