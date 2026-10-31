# syntax=docker/dockerfile:1

ARG NODE_VERSION=22

# -----------------------------------------------------------------------------
# base
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NUXT_TELEMETRY_DISABLED=1 \
    npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false \
    npm_config_legacy_peer_deps=true
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# deps: install node_modules (cached layer)
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* .npmrc* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps --ignore-scripts --include=optional; \
    else \
      npm install --legacy-peer-deps --ignore-scripts; \
    fi

# -----------------------------------------------------------------------------
# dev: hot-reload dev server (source is bind-mounted by docker-compose)
# -----------------------------------------------------------------------------
FROM deps AS dev
ENV NODE_ENV=development \
    NUXT_HOST=0.0.0.0 \
    NUXT_PORT=3000
COPY . .
RUN npx nuxt prepare
EXPOSE 3000 24678
CMD ["npm", "run", "dev"]

# -----------------------------------------------------------------------------
# ci: formatting, lint and type checks (docker build --target ci .)
# -----------------------------------------------------------------------------
FROM deps AS ci
COPY . .
RUN npx nuxt prepare \
    && npm run format:check \
    && npm run lint \
    && npm run typecheck

# -----------------------------------------------------------------------------
# build: static SPA output for web & Capacitor (.output/public)
# -----------------------------------------------------------------------------
FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN npx nuxt prepare && npm run generate

# -----------------------------------------------------------------------------
# prod: serve the generated SPA with nginx
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS prod
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/.output/public /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
