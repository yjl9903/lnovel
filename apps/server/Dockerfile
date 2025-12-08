# syntax = docker/dockerfile:1

ARG NODE_VERSION=24.11.0
ARG PNPM_VERSION=10.23.0

ARG APP_HOST=lnovel.animes.garden

ARG PORT=3000

# Base Image
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /lnovel

# Set production environment
ENV NODE_ENV="production"

# Install pnpm
RUN npm install -g pnpm@$PNPM_VERSION


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 git

# Install node modules
COPY --link package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json .npmrc .node-version ./
COPY ./apps/server/package.json ./apps/server/
COPY ./packages/lnovel/package.json ./packages/lnovel/
COPY ./packages/bilinovel/package.json ./packages/bilinovel/

RUN pnpm install --frozen-lockfile --prod=false

# Copy application code
COPY --link . .

# Setup CI environment
ENV CI=true NODE_ENV="production"

# Build application
RUN pnpm run build

# Remove development dependencies
RUN pnpm prune --prod


# Final stage for app image
FROM base

# Copy built application
COPY --from=build /lnovel /lnovel

# 设置浏览器下载路径，避免放在临时目录被清理
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 安装 Chromium 及其所需的系统依赖 (System Deps)
# --with-deps 会自动运行 apt-get 安装 libnss3, libatk 等库
# 运行完后清理 apt 缓存以减小体积
RUN apt-get update && \
    npx playwright install chromium --with-deps && \
    rm -rf /var/lib/apt/lists/*

# Declare args
ARG PORT APP_HOST
ENV HOST=0.0.0.0 PORT=${PORT} APP_HOST=${APP_HOST} DATABASE_FILE=/data/sqlite.db

# Start the server by default, this can be overwritten at runtime
EXPOSE ${PORT}

CMD [ "node", "apps/server/cli.mjs", "start" ]
