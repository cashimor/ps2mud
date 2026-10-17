# VPS deployment

Target: `https://vps.mosha.net/ps2mud/` on the existing Ubuntu 22.04 VPS. The game runs as `chatgpt` on loopback ports 15318 (Pike) and 8080 (Node gateway). Apache alone exposes the browser and API over HTTPS. The existing site, Python service, and port 6200 are not changed.

The local `Client/`, `Server/players/`, account database, keys, and generated assets remain outside Git. The staged Pike archive excludes all player saves and mutable `.o` data, so the VPS starts with fresh characters. The browser build uses `PUBLIC_BASE_PATH=/ps2mud/`; the gateway uses `PUBLIC_ORIGIN=https://vps.mosha.net`.

## Current deployment

The `chatgpt` home has the private Pike 8.0.1738 package, Node 24.22.0 binary, clean generated Pike runtime, compiled gateway and production dependencies, and browser build. The downloaded Pike package is unpacked under `runtime/pike-package/`; it does not replace system packages. The Pike and gateway systemd units are enabled and running. The public HTTPS page, scene assets, account creation, authenticated WebSocket game connection, and logout were verified after installation.

## Installation and maintenance

Review [install-root.sh](install-root.sh), [apache-ps2mud.conf](apache-ps2mud.conf), and the two service files. Then, as an account with sudo rights on the VPS, run:

```sh
sudo sh /home/chatgpt/ps2mud/deploy/vps/install-root.sh
```

The script enables Apache's proxy modules, adds one include line inside the existing HTTPS virtual host, backs up that file, checks Apache syntax, installs and starts the two systemd services, checks the gateway health endpoint, and reloads Apache. It does not change the HTTP redirect, other listeners, or the other services. If Apache syntax fails, it restores the virtual host backup without reloading.

The installation has completed. The initial gateway health request may report a connection refusal while Node starts; the installer retries and only succeeds after it receives `{"ok":true}`. If a service later fails, inspect `sudo journalctl -u ps2mud-pike -u ps2mud-gateway -n 80 --no-pager`. Character data to back up together: `private/`, `.runtime/pike/players/`, `.runtime/pike/board.o`, and `.runtime/pike/mail.o`. Stop both services cleanly before a file-level backup so Pike saves loaded players and SQLite closes its WAL. Automated offsite backup is still to be configured before relying on persistent characters.
