# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

FROM deps AS build

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

RUN pnpm build && pnpm prune --prod

FROM alpine:3.21 AS runner

RUN apk add --no-cache dumb-init libstdc++ libgcc && \
    addgroup -g 1001 -S app && \
    adduser -S app -u 1001 -G app

COPY --from=build /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

COPY --from=build --chown=app:app /app/package.json ./
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/migrations ./migrations

USER app

ENV NODE_ENV=production

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
