<?php
// Included by api.php after authentication; never opens its own connection.
if (!isset($db, $user, $action, $method) || !$user) {
    http_response_code(404);
    exit;
}
if (!in_array($action, ['owner-summary', 'system-health','owner-stations','owner-station'], true)) return;
$roles = $action !== 'system-health' ? ['owner'] : ['operator', 'owner'];
if (!in_array($user['role'] ?? '', $roles, true)) reply(403, ['error' => 'Role denied']);
if ($method !== 'GET') {
    header('Allow: GET');
    reply(405, ['error' => 'Method not allowed']);
}
try {
    $healthScope=(int)!empty($user['is_demo']);
    $runFrom="FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.user_id";
    $ledgerFrom="FROM cycle_ledger l JOIN cycle_runs r ON r.id=l.run_id JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.user_id";
    $scopeWhere="u.is_demo={$healthScope}";
    if($action==='owner-stations'){
        $rows=$db->query("SELECT s.id,s.name,s.active,COALESCE(r.runs,0) runs,COALESCE(r.completed,0) completed,COALESCE(r.failed,0) failed,COALESCE(r.pending,0) pending,COALESCE(r.held,0) held,COALESCE(l.charge,0) charge,COALESCE(l.refund,0) refund,COALESCE(l.net,0) net FROM stations s LEFT JOIN (SELECT r.station_id,COUNT(*) runs,SUM(r.state='completed') completed,SUM(r.state='failed') failed,SUM(r.state='completed' AND r.review='pending') pending,SUM(IF(r.state IN ('queued','playing'),r.price,0)) held {$runFrom} WHERE {$scopeWhere} GROUP BY r.station_id) r ON r.station_id=s.id LEFT JOIN (SELECT r.station_id,SUM(IF(l.kind='charge',l.amount,0)) charge,-SUM(IF(l.kind='refund',l.amount,0)) refund,SUM(l.amount) net {$ledgerFrom} WHERE {$scopeWhere} GROUP BY r.station_id) l ON l.station_id=s.id ORDER BY s.id")->fetchAll(PDO::FETCH_ASSOC);
        reply(200,['stations'=>$rows]);
    }
    if($action==='owner-station'){
        $id=filter_var($_GET['id']??null,FILTER_VALIDATE_INT);if(!$id||$id<1)reply(422,['error'=>'Invalid station']);
        $q=$db->prepare('SELECT id,name,active FROM stations WHERE id=?');$q->execute([$id]);$station=$q->fetch(PDO::FETCH_ASSOC);if(!$station)reply(404,['error'=>'Station not found']);
        $before=max(1,(int)($_GET['before']??PHP_INT_MAX));
        $q=$db->prepare('SELECT r.*,c.title,c.sha,c.mime,c.user_id,u.username owner_name FROM cycle_runs r JOIN cycle_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=c.user_id WHERE r.station_id=? AND r.id<? AND u.is_demo=? ORDER BY r.id DESC LIMIT 51');$q->execute([$id,$before,$healthScope]);$runs=$q->fetchAll(PDO::FETCH_ASSOC);$more=count($runs)>50;if($more)array_pop($runs);
        $q=$db->prepare('SELECT c.id FROM cycle_campaigns c JOIN users u ON u.id=c.user_id WHERE u.is_demo=?');$q->execute([$healthScope]);$visibleCampaigns=array_fill_keys($q->fetchAll(PDO::FETCH_COLUMN),true);
        foreach($runs as &$run){
            $trace=json_decode($run['trace_json']??'',true);$run['trace_json']=json_encode(is_array($trace)?array_values(array_filter($trace,fn($row)=>is_array($row)&&isset($visibleCampaigns[(int)($row['campaign']??0)]))):[]);
            $q=$db->prepare('SELECT id,kind,amount,created_at FROM cycle_ledger WHERE run_id=? ORDER BY id');$q->execute([$run['id']]);$run['ledger']=$q->fetchAll(PDO::FETCH_ASSOC);
            $q=$db->prepare('SELECT clip_ms,looking_ms,stopped_ms,confidence,source,metric_version,billable,created_at FROM cycle_attention WHERE run_id=? ORDER BY id DESC LIMIT 20');$q->execute([$run['id']]);$run['attention']=$q->fetchAll(PDO::FETCH_ASSOC);
        }unset($run);
        reply(200,['station'=>$station,'runs'=>$runs,'next_before'=>$more?(int)end($runs)['id']:null,'device_health'=>'unknown']);
    }
    if ($action === 'owner-summary') {
        // Separate scalar aggregates avoid multiplying ledger amounts by run joins.
        // Only queued/playing runs hold budget; completed runs are already charged.
        $row = $db->query("SELECT
          (SELECT COALESCE(SUM(l.amount),0) {$ledgerFrom} WHERE {$scopeWhere} AND l.kind='charge') AS charge,
          (SELECT -COALESCE(SUM(l.amount),0) {$ledgerFrom} WHERE {$scopeWhere} AND l.kind='refund') AS refund,
          (SELECT COALESCE(SUM(l.amount),0) {$ledgerFrom} WHERE {$scopeWhere}) AS net,
          (SELECT COUNT(*) {$runFrom} WHERE {$scopeWhere} AND r.state='completed' AND r.review='pending') AS pending_reviews,
          (SELECT COALESCE(SUM(r.price),0) {$runFrom} WHERE {$scopeWhere} AND r.state IN ('queued','playing')) AS budget_hold,
          (SELECT COUNT(*) {$runFrom} WHERE {$scopeWhere}) AS runs")->fetch(PDO::FETCH_ASSOC);
        foreach ($row as $key => $value) $row[$key] = (int)$value;
        reply(200, ['summary' => $row, 'currency' => 'THB', 'amount_unit' => 'satang', 'scope' => 'all_time', 'checked_at' => gmdate('c')]);
    }
    $started = microtime(true);
    // Proves these tables are readable, not that a screen or camera is online.
    $row = $db->query("SELECT
      (SELECT COUNT(*) FROM stations) AS stations,
      (SELECT COUNT(*) FROM stations WHERE active=1) AS active_stations,
      (SELECT COUNT(*) {$runFrom} WHERE {$scopeWhere}) AS runs,
      (SELECT COUNT(*) {$ledgerFrom} WHERE {$scopeWhere}) AS ledger_entries")->fetch(PDO::FETCH_ASSOC);
    foreach ($row as $key => $value) $row[$key] = (int)$value;
    reply(200, ['database' => ['status' => 'ok', 'query_ms' => round((microtime(true)-$started)*1000, 2)], 'counts' => $row, 'device_health' => 'unknown', 'device_health_reason' => 'No device heartbeat is recorded; active stations are configuration only.', 'checked_at' => gmdate('c')]);
} catch (Throwable $e) {
    reply(503, ['error' => 'Dashboard data unavailable']);
}
