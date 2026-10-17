#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
port=${1:-15318}
pid_file="$project_root/.runtime/pike/server.pid"

if [ ! -f "$pid_file" ]; then
  echo "No managed Pike PID file. Leave the current server running; its older code cannot save inventory on shutdown." >&2
  exit 1
fi
pid=$(cat "$pid_file")
case "$pid" in
  ''|*[!0-9]*) echo "Invalid Pike PID file; server left running." >&2; exit 1 ;;
esac
command_line=$(tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
case "$command_line" in
  *"pike servd.pike $port"*) ;;
  *) echo "PID does not identify the expected Pike server; server left running." >&2; exit 1 ;;
esac

echo "Requesting Pike to save all players and stop..."
kill -TERM "$pid"
attempt=0
while kill -0 "$pid" 2>/dev/null; do
  state=$(ps -p "$pid" -o stat= 2>/dev/null || true)
  case "$state" in Z*) break ;; esac
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 150 ]; then
    echo "Pike did not exit after saving. Restart cancelled; server left running." >&2
    exit 1
  fi
  sleep 0.2
done

rm -f "$pid_file"
python3 "$project_root/tools/prepare_pike.py"
echo "Player saves complete. Starting Pike on port $port..."
exec sh "$project_root/tools/run-pike.sh" "$port"
