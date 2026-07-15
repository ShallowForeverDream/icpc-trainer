# Alibaba Cloud direct-IP deployment

The production API runs in Docker on `127.0.0.1:8787`. Existing Nginx exposes it at:

`https://114.55.130.137/icpc-api/`

The public frontend is deployed from the current Sites account at:

`https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site`

Because Alibaba Cloud blocks unregistered hostnames, browsers call the HTTPS IP API
directly. Keep the Sites origin in `ALLOWED_ORIGINS` when recreating the API container.

The server reuses Nginx for TLS termination. The previous Java, MySQL, and
Elasticsearch workloads are stopped but their data has not been deleted.

Account state is stored in the `icpc-trainer-data` Docker volume. The first
administrator is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD`; remove the
plain bootstrap password from `.env` after the first successful start.

Problem statements use the same SQLite volume. The API imports and sanitizes
the original Codeforces HTML on first open, downloads statement images, and
runs English OCR with Tesseract. An internal CPU-only llama.cpp container translates text
and image OCR with Qwen2.5 1.5B Q4_K_M; llama.cpp has no published host port.
The GGUF file is preloaded into the private `icpc-trainer-models` volume during deployment.
While llama.cpp is starting, statement jobs report `model_downloading` and retry health checks.

Recommended server-side update (replace `<commit>` with the released commit):

```bash
curl -fsSL https://raw.githubusercontent.com/ShallowForeverDream/icpc-trainer/<commit>/deploy/update-backend.sh | bash -s -- <commit>
```

The script backs up the current backend, preserves `.env` and Docker volumes,
builds before switching files, recreates only the API container, and verifies
the persistent submission route.

Upgrade from the repository root on the workstation:

```powershell
scp -i .deploy/icpc-trainer-aliyun -r backend root@114.55.130.137:/opt/icpc-trainer/
ssh -i .deploy/icpc-trainer-aliyun root@114.55.130.137 "cd /opt/icpc-trainer/backend && docker compose up -d --build"
```

Verify without exposing llama.cpp:

```bash
curl -k https://114.55.130.137/icpc-api/health
curl -k 'https://114.55.130.137/icpc-api/codeforces/statements?code=4A'
docker compose ps
docker compose logs --tail=80 api llama
```

TLS uses a Let's Encrypt short-lived IP certificate. A systemd timer checks
renewal daily because IP certificates are valid for roughly six days.

Deployment files:

- `backend/compose.yaml`: API, internal llama.cpp, and persistent data/model volumes
- `nginx-icpc-trainer.conf`: isolated HTTPS virtual host
- `renew-ip-certificate.sh`: automated renewal and Nginx reload
- `icpc-trainer-cert-renew.*`: systemd unit and timer
