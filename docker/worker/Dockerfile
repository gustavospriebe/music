# syntax=docker/dockerfile:1
FROM node:22-alpine AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/providers/package.json packages/providers/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY apps/worker apps/worker
COPY packages/contracts packages/contracts
COPY packages/database packages/database
COPY packages/domain packages/domain
COPY packages/providers packages/providers
RUN pnpm --filter @resenha/worker build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app /app
USER app
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "try { process.kill(1, 0); } catch { process.exit(1); }"
CMD ["node_modules/.bin/tsx", "apps/worker/src/index.ts"]
