# syntax=docker/dockerfile:1
#
# Multi-stage build → Next.js standalone runtime (ADR-0012).
# Replaces Coolify/Nixpacks. Target runtime image ~400-600 MB.
# Node 22 is the ceiling (package.json `engines`; nixpkgs only goes to nodejs_22).
#
# Stages:
#   deps    — install full deps, cached on the lockfile
#   build   — `next build` → .next/standalone (server.js + traced node_modules) + .next/static
#   runtime — copy only the standalone output + the bits bootstrap-db.mjs needs

# ---------------------------------------------------------------------------
# deps: install node_modules. Cached on package.json + package-lock.json so an
# unchanged-deps rebuild reuses this layer and skips npm ci entirely.
# ---------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# build: compile the app. `next build` emits .next/standalone (which contains
# server.js and a Next-traced subset of node_modules) and .next/static.
#
# payload.config.ts fail-fasts on a missing PAYLOAD_SECRET at module load, and
# the postgres adapter reads DATABASE_URL, so both must be present while
# `next build` evaluates the config. These are DUMMY throwaway build-time
# values — never real secrets — so it is safe for them to live in build layers.
# Real secrets are injected at runtime via the container's env, never as ARG/ENV.
# ---------------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV PAYLOAD_SECRET=dummy_build_secret
ENV DATABASE_URL=postgres://u:p@localhost:5432/db
RUN npm run build

# ---------------------------------------------------------------------------
# runtime: minimal image. Copies only the standalone output plus the schema
# bootstrap script and its data.
#
# Two runtime dependencies that are NOT part of the standalone server entry
# point and must be handled explicitly:
#
#   1. scripts/bootstrap-db.mjs runs as a plain node script (not through Next's
#      traced server bundle). Its only non-builtin import is `pg`. Next's trace
#      bundles pg into .next/standalone/node_modules (Payload's postgres adapter
#      imports it), but the standalone tree is laid out for `server.js`, and we
#      run bootstrap-db.mjs from the repo root *before* server.js. To guarantee
#      `import pg` resolves from /app/node_modules regardless of how the trace
#      nests it, we copy the pg package tree straight from the deps stage. This
#      is a few MB, far cheaper than copying all of node_modules, and removes
#      any dependency on Next's trace layout for the bootstrap step.
#
#   2. sharp — Payload needs it at runtime for image handling. Next standalone
#      traces it into .next/standalone/node_modules. node:22-slim is glibc
#      (Debian), so sharp's prebuilt linux-x64 binary loads fine. No extra copy
#      needed; it rides along in the standalone bundle.
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Next standalone's server.js binds to $HOSTNAME. Docker sets HOSTNAME to the
# container id, which Next resolves to the container's IPv6 address and binds
# ONLY there — so Traefik's IPv4 connection to <container-ip>:3000 fails and the
# app is unreachable. Force binding to all IPv4 interfaces.
ENV HOSTNAME=0.0.0.0

# Standalone server: server.js + the Next-traced node_modules subset, copied to /app.
COPY --from=build /app/.next/standalone ./
# Static assets and public files are not part of the standalone bundle.
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Schema bootstrap: the script, its SQL, and pg (its only non-builtin import).
COPY --from=build /app/db/schema ./db/schema
COPY --from=build /app/scripts/bootstrap-db.mjs ./scripts/bootstrap-db.mjs
# pg + its transitive deps, so `import pg` in bootstrap-db.mjs resolves from
# /app/node_modules independent of Next's trace layout. (See note above.)
COPY --from=deps /app/node_modules/pg ./node_modules/pg
COPY --from=deps /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=deps /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=deps /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=deps /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=deps /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=deps /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=deps /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=deps /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=deps /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=deps /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=deps /app/node_modules/pg-cloudflare ./node_modules/pg-cloudflare
COPY --from=deps /app/node_modules/split2 ./node_modules/split2
COPY --from=deps /app/node_modules/xtend ./node_modules/xtend

# Root package.json so `node` reads "type"/etc. consistently (the standalone
# copy may suffice; including the root one is belt-and-suspenders).
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

# Apply schema, then start the standalone server. Replaces `npm start`
# (= bootstrap-db.mjs + next start) — next start becomes `node server.js`.
CMD ["sh", "-c", "node scripts/bootstrap-db.mjs && node server.js"]
