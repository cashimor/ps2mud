#!/bin/sh
set -eu

root=/home/chatgpt/ps2mud
test "$(id -un)" = chatgpt
mkdir -p "$root/site" "$root/gateway" "$root/private" "$root/.runtime/pike/players"
tar -xzf "$root/runtime/deploy-node.tar.gz" -C "$root/runtime"
tar -xzf "$root/runtime/deploy-pike.tar.gz" -C "$root/.runtime/pike"
tar -xzf "$root/runtime/deploy-site.tar.gz" -C "$root/site"
tar -xzf "$root/runtime/deploy-gateway.tar.gz" -C "$root"
chmod 700 "$root/private" "$root/.runtime/pike/players"
chmod 755 "$root" "$root/site"

"$root/runtime/node" --version
PATH="$root/runtime:$PATH" npm ci --omit=dev --prefix "$root/gateway"
