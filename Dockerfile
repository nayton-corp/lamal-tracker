# syntax=docker/dockerfile:1
# Image multi-architecture (linux/arm64 pour Raspberry Pi 4/5, linux/amd64).
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# better-sqlite3 13 embarque ses binaires (linux-arm64 pour le Pi, linux-x64) : aucune compilation.
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Europe/Zurich \
    DATABASE_PATH=/data/lamal.db \
    MIGRATIONS_DIR=/app/drizzle
# Node embarque ses certificats racines et les fuseaux horaires (ICU) : pas de paquet système requis.
# Correctifs Debian du jour ; npm et corepack, inutiles pour servir l'app, sont retirés (moins de
# code exposé, et le scan Trivy de la CI ne bloque pas sur leurs dépendances).
RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --chown=node:node scripts/entrypoint.sh ./entrypoint.sh
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Vérifie les droits sur /data (message clair si le bind mount appartient à root).
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
CMD ["node", "server.js"]
