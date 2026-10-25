# Image Rallly du fork (build depuis la racine du dépôt) :
#   docker build -f infra/rallly/Dockerfile -t rallly:local .
# Multi-stage : on compile dans une image complète, on n'embarque que le résultat.

# ---- Étape 1 : build ----
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
# pnpm sans terminal interactif (sinon il refuse de recréer node_modules)
ENV CI=true

# Dépendances d'abord (cache) : tant que le lockfile ne change pas, cette couche est réutilisée
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# Puis le code source
COPY . .
RUN pnpm install --offline --frozen-lockfile

ARG APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION
ENV NEXT_PUBLIC_SELF_HOSTED=true
ENV NEXT_TELEMETRY_DISABLED=1
# Les variables d'environnement (BDD, secrets) ne sont fournies qu'au runtime
RUN SKIP_ENV_VALIDATION=1 pnpm exec turbo run build --filter=@rallly/web

# ---- Étape 2 : image finale ----
FROM node:24-slim
WORKDIR /app

# Correctifs de sécurité de l'image de base + paquets nécessaires à Prisma
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends openssl curl \
  && rm -rf /var/lib/apt/lists/*

# Utilisateur dédié, sans droits root
RUN addgroup --system rallly \
  && adduser --system --ingroup rallly --home /app rallly

# Prisma CLI pour appliquer les migrations au démarrage
RUN npm install prisma@7 && npm cache clean --force

COPY --from=build /app/scripts/docker-start.sh ./
COPY --from=build /app/packages/database/prisma ./prisma
COPY --from=build /app/packages/database/prisma.config.ts ./
# Sortie "standalone" de Next.js : serveur + dépendances strictement nécessaires
COPY --from=build --chown=rallly:rallly /app/apps/web/.next/standalone ./
COPY --from=build --chown=rallly:rallly /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=rallly:rallly /app/apps/web/public ./apps/web/public

USER rallly

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SELF_HOSTED=true
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Pas d'API_BASE_URL (contrairement à l'image officielle) : l'instance ne contacte pas api.rallly.co

EXPOSE 3000
HEALTHCHECK CMD curl -f http://localhost:3000/api/status || exit 1

CMD ["./docker-start.sh"]
