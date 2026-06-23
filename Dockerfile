# syntax=docker/dockerfile:1

# --- Build stage: install deps and build the web SPA -------------------------
# Node 24 to match the verified dev environment (tsx ESM resolution differs on
# Node 20). Deps are pinned via the committed lockfile + `npm ci`.
FROM node:24-alpine AS build
WORKDIR /app

# Install all workspace deps (manifests + lockfile first for layer caching).
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

# Copy sources and build the web bundle into web/dist.
COPY . .
RUN npm run build -w web

# --- Runtime stage -----------------------------------------------------------
# The server runs TypeScript directly via tsx (no server compile step), and
# serves web/dist statically. Single container, single process.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

COPY --from=build /app ./

# SQLite + config live on a mounted volume (Phase 1+).
VOLUME ["/config"]
EXPOSE 8080

CMD ["npm", "run", "start", "-w", "server"]
