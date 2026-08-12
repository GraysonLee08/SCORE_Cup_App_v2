#!/usr/bin/env bash
#
# Deploy the current working tree to the staging stack on the VPS.
#
# Ships a tarball of the tree rather than pulling from git, so what you tested
# locally is exactly what runs -- no "forgot to push" between the two.
#
#   bash deploy/deploy-staging.sh
#
set -euo pipefail

HOST="${SCUP_HOST:-root@168.231.71.59}"
KEY="${SCUP_KEY:-$HOME/.ssh/scorescup_vps}"
REMOTE_DIR="${SCUP_REMOTE_DIR:-/opt/scorescup/staging}"

SSH=(ssh -o BatchMode=yes -i "$KEY" "$HOST")

echo "==> Packaging working tree"
TARBALL="$(mktemp -t scup-XXXXXX).tar.gz"
tar --exclude-vcs \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.env' \
    --exclude='*.tar.gz' \
    -czf "$TARBALL" \
    package.json package-lock.json tsconfig.base.json \
    docker-compose.staging.yml packages apps deploy

echo "==> Copying to $HOST:$REMOTE_DIR"
"${SSH[@]}" "mkdir -p $REMOTE_DIR"
scp -o BatchMode=yes -i "$KEY" "$TARBALL" "$HOST:$REMOTE_DIR/release.tar.gz"
rm -f "$TARBALL"

echo "==> Unpacking and building"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"

# Keep .env; replace everything else.
rm -rf packages apps deploy
tar -xzf release.tar.gz
rm -f release.tar.gz

if [ ! -f .env ]; then
  echo "!! No .env in $REMOTE_DIR — create it first (see deploy/README.md)." >&2
  exit 1
fi

docker compose -f docker-compose.staging.yml --env-file .env build
docker compose -f docker-compose.staging.yml --env-file .env up -d

echo "==> Waiting for the API to report healthy"
for i in \$(seq 1 40); do
  if curl -fsS http://127.0.0.1:\${API_PORT:-8083}/health >/dev/null 2>&1; then
    echo "healthy after \${i}s"
    break
  fi
  sleep 2
done

docker compose -f docker-compose.staging.yml --env-file .env ps
REMOTE

echo "==> Done"
