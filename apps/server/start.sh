#!/usr/bin/env sh
set -eu

FLARESOLVERR_PY=/opt/flaresolverr-venv/bin/python
FLARESOLVERR_STDOUT=/proc/1/fd/1
FLARESOLVERR_STDERR=/proc/1/fd/2
FLARESOLVERR_HOST=0.0.0.0
FLARESOLVERR_PORT=8191
FLARESOLVERR_HEALTH_URL=http://127.0.0.1:${FLARESOLVERR_PORT}/health
FLARESOLVERR_WAIT_MAX=60

export TZ=Asia/Shanghai
export LANG=zh_CN
export LOG_LEVEL=debug

if [ -x "$FLARESOLVERR_PY" ]; then
  if command -v gosu >/dev/null 2>&1; then
    env HOME=/app XDG_RUNTIME_DIR=/tmp HOST="$FLARESOLVERR_HOST" PORT="$FLARESOLVERR_PORT" \
      gosu flaresolverr "$FLARESOLVERR_PY" -u /app/flaresolverr.py \
        >>"$FLARESOLVERR_STDOUT" 2>>"$FLARESOLVERR_STDERR" &
  else
    env HOME=/app XDG_RUNTIME_DIR=/tmp HOST="$FLARESOLVERR_HOST" PORT="$FLARESOLVERR_PORT" \
      "$FLARESOLVERR_PY" -u /app/flaresolverr.py \
        >>"$FLARESOLVERR_STDOUT" 2>>"$FLARESOLVERR_STDERR" &
  fi
else
  if command -v gosu >/dev/null 2>&1; then
    env HOME=/app XDG_RUNTIME_DIR=/tmp HOST="$FLARESOLVERR_HOST" PORT="$FLARESOLVERR_PORT" \
      gosu flaresolverr python3 -u /app/flaresolverr.py \
        >>"$FLARESOLVERR_STDOUT" 2>>"$FLARESOLVERR_STDERR" &
  else
    env HOME=/app XDG_RUNTIME_DIR=/tmp HOST="$FLARESOLVERR_HOST" PORT="$FLARESOLVERR_PORT" \
      python3 -u /app/flaresolverr.py \
        >>"$FLARESOLVERR_STDOUT" 2>>"$FLARESOLVERR_STDERR" &
  fi
fi

FLARESOLVERR_PID=$!
i=0
while [ "$i" -lt "$FLARESOLVERR_WAIT_MAX" ]; do
  if ! kill -0 "$FLARESOLVERR_PID" 2>/dev/null; then
    echo "flaresolverr exited before becoming healthy" >&2
    exit 1
  fi
  if curl -fsS "$FLARESOLVERR_HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$i" -ge "$FLARESOLVERR_WAIT_MAX" ]; then
  echo "flaresolverr health check timeout after ${FLARESOLVERR_WAIT_MAX}s" >&2
  exit 1
fi

exec node apps/server/cli.mjs start
