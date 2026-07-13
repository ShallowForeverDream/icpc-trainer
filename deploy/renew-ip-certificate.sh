#!/usr/bin/env sh
set -eu

docker run --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /usr/share/nginx/html:/var/www/certbot \
  certbot/certbot:v5.4.0 renew --quiet

nginx -t
systemctl reload nginx
