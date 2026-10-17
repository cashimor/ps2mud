#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PATH="$project_root/.tools/node-v24.22.0-linux-x64/bin:$PATH"
export PATH
exec "$@"
