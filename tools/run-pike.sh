#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root/.runtime/pike"
printf '%s\n' "$$" > server.pid
exec pike servd.pike "${1:-15318}"
