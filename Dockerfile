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

# Sanity check: fail the build loudly if source dirs were excluded from the
# build context (e.g. an over-broad .dockerignore pattern) instead of letting
# the container crash-loop at runtime.
RUN test -f server/src/config/env.ts \
    || (echo "BUILD ERROR: server/src/config/env.ts missing from context" && exit 1)

RUN npm run build -w web

# Bake build identity into the image. GIT_SHA is passed as a build arg (the .git
# dir is excluded from the context, so it can't be read here); the timestamp is
# always generated, so even an arg-less build records WHEN it was built.
#   docker compose build --build-arg GIT_SHA=$(git rev-parse --short HEAD)
ARG GIT_SHA=unknown
RUN printf '{"commit":"%s","builtAt":"%s"}\n' \
      "$GIT_SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /app/build-info.json

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

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "-w", "server"]
