#!/bin/sh
set -eu

root=/home/chatgpt/ps2mud
pike_lib="$root/runtime/pike-package/usr/lib/pike8.0"
export PIKE_MASTER="$pike_lib/master.pike"
export PIKE_MODULE_PATH="$pike_lib/modules"
cd "$root/.runtime/pike"
exec "$root/runtime/pike-package/usr/bin/pike8.0" servd.pike 15318
