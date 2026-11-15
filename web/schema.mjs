export const entities={
 wallet_accounts:['PK/FK user_id','available_minor BIGINT >= 0; available grant credits, THB minor units'],
 wallet_ledger:['PK id','FK user_id, actor_id, campaign_id (nullable), run_id (nullable)','kind, amount_minor, available_after_minor, request_key UNIQUE, payload_hash, reason, created_at; append-only grant/fund/close/refund'],
 cycle_attention:['PK id','FK run_id','observation_key UNIQUE, clip_ms, looking_ms, stopped_ms, confidence, source, metric_version, payload_hash, billable=false; append-only manual telemetry'],
 cycle_campaigns:['PK id','FK user_id','title, target, bid, budget, spent, sha, mime, media (<=8MB), funded, closed, escrow_minor, purchase_key UNIQUE, purchase_payload_hash; funded credit purchases'],
 cycle_runs:['PK id','FK station_id, campaign_id','request_key (unique), request_payload_sha256 (nullable for legacy requests), escrow_funded (legacy=false), target, price, state, trace_json, started_at, completed_at, review, reason; queued/playing price reserves campaign escrow'],
 cycle_ledger:['PK id','FK run_id','kind, amount, created_at; UNIQUE(run_id,kind); LIVE'],
 auth_users:['PK id','username (unique), password_hash, role; LIVE MariaDB users'],
 central_stations:['PK id','name, active; LIVE MariaDB stations (five integrated stations; cycle station_id defaults to 1)'],
 auth_attempts:['PK id','ip, attempted_at; LIVE'],
 audit_events:['PK id','FK user_id','action, entity_id (logical reference), created_at; LIVE'],
 deployment_stations:['PK station_id','FK location_id (unique), camera_id (unique), screen_id (unique)','name, active; one integrated location + webcam + screen'],
 simulation_runs:['PK run_id','started_at, mode'],
 simulated_people:['PK person_id','profile_labels (authored)'],
 segments:['PK segment_id','dimension, value, scope_version'],
 person_segments:['PK/FK person_id + segment_id'],
 locations:['PK location_id','name, popularity_tier, active'],
 cameras:['PK camera_id','FK location_id','name, active'],
 screens:['PK screen_id','FK location_id','name, active'],
 camera_screens:['PK/FK camera_id + screen_id'],
 observations:['PK event_id','FK run_id, person_id, camera_id','event_time, received_at'],
 rate_cards:['PK rate_id','FK screen_id','floor_minor, valid_from, valid_to'],
 owners:['PK owner_id','name'],
 campaigns:['PK campaign_id','FK owner_id; gender: all/male/female','budget_minor, bid_minor, match_mode'],
 campaign_targets:['PK/FK campaign_id + segment_id','include / exclude'],
 campaign_placements:['PK/FK campaign_id + screen_id'],
 contents:['PK content_id','FK campaign_id','duration_sec'],
 assets:['PK asset_id','FK content_id','version, checksum, storage_key'],
 screen_asset_cache:['PK/FK screen_id + asset_id','status, verified_at'],
 decisions:['PK decision_id','FK event_id, screen_id, rate_id','policy_version, matching, ranking'],
 candidates:['PK/FK decision_id + campaign_id','bid, budget, match_fraction, score','eligible, reason, rank'],
 playback_plans:['PK plan_id','FK decision_id, asset_id (nullable)','agreed_price_minor, status'],
 budget_holds:['PK hold_id','FK plan_id (unique), campaign_id','amount_minor, state'],
 playbacks:['PK playback_id','FK plan_id (unique)','started_at, completed_at, status'],
 billing_ledger:['PK ledger_id','FK playback_id (unique)','amount_minor, recorded_at']
};
Object.assign(entities,{
  "customers": [
    "PK customer_id",
    "legal_name, type, tax_id, branch",
    "billing_address, payment_terms"
  ],
  "customer_contacts": [
    "PK contact_id",
    "FK customer_id",
    "name, email, phone"
  ],
  "customer_snapshots": [
    "PK snapshot_id",
    "FK customer_id",
    "billing_details_json, captured_at"
  ],
  "campaign_prices": [
    "PK price_id",
    "FK campaign_id, screen_id",
    "base_minor, attention_extra_minor, valid_from"
  ],
  "ab_experiments": [
    "PK experiment_id",
    "FK campaign_id",
    "allocation_unit, split_ratio, policy_version"
  ],
  "ab_variants": [
    "PK variant_id",
    "FK experiment_id, content_id",
    "variant_key UNIQUE per experiment"
  ],
  "ab_assignments": [
    "PK assignment_id",
    "FK experiment_id, variant_id, decision_id",
    "randomization_key, assigned_at"
  ],
  "evidence_captures": [
    "PK capture_id",
    "FK event_id",
    "source, storage_key, checksum",
    "captured_at, retention_until"
  ],
  "attribute_scores": [
    "PK attribute_score_id",
    "FK capture_id",
    "attribute_key, score, model_version"
  ],
  "playback_evidence": [
    "PK evidence_id",
    "FK playback_id, capture_id, snapshot_id",
    "target_snapshot, match_snapshot",
    "base_price, extra_price, clip_length"
  ],
  "attention_measurements": [
    "PK measurement_id",
    "FK playback_id",
    "stopped, watch_seconds, clip_length",
    "qualified: stopped AND watch > length / 2"
  ],
  "billing_reviews": [
    "PK review_id",
    "FK playback_id",
    "reviewer_id, decision, reason, created_at"
  ],
  "billing_ledger": [
    "PK ledger_id",
    "FK playback_id, review_id (nullable)",
    "entry_type, amount_minor, idempotency_key UNIQUE",
    "charge / refund; append-only"
  ]
});
entities.campaigns.push('FK customer_id');
entities.playback_plans.push('FK assignment_id, price_id (nullable)');
export const relations=[
 {from:'wallet_accounts',field:'user_id',to:'auth_users',cardinality:'1 → 1'},
 {from:'wallet_ledger',field:'user_id',to:'wallet_accounts',cardinality:'N → 1'},
 {from:'wallet_ledger',field:'actor_id',to:'auth_users',cardinality:'N → 1'},
 {from:'wallet_ledger',field:'campaign_id',to:'cycle_campaigns',cardinality:'N → 1'},
 {from:'wallet_ledger',field:'run_id',to:'cycle_runs',cardinality:'N → 1'},
 {from:'cycle_attention',field:'run_id',to:'cycle_runs',cardinality:'N → 1'},
 {from:'cycle_campaigns',field:'user_id',to:'auth_users',cardinality:'N → 1'},
 {from:'cycle_runs',field:'station_id',to:'central_stations',cardinality:'N → 1'},
 {from:'cycle_runs',field:'campaign_id',to:'cycle_campaigns',cardinality:'N → 1'},
 {from:'cycle_ledger',field:'run_id',to:'cycle_runs',cardinality:'N → 1'},
 {from:'audit_events',field:'user_id',to:'auth_users',cardinality:'N → 1'},
 {from:'deployment_stations',field:'location_id',to:'locations',cardinality:'1 → 1'},
 {from:'deployment_stations',field:'camera_id',to:'cameras',cardinality:'1 → 1'},
 {from:'deployment_stations',field:'screen_id',to:'screens',cardinality:'1 → 1'},
  {
    "from": "person_segments",
    "field": "person_id",
    "to": "simulated_people",
    "cardinality": "N → 1"
  },
  {
    "from": "person_segments",
    "field": "segment_id",
    "to": "segments",
    "cardinality": "N → 1"
  },
  {
    "from": "cameras",
    "field": "location_id",
    "to": "locations",
    "cardinality": "N → 1"
  },
  {
    "from": "screens",
    "field": "location_id",
    "to": "locations",
    "cardinality": "N → 1"
  },
  {
    "from": "camera_screens",
    "field": "camera_id",
    "to": "cameras",
    "cardinality": "N → 1"
  },
  {
    "from": "camera_screens",
    "field": "screen_id",
    "to": "screens",
    "cardinality": "N → 1"
  },
  {
    "from": "observations",
    "field": "run_id",
    "to": "simulation_runs",
    "cardinality": "N → 1"
  },
  {
    "from": "observations",
    "field": "person_id",
    "to": "simulated_people",
    "cardinality": "N → 1"
  },
  {
    "from": "observations",
    "field": "camera_id",
    "to": "cameras",
    "cardinality": "N → 1"
  },
  {
    "from": "rate_cards",
    "field": "screen_id",
    "to": "screens",
    "cardinality": "N → 1"
  },
  {
    "from": "campaigns",
    "field": "owner_id",
    "to": "owners",
    "cardinality": "N → 1"
  },
  {
    "from": "campaigns",
    "field": "customer_id",
    "to": "customers",
    "cardinality": "N → 1"
  },
  {
    "from": "campaign_targets",
    "field": "campaign_id",
    "to": "campaigns",
    "cardinality": "N → 1"
  },
  {
    "from": "campaign_targets",
    "field": "segment_id",
    "to": "segments",
    "cardinality": "N → 1"
  },
  {
    "from": "campaign_placements",
    "field": "campaign_id",
    "to": "campaigns",
    "cardinality": "N → 1"
  },
  {
    "from": "campaign_placements",
    "field": "screen_id",
    "to": "screens",
    "cardinality": "N → 1"
  },
  {
    "from": "contents",
    "field": "campaign_id",
    "to": "campaigns",
    "cardinality": "N → 1"
  },
  {
    "from": "assets",
    "field": "content_id",
    "to": "contents",
    "cardinality": "N → 1"
  },
  {
    "from": "screen_asset_cache",
    "field": "screen_id",
    "to": "screens",
    "cardinality": "N → 1"
  },
  {
    "from": "screen_asset_cache",
    "field": "asset_id",
    "to": "assets",
    "cardinality": "N → 1"
  },
  {
    "from": "decisions",
    "field": "event_id",
    "to": "observations",
    "cardinality": "N → 1"
  },
  {
    "from": "decisions",
    "field": "screen_id",
    "to": "screens",
    "cardinality": "N → 1"
  },
  {
    "from": "decisions",
    "field": "rate_id",
    "to": "rate_cards",
    "cardinality": "N → 1"
  },
  {
    "from": "candidates",
    "field": "decision_id",
    "to": "decisions",
    "cardinality": "N → 1"
  },
  {
    "from": "candidates",
    "field": "campaign_id",
    "to": "campaigns",
    "cardinality": "N → 1"
  },
  {
    "from": "playback_plans",
    "field": "decision_id",
    "to": "decisions",
    "cardinality": "0..1 → 1"
  },
  {
    "from": "playback_plans",
    "field": "asset_id",
    "to": "assets",
    "cardinality": "N → 0..1"
  },
  {
    "from": "playback_plans",
    "field": "assignment_id",
    "to": "ab_assignments",
    "cardinality": "N → 0..1"
  },
  {
    "from": "playback_plans",
    "field": "price_id",
    "to": "campaign_prices",
    "cardinality": "N → 0..1"
  },
  {
    "from": "budget_holds",
    "field": "plan_id",
    "to": "playback_plans",
    "cardinality": "0..1 → 1"
  },
  {
    "from": "budget_holds",
    "field": "campaign_id",
    "to": "campaigns",
    "cardinality": "N → 1"
  },
  {
    "from": "playbacks",
    "field": "plan_id",
    "to": "playback_plans",
    "cardinality": "0..1 → 1"
  },
  {
    "from": "billing_ledger",
    "field": "playback_id",
    "to": "playbacks",
    "cardinality": "N → 1"
  },
  {
    "from": "billing_ledger",
    "field": "review_id",
    "to": "billing_reviews",
    "cardinality": "N → 0..1"
  },
  {
    "from": "customer_contacts",
    "field": "customer_id",
    "to": "customers",
    "cardinality": "N → 1"
  },
  {
    "from": "customer_snapshots",
    "field": "customer_id",
    "to": "customers",
    "cardinality": "N → 1"
  },
  {
    "from": "campaign_prices",
    "field": "campaign_id",
    "to": "campaigns",
    "cardinality": "N → 1"
  },
  {
    "from": "campaign_prices",
    "field": "screen_id",
    "to": "screens",
    "cardinality": "N → 1"
  },
  {
    "from": "ab_experiments",
    "field": "campaign_id",
    "to": "campaigns",
    "cardinality": "N → 1"
  },
  {
    "from": "ab_variants",
    "field": "experiment_id",
    "to": "ab_experiments",
    "cardinality": "N → 1"
  },
  {
    "from": "ab_variants",
    "field": "content_id",
    "to": "contents",
    "cardinality": "N → 1"
  },
  {
    "from": "ab_assignments",
    "field": "experiment_id",
    "to": "ab_experiments",
    "cardinality": "N → 1"
  },
  {
    "from": "ab_assignments",
    "field": "variant_id",
    "to": "ab_variants",
    "cardinality": "N → 1"
  },
  {
    "from": "ab_assignments",
    "field": "decision_id",
    "to": "decisions",
    "cardinality": "N → 1"
  },
  {
    "from": "evidence_captures",
    "field": "event_id",
    "to": "observations",
    "cardinality": "N → 1"
  },
  {
    "from": "attribute_scores",
    "field": "capture_id",
    "to": "evidence_captures",
    "cardinality": "N → 1"
  },
  {
    "from": "playback_evidence",
    "field": "playback_id",
    "to": "playbacks",
    "cardinality": "N → 1"
  },
  {
    "from": "playback_evidence",
    "field": "capture_id",
    "to": "evidence_captures",
    "cardinality": "N → 1"
  },
  {
    "from": "playback_evidence",
    "field": "snapshot_id",
    "to": "customer_snapshots",
    "cardinality": "N → 1"
  },
  {
    "from": "attention_measurements",
    "field": "playback_id",
    "to": "playbacks",
    "cardinality": "N → 1"
  },
  {
    "from": "billing_reviews",
    "field": "playback_id",
    "to": "playbacks",
    "cardinality": "N → 1"
  }
];
