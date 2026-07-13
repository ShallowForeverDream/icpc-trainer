# Alibaba Cloud direct-IP deployment

The production API runs as a small Docker container on
`127.0.0.1:8787`. Existing Nginx exposes it at:

`https://114.55.130.137/icpc-api/`

The server reuses Nginx for TLS termination. The previous Java, MySQL, and
Elasticsearch workloads are stopped but their data has not been deleted.

Account state is stored in the `icpc-trainer-data` Docker volume. The first
administrator is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD`; remove the
plain bootstrap password from `.env` after the first successful start.

TLS uses a Let's Encrypt short-lived IP certificate. A systemd timer checks
renewal daily because IP certificates are valid for roughly six days.

Deployment files:

- `backend/compose.yaml`: API service and persistent account volume
- `nginx-icpc-trainer.conf`: isolated HTTPS virtual host
- `renew-ip-certificate.sh`: automated renewal and Nginx reload
- `icpc-trainer-cert-renew.*`: systemd unit and timer
