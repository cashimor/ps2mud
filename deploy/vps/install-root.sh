#!/bin/sh
set -eu

root=/home/chatgpt/ps2mud
vhost=/etc/apache2/sites-available/000-default-le-ssl.conf
include='Include /etc/apache2/conf-available/ps2mud.conf'

if [ "$(id -u)" -ne 0 ]; then
  echo 'Run this script with sudo.' >&2
  exit 1
fi
if [ ! -f "$vhost" ] || ! grep -Eq '^[[:space:]]*ServerName[[:space:]]+vps\.mosha\.net' "$vhost"; then
  echo 'The expected vps.mosha.net HTTPS virtual host was not found.' >&2
  exit 1
fi
for file in "$root/runtime/node" "$root/runtime/pike-package/usr/bin/pike8.0" \
            "$root/gateway/dist/server.js" "$root/site/index.html"; do
  if [ ! -f "$file" ]; then echo "Deployment file missing: $file" >&2; exit 1; fi
done

install -m 644 "$root/deploy/vps/apache-ps2mud.conf" /etc/apache2/conf-available/ps2mud.conf
a2enmod proxy proxy_http proxy_wstunnel

backup=
if ! grep -Fq "$include" "$vhost"; then
  backup="$vhost.ps2mud.$(date +%Y%m%d%H%M%S).bak"
  cp -p "$vhost" "$backup"
  python3 - "$vhost" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
marker = '</VirtualHost>'
if text.count(marker) != 1:
    raise SystemExit('Expected exactly one HTTPS VirtualHost')
path.write_text(text.replace(marker,
    '    Include /etc/apache2/conf-available/ps2mud.conf\n' + marker, 1))
PY
fi
if ! apache2ctl configtest; then
  if [ -n "$backup" ]; then cp -p "$backup" "$vhost"; fi
  echo 'Apache configuration failed; existing virtual host restored.' >&2
  exit 1
fi

install -m 644 "$root/deploy/vps/ps2mud-pike.service" /etc/systemd/system/ps2mud-pike.service
install -m 644 "$root/deploy/vps/ps2mud-gateway.service" /etc/systemd/system/ps2mud-gateway.service
systemctl daemon-reload
systemctl enable --now ps2mud-pike.service
systemctl enable --now ps2mud-gateway.service
systemctl is-active --quiet ps2mud-pike.service
curl -fsS --max-time 5 --retry 10 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1:8080/health
systemctl reload apache2
printf '\nPS2MUD is configured at https://vps.mosha.net/ps2mud/\n'
