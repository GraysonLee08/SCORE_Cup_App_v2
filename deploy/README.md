# Deployment

Two identical stacks on one VPS: **staging** for rehearsal, **production** for
the day. Same compose file, different `.env` and ports, so anything that works
on staging works in production.

| | Staging | Production |
|---|---|---|
| Directory | `/opt/scorescup/staging` | `/opt/scorescup/production` |
| Web port (localhost) | 8081 | 8080 |
| API port (localhost) | 8083 | 8082 |
| Reached at | `http://<vps-ip>:8181` or `staging.scorescupchicago.games` | `https://scorescupchicago.games` |

Every container port binds to `127.0.0.1`. nginx on the host is the only way
in — nothing is published to the internet directly.

## First-time setup

Create `/opt/scorescup/staging/.env` on the VPS. Generate the secrets rather
than inventing them:

```bash
mkdir -p /opt/scorescup/staging && cd /opt/scorescup/staging
cat > .env <<EOF
POSTGRES_DB=scup
POSTGRES_USER=scup
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 32)
WEB_PORT=8081
API_PORT=8083
CORS_ORIGINS=
EOF
chmod 600 .env
```

`CORS_ORIGINS` stays empty because nginx serves the app and the API from the
same origin — there is no cross-origin request to allow.

Install the nginx config:

```bash
mkdir -p /etc/nginx/snippets
cp /opt/scorescup/staging/deploy/nginx-common.conf /etc/nginx/snippets/scup-common.conf
cp /opt/scorescup/staging/deploy/nginx-staging.conf /etc/nginx/sites-available/scup-staging
ln -sf /etc/nginx/sites-available/scup-staging /etc/nginx/sites-enabled/scup-staging
nginx -t && systemctl reload nginx
```

Open the staging port in the firewall if one is active:

```bash
ufw allow 8181/tcp
```

## Deploying

From your machine, with the working tree in the state you want deployed:

```bash
bash deploy/deploy-staging.sh
```

It packages the tree (excluding `node_modules`, `dist` and `.env`), copies it
over, rebuilds the images and restarts the stack. Migrations run automatically
when the API container boots, guarded by an advisory lock so two containers
starting together cannot race.

## Seeding a demo tournament

Useful for a rehearsal, and destructive — it clears the database first:

```bash
cd /opt/scorescup/staging
docker compose -f docker-compose.staging.yml --env-file .env exec api \
  npm run seed --workspace @scores-cup/api
```

## Checking on it

```bash
docker compose -f docker-compose.staging.yml --env-file .env ps
docker compose -f docker-compose.staging.yml --env-file .env logs -f api
curl -fsS http://127.0.0.1:8083/health
```

## Backups

Container logs are capped at 10MB × 3 files per service, so they cannot fill
the disk the way the previous deployment did. Database backups are not yet
automated — see the open item in the project notes.

```bash
docker compose -f docker-compose.staging.yml --env-file .env exec -T db \
  pg_dump -U scup scup > backup-$(date +%F).sql
```
