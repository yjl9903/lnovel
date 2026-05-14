# syntax = docker/dockerfile:1

ARG HOST=0.0.0.0
ARG PORT=3000

ARG APP_HOST=lnovel.animes.garden
ARG FOLLOW_USER_ID=41508082357911552

# Base Image
FROM platformatic/node-caged:26.1.0-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /lnovel

# Set production environment
ENV NODE_ENV="production"

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 git

# Install node modules
COPY --link package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json .node-version ./
COPY ./apps/server/package.json ./apps/server/
COPY ./apps/landing/package.json ./apps/landing/
COPY ./packages/lnovel/package.json ./packages/lnovel/
COPY ./packages/bilinovel/package.json ./packages/bilinovel/

# Install the package manager version declared by the workspace root.
RUN npm install -g $(node -p "require('./package.json').packageManager")

RUN pnpm install --frozen-lockfile --prod=false

# Copy application code
COPY --link . .

# Setup CI environment
ENV CI=true NODE_ENV="production"

# Build application and remove development dependencies
RUN pnpm run build && pnpm prune --prod


# Final stage for app image
FROM base

# Copy built application
COPY --from=build /lnovel /lnovel

# 设置 env
ARG HOST PORT APP_HOST FOLLOW_USER_ID
ENV HOST=${HOST} PORT=${PORT} APP_HOST=${APP_HOST} \
    FOLLOW_USER_ID=${FOLLOW_USER_ID} \
    DATABASE_FILE=/data/sqlite.db \
    PUPPETEER_CACHE_DIR=/puppeteer \
    CHROMIUM_USER_DIR=/data/profile

# 安装 Chrome 及其所需的系统依赖 (System Deps)
# --install-deps 会自动运行 apt-get 安装 libnss3, libatk 等库
# 运行完后清理 apt 缓存以减小体积
RUN apt-get update && \
    npx puppeteer browsers install chrome --install-deps && \
    rm -rf /var/lib/apt/lists/*

# Start the server by default, this can be overwritten at runtime
EXPOSE ${PORT}

CMD [ "node", "apps/server/cli.mjs", "start" ]
