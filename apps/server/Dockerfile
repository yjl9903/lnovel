# syntax = docker/dockerfile:1

ARG NODE_VERSION=24.11.0
ARG PNPM_VERSION=10.27.0

ARG APP_HOST=lnovel.animes.garden

ARG PORT=3000

# Build dummy packages to skip installing them and their dependencies
FROM python:3.13-slim-bookworm AS flaresolverr-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends equivs \
    && equivs-control libgl1-mesa-dri \
    && printf 'Section: misc\nPriority: optional\nStandards-Version: 3.9.2\nPackage: libgl1-mesa-dri\nVersion: 99.0.0\nDescription: Dummy package for libgl1-mesa-dri\n' >> libgl1-mesa-dri \
    && equivs-build libgl1-mesa-dri \
    && mv libgl1-mesa-dri_*.deb /libgl1-mesa-dri.deb \
    && equivs-control adwaita-icon-theme \
    && printf 'Section: misc\nPriority: optional\nStandards-Version: 3.9.2\nPackage: adwaita-icon-theme\nVersion: 99.0.0\nDescription: Dummy package for adwaita-icon-theme\n' >> adwaita-icon-theme \
    && equivs-build adwaita-icon-theme \
    && mv adwaita-icon-theme_*.deb /adwaita-icon-theme.deb

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
COPY ./apps/landing/package.json ./apps/landing/
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

# Copy dummy packages
COPY --from=flaresolverr-builder /*.deb /

# Install dependencies and create flaresolverr user
# You can test Chromium running this command inside the container:
#    xvfb-run -s "-screen 0 1600x1200x24" chromium --no-sandbox
# The error traces is like this: "*** stack smashing detected ***: terminated"
# To check the package versions available you can use this command:
#    apt-cache madison chromium
WORKDIR /app

RUN dpkg -i /libgl1-mesa-dri.deb \
    && dpkg -i /adwaita-icon-theme.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends chromium chromium-common chromium-driver xvfb dumb-init gosu \
        procps curl vim xauth \
        git python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /usr/lib/x86_64-linux-gnu/libmfxhw* \
    && rm -f /usr/lib/x86_64-linux-gnu/mfx/* \
    && useradd --home-dir /app --shell /bin/sh flaresolverr \
    && mv /usr/bin/chromedriver chromedriver \
    && mkdir /config \
    && git clone --depth 1 https://github.com/FlareSolverr/FlareSolverr.git /tmp/flaresolverr \
    && cp -R /tmp/flaresolverr/src/* /app/ \
    && cp /tmp/flaresolverr/requirements.txt /app/ \
    && cp /tmp/flaresolverr/package.json /package.json \
    && python3 -m venv /opt/flaresolverr-venv \
    && /opt/flaresolverr-venv/bin/pip install --no-cache-dir -r /app/requirements.txt \
    && rm -rf /root/.cache /tmp/flaresolverr \
    && mkdir -p "/app/.config/chromium/Crash Reports/pending" \
    && chown -R flaresolverr:flaresolverr /app /config

VOLUME /config

WORKDIR /lnovel

# 安装 Chromium 及其所需的系统依赖 (System Deps)
# --with-deps 会自动运行 apt-get 安装 libnss3, libatk 等库
# 运行完后清理 apt 缓存以减小体积
RUN npx playwright install chromium --with-deps && \
    rm -rf /var/lib/apt/lists/*

# Declare args
ARG PORT APP_HOST
ENV HOST=0.0.0.0 PORT=${PORT} APP_HOST=${APP_HOST} \
    FOLO=1 \
    FOLLOW_USER_ID=41508082357911552 \
    DATABASE_FILE=/data/sqlite.db \
    CHROMIUM_USER_DIR=/data/profile \
    FLARESOLVERR_URL=http://0.0.0.0:8191/v1

# Start the server by default, this can be overwritten at runtime
EXPOSE ${PORT} 8191 8192

# dumb-init avoids zombie chromium processes
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD [ "sh", "apps/server/start.sh" ]
