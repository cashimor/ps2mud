# PS2MUD browser version

This repository contains the new browser client, the Node.js account and WebSocket gateway, asset conversion tools, and development notes. The original Pike game server remains the authority for movement and game rules. The earlier Python prototype is preserved in [`unused/`](unused/).

The original PS2 client and Pike server snapshot, player saves, account database, keys, and converted game assets are intentionally **not** in this repository. Keep those files private. A fresh checkout needs an authorized copy of the original `Client/` and `Server/` trees before the asset conversion and Pike preparation steps in [DEVELOPMENT.md](DEVELOPMENT.md) can run. Never commit `Server/players/` or the generated `.runtime/`, `private/`, and `browser/public/assets/` directories.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design, [DEVELOPMENT.md](DEVELOPMENT.md) for local setup, [deploy/vps/README.md](deploy/vps/README.md) for the VPS deployment, and [IMPLEMENTATION_GAPS.md](IMPLEMENTATION_GAPS.md) for current limitations.
