#!/bin/sh
set -eu
until php -r 'new PDO("mysql:host=".getenv("PROXIMITY_DB_HOST"),"root",getenv("MARIADB_ROOT_PASSWORD"));' >/dev/null 2>&1; do sleep 2; done
php /var/www/html/setup-local.php
php /var/www/html/cycle-migrate.php
php /opt/proximity/bin/migrate.php
php /opt/proximity/bin/check-invariants.php
exec "$@"
