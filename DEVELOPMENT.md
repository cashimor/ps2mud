# Local development environment

The browser client, Pike server, and Node account/WebSocket gateway run locally.

## Installed runtimes

- Ubuntu WSL: Pike 8.0.1738 from Ubuntu `pike8.0-core`.
- Local ignored tool: Node.js 24.22.0 LTS and npm 11.19.1 in `.tools/node-v24.22.0-linux-x64/`. The archive was checked against Node's `SHASUMS256.txt`.

The original `Client/` and `Server/` directories are left untouched and ignored by Git. `.runtime/pike/` is a generated compatibility copy. `tools/prepare_pike.py` excludes the original `Server/players/` directory, converts old Pike array declarations, supplies removed helpers, uses a relative player directory, and binds the listener to `127.0.0.1`. It also removes login-command logging, handles a disconnect before login, bounds the top-player list when there are fewer than ten characters, and accepts full inventory item names so a usable stick can be distinguished from a burnt one. The generated copy and its test characters are ignored by Git.

The compatibility copy also saves carried items, their relevant state (including potion contents and stick fuel), and worn equipment. Player writes replace the old save file only after a complete temporary write. A disconnect saves that player; Pike's SIGTERM handler saves every loaded player and exits only if all saves succeed. The original server saved character attributes hourly but converted inventory into partial gold value, so its old saves cannot restore carried items.

For a managed server started with `tools/run-pike.sh`, restart from the project root with `wsl -d Ubuntu -- sh tools/restart-pike.sh 15318`. This requests a save through SIGTERM, waits for Pike to exit, regenerates the compatibility copy, and starts the new server in the foreground. If saving fails or the server does not exit, the script stops without launching a replacement. The server that was already running before this change has no managed PID file or save handler; leave it running until its live inventory has been migrated separately. Do not stop it with an ordinary SIGTERM expecting inventory to be preserved.

## Reproduce the server test

From the project root in PowerShell:

```powershell
wsl -d Ubuntu -- python3 tools/prepare_pike.py
wsl -d Ubuntu -- sh tools/node-env.sh node --version
wsl -d Ubuntu -- sh tools/node-env.sh npm --version
wsl -d Ubuntu -- sh tools/run-pike.sh 15318
```

Keep the last command running. In a second terminal:

```powershell
wsl -d Ubuntu -- python3 tools/probe_pike.py 15318
wsl -d Ubuntu -- python3 tools/probe_pike_login.py 15318
wsl -d Ubuntu -- sh tools/node-env.sh node tools/probe_node_tcp.mjs 15318
```

Expected results: `991 Not yet logged in.`, a generated character with both `welcome=True` and `description_end=True`, and another `991 Not yet logged in.` from Node. Stop the foreground server with Ctrl+C.

## Current limits

- The test proves startup, TCP connection, login, and an initial room snapshot. It does not validate all rooms or commands.
- The gateway provides registration, Argon2id password hashes, sessions, and a WebSocket bridge. Run it in a second PowerShell terminal after starting Pike:

  ```powershell
  wsl -d Ubuntu -- sh tools/node-env.sh npm ci --prefix gateway
  wsl -d Ubuntu -- sh tools/node-env.sh npm run build --prefix gateway
  wsl -d Ubuntu -- sh tools/node-env.sh npm start --prefix gateway
  ```

  With both servers running, `wsl -d Ubuntu -- sh tools/node-env.sh npm run test:integration --prefix gateway` checks registration, password storage, a room snapshot, a game command, the login guard, and logout. It creates a disposable local character in the ignored runtime.
- The gateway listens on `127.0.0.1:8080` and expects browser origin `http://localhost:8080` by default. `PORT`, `PIKE_PORT`, and `PUBLIC_ORIGIN` configure it. The Pike socket also listens only on `127.0.0.1`. Registration is `POST /api/register` with JSON `{ "name": "Example", "password": "long password", "gender": 1 }`; login and logout use `/api/login` and `/api/logout`. The `HttpOnly` session cookie authenticates `GET /api/me` and WebSocket `/api/game`. The WebSocket accepts `{ "type": "command", "line": "who" }` and sends `{ "type": "line", "line": "016 SIZE 1" }` messages. The gateway sends Pike's login command internally; browsers cannot send it. Registration also reserves names already present in the legacy `Server/players/` directory; `LEGACY_PLAYERS_DIR` can point to a different snapshot.
- For the browser preview at `http://127.0.0.1:5173/`, start the gateway with `PUBLIC_ORIGIN=http://127.0.0.1:5173` and the browser's Vite server. Vite forwards `/api` HTTP and WebSocket traffic to the gateway. In PowerShell, the gateway command is:

  Generate browser assets first with `wsl -d Ubuntu -- python3 tools/build_browser_assets.py`. This also wraps the original 11,025 Hz sound samples from `Server/audio/` as WAV files under the ignored `browser/public/assets/audio/` directory.

  The browser ports the original two-voice music synthesizer in `browser/public/music-worklet.js`. It plays Pike's `023 MUSIC` tune numbers and updates music immediately when the player enters the road, green, or eastern music area. The music checkbox controls it independently of effects; Preview plays tune 0 until stopped.

  ```powershell
  wsl -d Ubuntu -- sh -lc 'PUBLIC_ORIGIN=http://127.0.0.1:5173 sh tools/node-env.sh npm start --prefix gateway'
  ```

  Then run `wsl -d Ubuntu -- sh tools/node-env.sh npm run dev --prefix browser` in a third terminal. Open `http://127.0.0.1:5173/`, create a character, and hold W/S or the up/down arrows to move smoothly through Pike-approved grid steps. Q/E turn the character, and F activates an offered interaction. The live panel also shows Pike text messages and lets players request inventory, use listed items, character details, and the online player list. New player files contain a private gateway credential and the matching original character model and texture. The browser positions characters, monsters, items, spells, and room objects from Pike's `003 LOCATE` replies. It applies `014`/`018` appearance changes and `015` removals. All 32 supplied village rooms are converted, including the new-character spawn room and its neighbors. For a proxy integration test, run `wsl -d Ubuntu -- sh -lc 'TEST_ORIGIN=http://127.0.0.1:5173 sh tools/node-env.sh npm run test:integration --prefix gateway'`.
- A connected standard-mapped gamepad can also control the character. Press a controller button while the game tab is active to expose it to the browser; the page reports connection status and lists the layout. `wsl -d Ubuntu -- sh tools/node-env.sh node browser/test/gamepad.test.mjs` verifies input normalization without hardware.
- `private/accounts.sqlite`, `private/pike-secret.key`, and `.runtime/pike/players/` must be backed up together. Losing the key makes generated characters inaccessible to the gateway. These paths are ignored by Git. The key is a local development secret, not a substitute for HTTPS when the gateway is later exposed through a reverse proxy.

For a spell protocol test without changing Ashart or interrupting the live server, run `wsl -d Ubuntu -- python3 tools/test-spell-live.py`. It copies the prepared Pike runtime into a temporary directory, starts a level-5 character outdoors on a temporary port, verifies the magic missile messages, then removes the test runtime.
- The original Pike code still contains private character saves and plaintext password handling. Do not expose its listener or add the original directories to Git.
