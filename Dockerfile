# syntax=docker/dockerfile:1

# --- Build stage: install deps and build the web SPA -------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install all workspace deps (manifests first for better layer caching).
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm install

# Copy sources and build the web bundle into web/dist.
COPY . .
RUN npm run build -w web

# --- Runtime stage -----------------------------------------------------------
# The server runs TypeScript directly via tsx (no server compile step), and
# serves web/dist statically. Single container, single process.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

COPY --from=build /app ./

# SQLite + config live on a mounted volume (Phase 1+).
VOLUME ["/config"]
EXPOSE 8080

CMD ["npm", "run", "start", "-w", "server"]
