FROM php:8.4-apache
RUN docker-php-ext-install pdo_mysql
RUN a2enmod headers
COPY web/ /var/www/html/
COPY docker-entrypoint.sh /usr/local/bin/proximity-entrypoint
RUN chmod +x /usr/local/bin/proximity-entrypoint && mkdir -p /data && chown www-data:www-data /data
ENTRYPOINT ["proximity-entrypoint"]
CMD ["apache2-foreground"]
