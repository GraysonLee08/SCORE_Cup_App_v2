# --- build ---------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --ignore-scripts

COPY packages/engine packages/engine
COPY apps/web apps/web
COPY tsconfig.base.json ./

RUN npm run build --workspace @scores-cup/web

# --- serve ---------------------------------------------------------------
FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
