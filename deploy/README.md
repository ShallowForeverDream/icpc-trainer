# Alibaba Cloud direct-IP deployment

The production API runs as a small Docker container on
`127.0.0.1:8787`. Existing Nginx exposes it at:

`https://114.55.130.137/icpc-api/`

The server intentionally reuses the existing Nginx installation and does not
replace its port 80 virtual host, Java service, MySQL, or Elasticsearch.

TLS uses a Let's Encrypt short-lived IP certificate. A systemd timer checks
renewal daily because IP certificates are valid for roughly six days.

Deployment files:

- `backend/compose.yaml`: API service
- `nginx-icpc-trainer.conf`: isolated HTTPS virtual host
- `renew-ip-certificate.sh`: automated renewal and Nginx reload
- `icpc-trainer-cert-renew.*`: systemd unit and timer
