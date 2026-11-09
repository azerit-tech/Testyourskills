# Image de production Testyourskills : front Vite buildé + API Hono exécutée par tsx.
# Déployée sur le VPS partagé derrière ruby-caddy (voir docker-compose.yml).

# --- Étape 1 : dépendances, build du front, puis élagage des devDependencies ---
FROM node:22-slim AS build
WORKDIR /app
# Outils de compilation, au cas où better-sqlite3 n'aurait pas de binaire
# précompilé pour cette plateforme. resvg arrive en binaire précompilé.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
# `nice -n 10` ICI, dans le conteneur de build : le VPS est partagé avec d'autres
# apps de prod. Un `nice` devant `docker compose` ne baisse que la priorité du
# client docker, pas celle des étapes RUN, lancées par le démon.
COPY package.json package-lock.json ./
RUN nice -n 10 npm ci
COPY . .
RUN nice -n 10 npx vite build \
 && nice -n 10 npm prune --omit=dev

# --- Étape 2 : runtime ---------------------------------------------------------
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/cards.db
COPY --from=build --chown=node:node /app /app
# Base SQLite et cache des PNG sur le volume persistant /data.
RUN mkdir -p /data/og && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8787
# --start-interval : sondé toutes les 3 s pendant le démarrage, « healthy » en
# quelques secondes au lieu de 30 (Docker 25 et plus ; le VPS a Docker 29).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --start-interval=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "server/src/index.ts"]
