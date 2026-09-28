# syntax=docker/dockerfile:1

FROM node:24.21.0-alpine3.23 AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build && pnpm prune --prod

FROM base AS runner

WORKDIR /app

COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

COPY --chmod=0755 docker/file-inject-secrets.sh /usr/bin/file-inject-secrets
COPY --chmod=0755 migrate-then-exec.sh /usr/bin/migrate-then-exec
COPY --chown=node:node migrate.mjs ./migrate.mjs

ENV NODE_ENV=production
EXPOSE 3000
USER node

ENTRYPOINT [ "/usr/bin/file-inject-secrets", "/usr/bin/migrate-then-exec" ]
CMD [ "node", "build/index.js" ]
