# Build context is the repo root, so workspace dependencies resolve.
FROM node:22-alpine

WORKDIR /app

# Install with the lockfile so a rebuild resolves the same tree every time.
# The old app had no lockfile and pulled fresh transitive versions on each
# deploy, which is how a working image becomes a broken one overnight.
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --ignore-scripts --workspace @scores-cup/api --workspace @scores-cup/engine \
      --include-workspace-root

COPY packages/engine packages/engine
COPY apps/api apps/api

ENV NODE_ENV=production
EXPOSE 3002

# Run as a non-root user.
USER node

# Migrations run on boot: a container that starts against an out-of-date
# schema fails in confusing ways later, and the advisory lock makes it safe
# for two containers to start at once.
CMD ["sh", "-c", "npm run migrate --workspace @scores-cup/api && npm run start --workspace @scores-cup/api"]
