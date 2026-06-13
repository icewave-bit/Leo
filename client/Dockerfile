FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY public ./public
COPY src ./src

ARG VITE_PUBLIC_ORIGIN
ENV VITE_PUBLIC_ORIGIN=${VITE_PUBLIC_ORIGIN}
ENV NODE_ENV=production
RUN pnpm run build

FROM ghcr.io/pkarpovich/env-driven-static-server:latest

COPY --from=build /app/dist /public

# inject-env-vars.sh дописывает в env-config.js (`>>`); убираем заглушку из `public/`, иначе при старте контейнера файл испортится.
RUN rm -f /public/env-config.js
