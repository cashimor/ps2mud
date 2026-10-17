#!/bin/sh
set -eu

root=/home/chatgpt/ps2mud
pike_pid=
gateway_pid=
cleanup() {
  if [ -n "$gateway_pid" ]; then kill -TERM "$gateway_pid" 2>/dev/null || :; fi
  if [ -n "$pike_pid" ]; then kill -TERM "$pike_pid" 2>/dev/null || :; fi
  if [ -n "$gateway_pid" ]; then wait "$gateway_pid" 2>/dev/null || :; fi
  if [ -n "$pike_pid" ]; then wait "$pike_pid" 2>/dev/null || :; fi
}
trap cleanup EXIT INT TERM

sh "$root/deploy/vps/run-pike.sh" > "$root/runtime/pike-smoke.log" 2>&1 &
pike_pid=$!
python3 - <<'PY'
import socket
import time

for attempt in range(50):
    try:
        socket.create_connection(("127.0.0.1", 15318), timeout=0.2).close()
        break
    except OSError:
        time.sleep(0.2)
else:
    raise SystemExit("Pike did not start")
PY
PUBLIC_ORIGIN=https://vps.mosha.net PORT=8080 PIKE_PORT=15318 \
  "$root/runtime/node" "$root/gateway/dist/server.js" > "$root/runtime/gateway-smoke.log" 2>&1 &
gateway_pid=$!

ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 2 http://127.0.0.1:8080/health; then ready=1; break; fi
  sleep 1
done
test "$ready" -eq 1
printf '\nPrivate services listen on:\n'
ss -ltn | grep -E ':(15318|8080) '
