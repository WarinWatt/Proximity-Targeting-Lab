FROM php:8.4-apache
RUN apt-get update && apt-get install -y --no-install-recommends libonig-dev && docker-php-ext-install pdo_mysql mbstring && rm -rf /var/lib/apt/lists/*
RUN a2enmod headers
COPY web/ /var/www/html/
COPY db/ /opt/proximity/db/
COPY bin/ /opt/proximity/bin/
COPY docker-entrypoint.sh /usr/local/bin/proximity-entrypoint
RUN chmod +x /usr/local/bin/proximity-entrypoint && mkdir -p /data && chown www-data:www-data /data
ENTRYPOINT ["proximity-entrypoint"]
CMD ["apache2-foreground"]
