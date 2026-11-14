<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

$host = getenv('PROXIMITY_DB_HOST') ?: 'db';
$password = getenv('MARIADB_ROOT_PASSWORD');
if (!$password) {
    throw new RuntimeException('MARIADB_ROOT_PASSWORD is required');
}

$db = new PDO(
    "mysql:host={$host};dbname=proximity_lab;charset=utf8mb4",
    'root',
    $password,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
);
$db->exec("SET SESSION sql_mode='STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
$db->exec('CREATE TABLE IF NOT EXISTS schema_migrations(
    version VARCHAR(120) PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB');

$directory = dirname(__DIR__) . '/db/migrations';
$files = glob($directory . '/*.php') ?: [];
sort($files, SORT_STRING);
$lookup = $db->prepare('SELECT checksum FROM schema_migrations WHERE version=?');
$record = $db->prepare('INSERT INTO schema_migrations(version,checksum) VALUES (?,?)');

foreach ($files as $file) {
    $version = basename($file, '.php');
    $checksum = hash_file('sha256', $file);
    $lookup->execute([$version]);
    $existing = $lookup->fetchColumn();
    if ($existing !== false) {
        if (!hash_equals((string)$existing, $checksum)) {
            throw new RuntimeException("Applied migration changed: {$version}");
        }
        continue;
    }
    $migration = require $file;
    if (!is_callable($migration)) {
        throw new RuntimeException("Migration must return a callable: {$version}");
    }
    $migration($db);
    $record->execute([$version, $checksum]);
    fwrite(STDOUT, "Applied {$version}\n");
}

fwrite(STDOUT, "Database migrations current\n");
