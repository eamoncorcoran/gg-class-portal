FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
# pg_dump for the nightly backup. It refuses to dump a server newer than itself,
# and Debian bookworm only ships client 15, so the client comes from the
# PostgreSQL project's own repository and is pinned to the server major in
# docker-compose.prod.yml. Raise both together, client first.
ARG PG_MAJOR=16
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends "postgresql-client-${PG_MAJOR}" \
 && apt-get purge -y curl gnupg && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*
RUN groupadd -r app && useradd -r -g app app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/uploads /app/uploads-private /app/backups /app/.data && chown -R app:app /app
USER app
EXPOSE 3000
# Preflight first: a wrong APP_URL or a missing key should stop the container
# with one clear line, not start an app that half works.
CMD ["sh", "-c", "node scripts/preflight.js && node scripts/migrate.js && node server.js"]
